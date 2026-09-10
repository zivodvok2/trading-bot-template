import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Dashboard from '../dashboard/command-center';
import ChunkLoader from '../../components/loader/chunk-loader';
import { LiveDigits, LiveMarketProvider } from './live-market';
class Socket {
    static OPEN = 1;
    static last: Socket;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    close = jest.fn();
    send = jest.fn();
    constructor() {
        Socket.last = this;
    }
}
const original = global.WebSocket;
beforeEach(() => {
    jest.useFakeTimers();
    global.WebSocket = Socket as unknown as typeof WebSocket;
});
afterEach(() => {
    global.WebSocket = original;
    jest.useRealTimers();
});
test('shows exactly ten digit balls and marks the newest', () => {
    const { unmount } = render(
        <LiveMarketProvider>
            <LiveDigits />
        </LiveMarketProvider>
    );
    act(() =>
        Socket.last.onmessage?.({
            data: JSON.stringify({
                msg_type: 'history',
                pip_size: 2,
                history: {
                    prices: Array.from({ length: 12 }, (_, i) => 10 + i / 100),
                    times: Array.from({ length: 12 }, (_, i) => i),
                },
            }),
        })
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('listitem', { name: '1, latest' })).toHaveClass('dz-digit-ball--latest');
    unmount();
});
test('landing actions navigate through the host tab callback', () => {
    const navigate = jest.fn();
    const { unmount } = render(<Dashboard handleTabChange={navigate} />);
    fireEvent.click(screen.getByText(/Enter the live desk/));
    expect(navigate).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByText('Open Bot Builder'));
    expect(navigate).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByText(/Copy trading setup/));
    expect(navigate).toHaveBeenLastCalledWith(9);
    unmount();
});
test('loader offers recovery without pretending to finish', () => {
    const { unmount } = render(<ChunkLoader message='Initializing Deriv Bot account...' />);
    expect(screen.getByText('Connecting to Deriv')).toBeTruthy();
    expect(screen.queryByText(/Retry connection/)).toBeNull();
    act(() => jest.advanceTimersByTime(15000));
    expect(screen.getByText('The link is taking longer.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry connection/ })).toBeTruthy();
    unmount();
});
