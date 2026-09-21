import { getSocketURL } from '@/components/shared/utils/config/config';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { waitFor } from '@testing-library/react';
import { acquireSession, createBroker } from './broker';
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
    jest.useRealTimers();
});
const flush = async (times = 10) => {
    for (let i = 0; i < times; i++) await Promise.resolve();
};
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
test('times out if the trading connection never opens', async () => {
    jest.useFakeTimers();
    const connected = createBroker();
    await flush();
    expect(Socket.last).toBeTruthy();
    const closeSpy = Socket.last!.close;
    const assertion = expect(connected).rejects.toThrow('Trading connection timed out.');
    await jest.advanceTimersByTimeAsync(12000);
    await assertion;
    expect(closeSpy).toHaveBeenCalled();
});
test('rejects when the socket errors before opening', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onerror?.();
    await expect(connected).rejects.toThrow('Deriv trading connection failed.');
});
test('a mid-session disconnect rejects every pending request and blocks new ones', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const pendingQuote = broker.quote('DIGITEVEN', 'R_75', defaults);
    await Promise.resolve();
    Socket.last!.readyState = 3;
    Socket.last!.onclose?.();
    await expect(pendingQuote).rejects.toThrow('Connection lost. Check pending contracts before restarting.');
    await expect(broker.buy('p', 1)).rejects.toThrow('Account, login, or connection changed');
});
test('ignores malformed and unmatched socket messages without crashing pending requests', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const quote = broker.quote('DIGITEVEN', 'R_75', defaults);
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({ data: 'not-json{{' });
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: 999999, proposal: { id: 'other', ask_price: 1 } }) });
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: payload.req_id, proposal: { id: 'p', ask_price: 1 } }) });
    await expect(quote).resolves.toEqual({ id: 'p', price: 1 });
    broker.close();
});
test('surfaces a generic decline when Deriv rejects a request', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const quote = broker.quote('DIGITEVEN', 'R_75', defaults);
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: payload.req_id, error: { code: 'SomeError' } }) });
    await expect(quote).rejects.toThrow('Deriv declined the request.');
    broker.close();
});
test('times out a request that never gets a response from Deriv', async () => {
    jest.useFakeTimers();
    const connected = createBroker();
    await flush();
    Socket.last!.onopen?.();
    await flush();
    const broker = await connected;
    const quote = broker.quote('DIGITEVEN', 'R_75', defaults);
    const assertion = expect(quote).rejects.toThrow('A purchase may have completed; reconcile before restarting.');
    await jest.advanceTimersByTimeAsync(12000);
    await assertion;
});
test('rejects a request the socket refuses to send', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    Socket.last!.send = jest.fn(() => {
        throw new Error('send failed');
    });
    await expect(broker.quote('DIGITEVEN', 'R_75', defaults)).rejects.toThrow('Request could not be sent.');
    broker.close();
});
test('treats a buy response with no contract id as an unknown outcome', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const buy = broker.buy('p', 1);
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: payload.req_id, buy: {} }) });
    await expect(buy).rejects.toThrow('Purchase outcome unknown. Reconcile in Deriv before continuing.');
    broker.close();
});
test('gives up on settlement after the confirmation deadline passes', async () => {
    jest.useFakeTimers();
    const connected = createBroker();
    await flush();
    Socket.last!.onopen?.();
    await flush();
    const broker = await connected;
    Socket.last!.send = jest.fn(data => {
        const payload = JSON.parse(data);
        Socket.last!.onmessage?.({
            data: JSON.stringify({
                req_id: payload.req_id,
                proposal_open_contract: { contract_id: payload.contract_id, is_sold: 0, profit: 0 },
            }),
        });
    });
    const settlement = broker.settle('123');
    const assertion = expect(settlement).rejects.toThrow(
        'Settlement not confirmed in time. Reconcile before restarting.'
    );
    await jest.advanceTimersByTimeAsync(121000);
    await assertion;
});
test('refuses to connect if the account is switched mid-handshake', async () => {
    (getSocketURL as jest.Mock).mockImplementation(async () => {
        localStorage.setItem('active_loginid', 'real-2');
        return 'wss://api.derivws.com/trading/v1/options/ws/demo?otp=test';
    });
    await expect(createBroker()).rejects.toThrow('Account changed during connection. Try again.');
    expect(Socket.last).toBeUndefined();
});
test('rejects a quote response with no proposal id', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const quote = broker.quote('DIGITEVEN', 'R_75', defaults);
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: payload.req_id, proposal: {} }) });
    await expect(quote).rejects.toThrow('No valid proposal returned.');
    broker.close();
});
test('rejects a settlement status for a different contract id', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const settlement = broker.settle('123');
    await Promise.resolve();
    const payload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({
        data: JSON.stringify({
            req_id: payload.req_id,
            proposal_open_contract: { contract_id: 'different', is_sold: 1, profit: 1 },
        }),
    });
    await expect(settlement).rejects.toThrow('Contract status could not be verified.');
    broker.close();
});
test('resolves a successful buy and settlement with the confirmed values', async () => {
    const connected = createBroker();
    await waitFor(() => expect(Socket.last).toBeTruthy());
    Socket.last!.onopen?.();
    const broker = await connected;
    const buy = broker.buy('p', 1);
    await Promise.resolve();
    const buyPayload = JSON.parse(Socket.last!.send.mock.calls[0][0]);
    Socket.last!.onmessage?.({ data: JSON.stringify({ req_id: buyPayload.req_id, buy: { contract_id: 555 } }) });
    await expect(buy).resolves.toBe('555');
    const settlement = broker.settle('555');
    await Promise.resolve();
    const settlePayload = JSON.parse(Socket.last!.send.mock.calls[1][0]);
    Socket.last!.onmessage?.({
        data: JSON.stringify({
            req_id: settlePayload.req_id,
            proposal_open_contract: { contract_id: '555', is_sold: 1, profit: 1.23 },
        }),
    });
    await expect(settlement).resolves.toBe(1.23);
    broker.close();
});
describe('acquireSession', () => {
    const original_locks = navigator.locks;
    afterEach(() => {
        Object.defineProperty(navigator, 'locks', { value: original_locks, configurable: true });
    });
    test('fails closed when the browser has no Web Locks support', async () => {
        Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
        await expect(acquireSession('demo-1')).rejects.toThrow('does not support the required trading-session lock');
    });
    test('refuses a second concurrent session for the same account', async () => {
        Object.defineProperty(navigator, 'locks', {
            configurable: true,
            value: { request: jest.fn((_name, _opts, callback) => callback(null)) },
        });
        await expect(acquireSession('demo-1')).rejects.toThrow('Auto Trader is already active in another tab.');
    });
    test('grants the lock and returns a release function', async () => {
        Object.defineProperty(navigator, 'locks', {
            configurable: true,
            value: {
                request: jest.fn((_name, _opts, callback) => {
                    const held = callback({});
                    return held;
                }),
            },
        });
        const unlock = await acquireSession('demo-1');
        expect(typeof unlock).toBe('function');
        unlock();
    });
});
