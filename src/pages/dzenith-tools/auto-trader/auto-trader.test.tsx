import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AutoTrader from './auto-trader';
import { createBroker, acquireSession } from './broker';
jest.mock('./broker', () => ({
    createBroker: jest.fn(),
    acquireSession: jest.fn(),
    pendingKey: (id: string) => `test-pending-${id}`,
}));
jest.mock('../live-market', () => ({
    useLiveMarket: () => ({
        market: 'R_75',
        status: 'Live',
        received: Date.now(),
        precision: 2,
        ticks: Array.from({ length: 60 }, (_, i) => ({ quote: 10.02, epoch: i + 1 })),
    }),
}));
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
test('account verification does not place trades; real money requires typed consent', async () => {
    configure('real');
    const { unmount } = render(<AutoTrader />);
    fireEvent.click(screen.getByText('Verify selected Deriv account'));
    await screen.findByText(/REAL · account-1/);
    expect(buy).not.toHaveBeenCalled();
    expect(screen.getByText('Start real-money automation')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Start real-money automation')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type START REAL to enable real-money execution'), {
        target: { value: 'START REAL' },
    });
    expect(screen.getByText('Start real-money automation')).not.toBeDisabled();
    expect(buy).not.toHaveBeenCalled();
    unmount();
});
test('pending purchase blocks a new session', async () => {
    configure();
    localStorage.setItem('test-pending-account-1', 'unknown');
    const { unmount } = render(<AutoTrader />);
    fireEvent.click(screen.getByText('Verify selected Deriv account'));
    await screen.findByText(/DEMO · account-1/);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Start demo automation')).toBeDisabled();
    expect(buy).not.toHaveBeenCalled();
    unmount();
});
test('an acknowledged demo session can arm and stop without placing a test trade', async () => {
    configure();
    const { unmount } = render(<AutoTrader />);
    fireEvent.click(screen.getByText('Verify selected Deriv account'));
    await screen.findByText(/DEMO · account-1/);
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => fireEvent.click(screen.getByText('Start demo automation')));
    await waitFor(() => expect(screen.getByText('ARMED')).toBeTruthy());
    fireEvent.click(screen.getByText('Stop new trades'));
    expect(screen.getByText('MONITOR ONLY')).toBeTruthy();
    expect(buy).not.toHaveBeenCalled();
    unmount();
});
