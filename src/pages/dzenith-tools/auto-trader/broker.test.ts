import { waitFor } from '@testing-library/react';
import { getSocketURL } from '@/components/shared/utils/config/config';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { createBroker } from './broker';
import { defaults } from './engine';
jest.mock('@/components/shared/utils/config/config', () => ({ getSocketURL: jest.fn() }));
jest.mock('@/services/oauth-token-exchange.service', () => ({
    OAuthTokenExchangeService: { getAuthInfo: () => ({ access_token: 'test-only-token' }) },
}));
jest.mock('@/services/derivws-accounts.service', () => ({ DerivWSAccountsService: { fetchAccountsList: jest.fn() } }));
jest.mock('@/external/bot-skeleton', () => ({ api_base: { is_running: false } }));
class Socket {
    static OPEN = 1;
    static last: Socket | undefined;
    readyState = 1;
    onopen?: () => void;
    onclose?: () => void;
    onerror?: () => void;
    onmessage?: (e: { data: string }) => void;
    send = jest.fn();
    close = jest.fn(() => {
        this.readyState = 3;
        this.onclose?.();
    });
    constructor() {
        Socket.last = this;
    }
}
const original = global.WebSocket;
beforeEach(() => {
    global.WebSocket = Socket as unknown as typeof WebSocket;
    Socket.last = undefined;
    localStorage.clear();
    localStorage.setItem('active_loginid', 'demo-1');
    (DerivWSAccountsService.fetchAccountsList as jest.Mock).mockResolvedValue([
        { account_id: 'demo-1', account_type: 'demo', currency: 'USD' },
    ]);
    (getSocketURL as jest.Mock).mockResolvedValue('wss://api.derivws.com/trading/v1/options/ws/demo?otp=test');
});
afterEach(() => {
    Socket.last?.close();
    global.WebSocket = original;
});
test('verifies account, quotes with the Options schema, and never buys on connect', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    expect(broker.account.type).toBe('demo');
    expect(Socket.last!.send).not.toHaveBeenCalled();
    const quote = broker.quote('DIGITEVEN', 'R_75', defaults);
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    expect(payload).toMatchObject({
        proposal: 1,
        underlying_symbol: 'R_75',
        duration_unit: 't',
        amount: 1,
        currency: 'USD',
    });
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: payload.req_id, proposal: { id: 'p', ask_price: 1 } }) });
    await expect(quote).resolves.toEqual({ id: 'p', price: 1 });
    localStorage.setItem('active_loginid', 'real-2');
    expect(broker.ready()).toBe(false);
    await expect(broker.buy('p', 1)).rejects.toThrow('Account, login, or connection changed');
    broker.close();
});
test('rejects fallback public socket and unverified account', async () => {
    (getSocketURL as jest.Mock).mockResolvedValue('wss://api.derivws.com/trading/v1/options/ws/public');
    await expect(createBroker()).rejects.toThrow('authenticated');
    expect(Socket.last).toBeUndefined();
    (DerivWSAccountsService.fetchAccountsList as jest.Mock).mockResolvedValue([]);
    await expect(createBroker()).rejects.toThrow('did not verify');
});
test('does not reconcile a sold contract with missing profit', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const settlement = broker.settle('123');
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({
        data: JSON.stringify({ req_id: payload.req_id, proposal_open_contract: { contract_id: '123', is_sold: 1 } }),
    });
    await expect(settlement).rejects.toThrow('profit could not be verified');
    broker.close();
});
