import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
    appendTick,
    digitOf,
    statistics,
    useTickFeed,
    LiveMarketProvider,
    LiveTape,
    LiveAnalysis,
} from './live-market';

class MockSocket {
    static OPEN = 1;
    static instances: MockSocket[] = [];
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    send = jest.fn();
    close = jest.fn(() => {
        this.readyState = 3;
        this.onclose?.();
    });
    constructor() {
        MockSocket.instances.push(this);
    }
    message(data: unknown) {
        this.onmessage?.({ data: JSON.stringify(data) });
    }
}
const original = global.WebSocket;
beforeEach(() => {
    jest.useFakeTimers();
    MockSocket.instances = [];
    global.WebSocket = MockSocket as unknown as typeof WebSocket;
});
afterEach(() => {
    global.WebSocket = original;
    jest.useRealTimers();
});

test('uses server precision, including trailing zero digits', () => {
    expect(digitOf(47222.1, 4)).toBe(0);
    expect(digitOf(10.1234, 4)).toBe(4);
});
test('bounds the window and rejects repeated or out-of-order ticks', () => {
    let ticks = [] as { quote: number; epoch: number }[];
    for (let epoch = 0; epoch < 250; epoch++) ticks = appendTick(ticks, { epoch, quote: epoch });
    expect(ticks).toHaveLength(200);
    expect(ticks[0].epoch).toBe(50);
    expect(appendTick(ticks, { epoch: 249, quote: 100 })).toBe(ticks);
    expect(appendTick(ticks, { epoch: 1, quote: 1 })).toBe(ticks);
});
test('calculates each mode from the selected sample and separates equal barriers', () => {
    const ticks = [1.1, 1.2, 1.2, 1.0].map((quote, epoch) => ({ quote, epoch }));
    const result = statistics(ticks, 1, 3, 2);
    expect(result.digits[2]).toBe(2);
    expect(result.even).toBe(3);
    expect(result.odd).toBe(0);
    expect([result.rise, result.fall, result.flat]).toEqual([0, 1, 1]);
    expect([result.over, result.under, result.match]).toEqual([0, 1, 2]);
    expect(statistics([], null, 60, 5).window).toHaveLength(0);
});
test('loads history, streams ticks, switches markets and closes on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ market }) => useTickFeed(market), {
        initialProps: { market: 'R_75' },
    });
    const first = MockSocket.instances[0];
    act(() => first.onopen?.());
    expect(JSON.parse(first.send.mock.calls[0][0])).toMatchObject({ ticks_history: 'R_75', subscribe: 1, count: 200 });
    act(() => first.message({ msg_type: 'history', pip_size: 4, history: { prices: [100.1], times: [1] } }));
    expect(result.current.status).toBe('Waiting for live tick');
    act(() => first.message({ msg_type: 'tick', tick: { symbol: 'R_75', quote: 100.2, epoch: 2 } }));
    expect(result.current.status).toBe('Live');
    expect(result.current.precision).toBe(4);
    expect(result.current.ticks).toHaveLength(2);
    rerender({ market: 'R_100' });
    expect(first.close).toHaveBeenCalled();
    expect(result.current.ticks).toHaveLength(0);
    act(() => first.message({ msg_type: 'tick', tick: { symbol: 'R_75', quote: 5, epoch: 3 } }));
    expect(result.current.ticks).toHaveLength(0);
    unmount();
    expect(MockSocket.instances[1].close).toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(60000));
    expect(MockSocket.instances).toHaveLength(2);
});
test('reconnects on stale feeds and does not label errors live', () => {
    const { result, unmount } = renderHook(() => useTickFeed('R_75'));
    act(() => jest.advanceTimersByTime(20000));
    expect(result.current.status).not.toBe('Live');
    act(() => jest.advanceTimersByTime(1000));
    expect(MockSocket.instances).toHaveLength(2);
    act(() => MockSocket.instances[1].message({ error: { message: 'Invalid symbol' } }));
    expect(result.current.status).toBe('Unavailable');
    expect(result.current.error).toBe('Invalid symbol');
    act(() => jest.advanceTimersByTime(60000));
    expect(MockSocket.instances).toHaveLength(2);
    unmount();
});
test('renders changing quotes and recalculated observations from socket messages', () => {
    const { unmount } = render(
        <LiveMarketProvider>
            <LiveTape />
            <LiveAnalysis />
        </LiveMarketProvider>
    );
    const socket = MockSocket.instances[0];
    act(() => socket.message({ msg_type: 'history', pip_size: 2, history: { prices: [10.02, 10.04], times: [1, 2] } }));
    act(() => socket.message({ msg_type: 'tick', tick: { symbol: 'R_75', quote: 10.06, epoch: 3 } }));
    expect(screen.getByTestId('live-quote').textContent).toBe('10.06');
    expect(screen.getByText('Even: 100.0% observed')).toBeTruthy();
    act(() => socket.message({ msg_type: 'tick', tick: { symbol: 'R_75', quote: 10.07, epoch: 4 } }));
    expect(screen.getByTestId('live-quote').textContent).toBe('10.07');
    expect(screen.getByText('Even: 75.0% observed')).toBeTruthy();
    unmount();
});
