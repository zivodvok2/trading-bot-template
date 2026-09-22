import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiTraderFab from './ai-trader-fab';

jest.mock('@/pages/dzenith-tools/auto-trader/broker', () => ({
    createBroker: jest.fn(),
    acquireSession: jest.fn(),
    pendingKey: (id: string) => `test-pending-${id}`,
}));
jest.mock('@/pages/dzenith-tools/live-market', () => ({
    MARKETS: [
        ['R_75', 'Volatility 75 Index'],
        ['R_100', 'Volatility 100 Index'],
    ],
    useTickFeed: () => ({
        market: 'R_75',
        status: 'Live',
        received: Date.now(),
        precision: 2,
        ticks: Array.from({ length: 60 }, (_, i) => ({ quote: 10.02, epoch: i + 1 })),
        reconnect: jest.fn(),
    }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createBroker, acquireSession } = require('@/pages/dzenith-tools/auto-trader/broker');
const buy = jest.fn(async () => 'test-contract');

function configure(type: 'demo' | 'real' = 'demo') {
    (createBroker as jest.Mock).mockResolvedValue({
        account: { id: 'account-1', type, currency: 'USD' },
        ready: () => true,
        quote: jest.fn(async () => ({ id: 'test-proposal', price: 1 })),
        buy,
        settle: jest.fn(async () => 0.5),
        close: jest.fn(),
    });
    (acquireSession as jest.Mock).mockResolvedValue(jest.fn());
}

beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
});
afterEach(() => {
    jest.restoreAllMocks();
});

test('a single click arms a demo session with no confirmation step', async () => {
    configure('demo');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Auto Trader' })).toBeTruthy());
    expect(buy).not.toHaveBeenCalled();
    unmount();
});

test('real money requires one explicit confirming tap before arming', async () => {
    configure('real');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await screen.findByText(/Real funds are at risk\./);
    expect(buy).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByText('Confirm & start real trading')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Auto Trader' })).toBeTruthy());
    unmount();
});

test('canceling the real-money confirmation arms nothing', async () => {
    configure('real');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await screen.findByText(/Real funds are at risk\./);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Real funds are at risk\./)).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Auto Trader' })).toBeTruthy();
    unmount();
});

test('an unresolved pending purchase blocks a new session', async () => {
    configure('demo');
    localStorage.setItem('test-pending-account-1', 'unknown');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await screen.findByText(/No contract ID received/);
    expect(screen.getByRole('button', { name: 'Start Auto Trader' })).toBeTruthy();
    expect(buy).not.toHaveBeenCalled();
    unmount();
});

test('clicking while armed stops the session', async () => {
    configure('demo');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Auto Trader' })).toBeTruthy());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop Auto Trader' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Auto Trader' })).toBeTruthy());
    unmount();
});

test('reconciles a known pending contract and clears the marker', async () => {
    configure('demo');
    localStorage.setItem('test-pending-account-1', 'contract-42');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await screen.findByText(/Unresolved purchase: contract contract-42\./);
    await act(async () => fireEvent.click(screen.getByText('Check settlement')));
    await waitFor(() => expect(screen.getByText(/Contract contract-42 is settled: 0.50\./)).toBeTruthy());
    expect(localStorage.getItem('test-pending-account-1')).toBeNull();
    unmount();
});

test('refuses to arm without a fresh, sufficient market sample', async () => {
    configure('demo');
    const liveMarket = require('@/pages/dzenith-tools/live-market');
    jest.spyOn(liveMarket, 'useTickFeed').mockReturnValue({
        market: 'R_75',
        status: 'Connecting',
        received: 0,
        precision: null,
        ticks: [],
        reconnect: jest.fn(),
    });
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await screen.findByText('Wait for a complete, fresh market sample before arming.');
    expect(screen.getByRole('button', { name: 'Start Auto Trader' })).toBeTruthy();
    expect(buy).not.toHaveBeenCalled();
    unmount();
});

test('persists settings across remounts (e.g. navigating away and back)', () => {
    const { unmount } = render(<AiTraderFab />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto Trader quick settings' }));
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'R_100' } });
    unmount();
    render(<AiTraderFab />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto Trader quick settings' }));
    expect(screen.getByLabelText('Market')).toHaveValue('R_100');
});

test('a hidden browser tab pauses new entries (visibilitychange)', async () => {
    configure('demo');
    const { unmount } = render(<AiTraderFab />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Auto Trader' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Auto Trader' })).toBeTruthy());
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Auto Trader' })).toBeTruthy());
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    unmount();
});

test('falls back to defaults when saved settings are corrupt', () => {
    localStorage.setItem('dzenith:quick-auto:settings', 'not-json{{');
    const { unmount } = render(<AiTraderFab />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto Trader quick settings' }));
    expect(screen.getByLabelText('Market')).toHaveValue('R_75');
    unmount();
});

test('the settings gear edits and persists market/stake/loss cap without starting anything', () => {
    const { unmount } = render(<AiTraderFab />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto Trader quick settings' }));
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'R_100' } });
    fireEvent.change(screen.getByLabelText('Fixed stake'), { target: { value: '3' } });
    expect(buy).not.toHaveBeenCalled();
    expect(createBroker).not.toHaveBeenCalled();
    const saved = JSON.parse(localStorage.getItem('dzenith:quick-auto:settings') || '{}');
    expect(saved.market).toBe('R_100');
    expect(saved.stake).toBe(3);
    unmount();
});
