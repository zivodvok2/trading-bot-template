import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import {
    appendTick,
    DigitBarChart,
    digitOf,
    LiveAnalysis,
    LiveMarketProvider,
    LiveTape,
    PriceLineChart,
    RiseFallBars,
    statistics,
    useTickFeed,
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

describe('PriceLineChart', () => {
    test('shows a placeholder with fewer than two points', () => {
        render(<PriceLineChart ticks={[{ quote: 1, epoch: 1 }]} precision={2} />);
        expect(screen.getByText('Waiting for enough ticks to draw a chart…')).toBeTruthy();
    });
    test('renders the latest price and min/max axis labels', () => {
        const ticks = [
            { quote: 9.95, epoch: 1 },
            { quote: 10.05, epoch: 2 },
            { quote: 10.0, epoch: 3 },
        ];
        render(<PriceLineChart ticks={ticks} precision={2} />);
        expect(screen.getByText('10.05')).toBeTruthy(); // max
        expect(screen.getByText('9.95')).toBeTruthy(); // min
        expect(screen.getByText('10.00')).toBeTruthy(); // latest, in the heading
    });
    test('shows a tooltip for the nearest point on hover', () => {
        const ticks = [
            { quote: 10.0, epoch: 1 },
            { quote: 10.1, epoch: 2 },
        ];
        const { container } = render(<PriceLineChart ticks={ticks} precision={2} />);
        const svg = container.querySelector('svg')!;
        jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            width: 600,
            top: 0,
            height: 140,
            right: 600,
            bottom: 140,
            x: 0,
            y: 0,
            toJSON: () => '',
        });
        // jsdom has no PointerEvent constructor, so RTL's fireEvent.pointerMove can't
        // carry clientX; dispatch a plain MouseEvent under the 'pointermove' type
        // instead, which React's event delegation still routes to onPointerMove.
        fireEvent(svg, new MouseEvent('pointermove', { clientX: 599, bubbles: true }));
        expect(screen.getByText('00:00:02 UTC')).toBeTruthy();
        // React implements onPointerLeave via the non-bubbling 'pointerout' event
        // internally, not a literal 'pointerleave' listener.
        fireEvent.pointerOut(svg);
        expect(screen.queryByText('00:00:02 UTC')).toBeNull();
    });
});

describe('DigitBarChart', () => {
    test('shows a placeholder before precision/data is known', () => {
        render(<DigitBarChart digits={Array(10).fill(0)} n={0} digitReady={false} />);
        expect(screen.getByText('Waiting for market precision/data…')).toBeTruthy();
    });
    test('renders bars with percentages and a tooltip on hover', () => {
        const digits = [0, 0, 4, 0, 0, 0, 0, 0, 0, 0];
        render(<DigitBarChart digits={digits} n={4} digitReady />);
        expect(screen.getByText('100.0%')).toBeTruthy();
        fireEvent.pointerEnter(screen.getByText('2').closest('.dz-digit-bar-col')!);
        expect(screen.getByText('4 of 4 ticks (100.0%)')).toBeTruthy();
    });
});

describe('RiseFallBars', () => {
    test('shows a placeholder with no price changes yet', () => {
        render(<RiseFallBars rise={0} fall={0} flat={0} denominator={0} />);
        expect(screen.getByText('Waiting for enough price changes…')).toBeTruthy();
    });
    test('renders rise/fall percentages, flat note, and a tooltip on hover', () => {
        render(<RiseFallBars rise={3} fall={1} flat={2} denominator={4} />);
        expect(screen.getByText('75.0%')).toBeTruthy();
        expect(screen.getByText('25.0%')).toBeTruthy();
        expect(screen.getByText('2 unchanged ticks excluded from the ratio.')).toBeTruthy();
        fireEvent.pointerEnter(screen.getByText('Rise').closest('.dz-hbar-row')!);
        expect(screen.getByText('3 of 4 price changes')).toBeTruthy();
    });
});

test('switches between digit and rise/fall charts with the analysis mode', () => {
    render(
        <LiveMarketProvider>
            <LiveAnalysis />
        </LiveMarketProvider>
    );
    const socket = MockSocket.instances[0];
    act(() => socket.message({ msg_type: 'history', pip_size: 2, history: { prices: [10.02, 10.04], times: [1, 2] } }));
    expect(screen.getByText('Live digit distribution')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Analysis mode'), { target: { value: 'Rise / Fall' } });
    expect(screen.getByText('Rise vs fall')).toBeTruthy();
});
