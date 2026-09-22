import React from 'react';
import { act, render, screen } from '@testing-library/react';
import DZenithTools from './index';

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
    global.WebSocket = Socket as unknown as typeof WebSocket;
});
afterEach(() => {
    global.WebSocket = original;
});

test('accumulators tab shows digit balls and a price chart for the selected market', () => {
    const { container, unmount } = render(<DZenithTools variant='accumulators' />);
    act(() =>
        Socket.last.onmessage?.({
            data: JSON.stringify({
                msg_type: 'history',
                pip_size: 2,
                history: { prices: [10.01, 10.02, 10.03], times: [1, 2, 3] },
            }),
        })
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(
        screen.getByText(
            'Recent price range — an accumulator pays out while the market stays inside its range; wider recent swings mean a higher chance of an early knock-out at a given growth rate.'
        )
    ).toBeTruthy();
    expect(container.querySelectorAll('.dz-chart--line svg')).toHaveLength(1);
    unmount();
});
