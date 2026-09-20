import { getSocketURL } from '@/components/shared/utils/config/config';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { api_base } from '@/external/bot-skeleton';
import type { Broker, Settings } from './engine';

export const pendingKey = (id: string) => `dzenith:auto:pending:${id}`;
type Message = {
    sell?: { sold_for: number };
    req_id?: number;
    error?: { code?: string };
    proposal?: { id: string; ask_price: number; payout?: number; longcode?: string };
    buy?: { contract_id: number | string };
    proposal_open_contract?: { is_sold: number; profit: number; contract_id: number | string; is_valid_to_sell?: number; bid_price?: number };
};
export interface TicketBroker extends Broker {
    ticket: (parameters: Record<string, unknown>) => Promise<{id:string;price:number;payout?:number;description:string}>;
    contract: (id:string) => Promise<NonNullable<Message['proposal_open_contract']>>;
    sell: (id:string) => Promise<void>;
}
export async function createBroker(): Promise<TicketBroker> {
    const auth = OAuthTokenExchangeService.getAuthInfo();
    const selected = localStorage.getItem('active_loginid');
    if (!auth?.access_token || !selected) throw new Error('Log in to Deriv and select an account first.');
    if (api_base.is_running) throw new Error('Stop Bot Builder before using Auto Trader.');
    const accounts = await DerivWSAccountsService.fetchAccountsList(auth.access_token);
    const account = accounts.find(item => item.account_id === selected);
    if (!account || !['demo', 'real'].includes(account.account_type))
        throw new Error('Deriv did not verify the selected account.');
    const url = await getSocketURL();
    if (!url || new URL(url).pathname.endsWith('/public'))
        throw new Error('An authenticated Deriv trading connection is required.');
    if (localStorage.getItem('active_loginid') !== selected)
        throw new Error('Account changed during connection. Try again.');
    const socket = new WebSocket(url);
    let sequence = 0,
        closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const pending = new Map<
        number,
        { resolve: (message: Message) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
    >();
    const opened = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Trading connection timed out.'));
            socket.close();
        }, 12000);
        socket.onopen = () => {
            clearTimeout(timer);
            resolve();
        };
        socket.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Deriv trading connection failed.'));
            socket.close();
        };
        socket.onclose = () => {
            closed = true;
            clearTimeout(timer);
            clearInterval(heartbeat);
            reject(new Error('Trading connection closed.'));
            pending.forEach(item => {
                clearTimeout(item.timer);
                item.reject(new Error('Connection lost. Check pending contracts before restarting.'));
            });
            pending.clear();
        };
    });
    socket.onmessage = event => {
        let message: Message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (!message.req_id) return;
        const item = pending.get(message.req_id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(message.req_id);
        if (message.error)
            item.reject(
                new Error('Deriv declined the request. Check account permissions, balance and contract availability.')
            );
        else item.resolve(message);
    };
    const ready = () =>
        !closed &&
        socket.readyState === WebSocket.OPEN &&
        localStorage.getItem('active_loginid') === selected &&
        Boolean(OAuthTokenExchangeService.getAuthInfo()?.access_token) &&
        !api_base.is_running;
    const request = async (payload: Record<string, unknown>) => {
        await opened;
        if (!ready()) throw new Error('Account, login, or connection changed. Session stopped.');
        return new Promise<Message>((resolve, reject) => {
            const req_id = ++sequence;
            const timer = setTimeout(() => {
                pending.delete(req_id);
                reject(
                    new Error('No response from Deriv. A purchase may have completed; reconcile before restarting.')
                );
            }, 12000);
            pending.set(req_id, { resolve, reject, timer });
            try {
                socket.send(JSON.stringify({ ...payload, req_id }));
            } catch {
                clearTimeout(timer);
                pending.delete(req_id);
                reject(new Error('Request could not be sent.'));
            }
        });
    };
    await opened;
    heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ping: 1 }));
    }, 25000);
    return {
        ticket: async parameters => {
            const response = await request({ ...parameters, proposal: 1, currency: account.currency });
            if(!response.proposal?.id || !Number.isFinite(response.proposal.ask_price) || response.proposal.ask_price<=0) throw new Error('No valid quote returned.');
            return {id:response.proposal.id,price:response.proposal.ask_price,payout:response.proposal.payout,description:response.proposal.longcode || 'Review contract settings before purchase.'};
        },
        contract: async id => {
            const response=await request({proposal_open_contract:1,contract_id:id});
            if(!response.proposal_open_contract || String(response.proposal_open_contract.contract_id)!==id) throw new Error('Contract status could not be verified.');
            return response.proposal_open_contract;
        },
        sell: async id => {
            const response=await request({sell:id,price:0});
            if(!response.sell || !Number.isFinite(response.sell.sold_for)) throw new Error('Sale not confirmed. Refresh contract status before retrying.');
        },
        account: { id: selected, type: account.account_type, currency: account.currency },
        ready,
        quote: async (contract: string, market: string, s: Settings) => {
            const response = await request({
                proposal: 1,
                amount: s.stake,
                basis: 'stake',
                contract_type: contract,
                currency: account.currency,
                duration: s.duration,
                duration_unit: 't',
                underlying_symbol: market,
            });
            if (!response.proposal?.id) throw new Error('No valid proposal returned.');
            return { id: response.proposal.id, price: Number(response.proposal.ask_price) };
        },
        buy: async (id, price) => {
            const response = await request({ buy: id, price });
            if (!response.buy?.contract_id)
                throw new Error('Purchase outcome unknown. Reconcile in Deriv before continuing.');
            return String(response.buy.contract_id);
        },
        settle: async id => {
            const deadline = Date.now() + 120000;
            while (Date.now() < deadline) {
                const response = await request({ proposal_open_contract: 1, contract_id: id });
                const contract = response.proposal_open_contract;
                if (!contract || String(contract.contract_id) !== id)
                    throw new Error('Contract status could not be verified.');
                if (contract.is_sold) {
                    if (typeof contract.profit !== 'number' || !Number.isFinite(contract.profit))
                        throw new Error('Settlement profit could not be verified.');
                    return contract.profit;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            throw new Error('Settlement not confirmed in time. Reconcile before restarting.');
        },
        close: () => {
            clearInterval(heartbeat);
            socket.close();
        },
    };
}

// Hold a browser-wide account lock for the entire session. Fail closed if unsupported.
export async function acquireSession(id: string): Promise<() => void> {
    if (!navigator.locks)
        throw new Error(
            'This browser does not support the required trading-session lock. Use a current browser on HTTPS or localhost.'
        );
    return new Promise((resolve, reject) => {
        navigator.locks
            .request(`dzenith-auto-${id}`, { ifAvailable: true }, async lock => {
                if (!lock) {
                    reject(new Error('Auto Trader is already active in another tab.'));
                    return;
                }
                await new Promise<void>(release => resolve(release));
            })
            .catch(reject);
    });
}
