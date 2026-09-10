import React, { createContext, useContext, useEffect, useState } from 'react';
import brandConfig from '../../../brand.config.json';
import './live-market.scss';

export const MARKETS = [
    ['R_75', 'Volatility 75 Index'],
    ['R_100', 'Volatility 100 Index'],
    ['1HZ75V', 'Volatility 75 (1s)'],
    ['JD100', 'Jump 100 Index'],
    ['BOOM500', 'Boom 500 Index'],
    ['CRASH500', 'Crash 500 Index'],
];
export type Tick = { quote: number; epoch: number };
type Feed = { ticks: Tick[]; precision: number | null; status: string; error: string; received: number };
const emptyFeed: Feed = { ticks: [], precision: null, status: 'Connecting', error: '', received: 0 };

export function appendTick(ticks: Tick[], tick: Tick): Tick[] {
    if (!Number.isFinite(tick.quote) || !Number.isFinite(tick.epoch)) return ticks;
    const last = ticks[ticks.length - 1];
    if (last && tick.epoch <= last.epoch) return ticks;
    return [...ticks, tick].slice(-200);
}

export function digitOf(quote: number, precision: number) {
    return Number(quote.toFixed(precision).slice(-1));
}

export function statistics(ticks: Tick[], precision: number | null, sample: number, barrier: number) {
    const window = ticks.slice(-sample);
    const digits = Array<number>(10).fill(0);
    let rise = 0,
        fall = 0,
        flat = 0;
    window.forEach((tick, index) => {
        if (precision !== null) digits[digitOf(tick.quote, precision)]++;
        if (index) {
            const diff = tick.quote - window[index - 1].quote;
            if (diff > 0) rise++;
            else if (diff < 0) fall++;
            else flat++;
        }
    });
    const even = digits.reduce((sum, count, digit) => sum + (digit % 2 === 0 ? count : 0), 0);
    return {
        window,
        digits,
        rise,
        fall,
        flat,
        even,
        odd: digits.reduce((a, b) => a + b, 0) - even,
        over: digits.slice(barrier + 1).reduce((a, b) => a + b, 0),
        under: digits.slice(0, barrier).reduce((a, b) => a + b, 0),
        match: digits[barrier],
    };
}

export function useTickFeed(market: string) {
    const [feed, setFeed] = useState<Feed>(emptyFeed);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let disposed = false;
        let socket: WebSocket | undefined;
        let reconnect: ReturnType<typeof setTimeout> | undefined;
        let attempts = 0;
        let lastMessage = Date.now();
        let fatal = false;
        const connect = () => {
            if (disposed) return;
            setFeed({ ...emptyFeed, status: attempts ? 'Reconnecting' : 'Connecting' });
            lastMessage = Date.now();
            const url = `${brandConfig.platform.derivws.url.production.replace(/^https?/, 'wss')}options/ws/public`;
            const ws = new WebSocket(url);
            socket = ws;
            ws.onopen = () => {
                if (disposed || socket !== ws) return;
                ws.send(
                    JSON.stringify({ ticks_history: market, count: 200, end: 'latest', style: 'ticks', subscribe: 1 })
                );
            };
            ws.onmessage = event => {
                if (disposed || socket !== ws) return;
                let message;
                try {
                    message = JSON.parse(event.data);
                } catch {
                    return;
                }
                if (message.error) {
                    fatal = true;
                    setFeed(previous => ({
                        ...previous,
                        status: 'Unavailable',
                        error: message.error.message || 'Market data request failed.',
                    }));
                    ws.close();
                    return;
                }
                const pip = message.tick?.pip_size ?? message.pip_size;
                const precision = Number.isInteger(pip) && pip >= 0 && pip <= 12 ? (pip as number) : null;
                if (message.msg_type === 'history' && message.history) {
                    const { prices, times } = message.history;
                    if (!Array.isArray(prices) || !Array.isArray(times)) return;
                    const ticks = prices.reduce(
                        (all: Tick[], quote: number, index: number) =>
                            appendTick(all, { quote: Number(quote), epoch: Number(times[index]) }),
                        []
                    );
                    lastMessage = Date.now();
                    setFeed({ ticks, precision, status: 'Waiting for live tick', error: '', received: lastMessage });
                }
                if (message.msg_type === 'tick' && message.tick?.symbol === market) {
                    const tick = { quote: Number(message.tick.quote), epoch: Number(message.tick.epoch) };
                    if (!Number.isFinite(tick.quote) || !Number.isFinite(tick.epoch)) return;
                    lastMessage = Date.now();
                    attempts = 0;
                    setFeed(previous => ({
                        ticks: appendTick(previous.ticks, tick),
                        precision: precision ?? previous.precision,
                        status: 'Live',
                        error: '',
                        received: lastMessage,
                    }));
                }
            };
            ws.onerror = () => ws.close();
            ws.onclose = () => {
                if (disposed || socket !== ws || fatal) return;
                setFeed(previous => ({
                    ...previous,
                    status: 'Disconnected',
                    error: 'Connection lost. Retrying automatically; readings are not current.',
                }));
                reconnect = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
            };
        };
        connect();
        const watchdog = setInterval(() => {
            if (fatal || disposed) return;
            if (Date.now() - lastMessage > 15000) {
                setFeed(previous => ({
                    ...previous,
                    status: 'Stale',
                    error: 'No recent ticks. Reconnecting to Deriv.',
                }));
                socket?.close();
            } else if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ping: 1 }));
        }, 5000);
        return () => {
            disposed = true;
            clearInterval(watchdog);
            clearTimeout(reconnect);
            socket?.close();
        };
    }, [market, retry]);
    return { ...feed, reconnect: () => setRetry(value => value + 1) };
}

type MarketContext = ReturnType<typeof useTickFeed> & { market: string; setMarket: (value: string) => void };
const Context = createContext<MarketContext | null>(null);
export function LiveMarketProvider({ children }: { children: React.ReactNode }) {
    const [market, setMarket] = useState('R_75');
    const feed = useTickFeed(market);
    return <Context.Provider value={{ ...feed, market, setMarket }}>{children}</Context.Provider>;
}
export function useLiveMarket() {
    const context = useContext(Context);
    if (!context) throw new Error('LiveMarketProvider is required');
    return context;
}
export function MarketSelector() {
    const { market, setMarket } = useLiveMarket();
    return (
        <label className='dz-field'>
            Market
            <select value={market} onChange={event => setMarket(event.target.value)}>
                {MARKETS.map(([symbol, label]) => (
                    <option key={symbol} value={symbol}>
                        {label}
                    </option>
                ))}
            </select>
        </label>
    );
}
export function LiveStatus() {
    const { status, error, reconnect } = useLiveMarket();
    return (
        <div className='dz-connection-card' data-feed-status={status}>
            <span className='dz-status-dot' />
            {status}
            <small>Deriv public market feed</small>
            {error && (
                <>
                    <small role='status'>{error}</small>
                    <button className='dz-secondary' onClick={reconnect}>
                        Reconnect
                    </button>
                </>
            )}
        </div>
    );
}
export function LiveDigits() {
    const { ticks, precision } = useLiveMarket();
    return (
        <strong>
            {precision === null || !ticks.length
                ? 'Waiting for market data…'
                : ticks
                      .slice(-12)
                      .map(tick => digitOf(tick.quote, precision))
                      .join(' · ')}
        </strong>
    );
}
export function LiveTape() {
    const { ticks, precision, status } = useLiveMarket();
    const latest = ticks[ticks.length - 1];
    const previous = ticks[ticks.length - 2];
    const change = latest && previous ? latest.quote - previous.quote : null;
    return (
        <section className='dz-live-tape' aria-label='Live market tape'>
            <MarketSelector />
            <div>
                <small>Latest quote · {status}</small>
                <b data-testid='live-quote'>
                    {latest ? (precision === null ? String(latest.quote) : latest.quote.toFixed(precision)) : '—'}
                </b>
                <span>
                    {change === null
                        ? 'Waiting for ticks'
                        : `${change > 0 ? '+' : ''}${precision === null ? change.toPrecision(5) : change.toFixed(precision)} on last tick`}
                </span>
            </div>
            <div>
                <small>Last tick (UTC)</small>
                <b>{latest ? new Date(latest.epoch * 1000).toISOString().slice(11, 19) : '—'}</b>
                <span>{ticks.length} / 200 ticks buffered</span>
            </div>
            <div className='dz-live-digits'>
                <small>Recent digits · oldest → newest</small>
                <LiveDigits />
            </div>
        </section>
    );
}
export function LiveAnalysis({ tool = false }: { tool?: boolean }) {
    const feed = useLiveMarket();
    const [mode, setMode] = useState('Even / Odd');
    const [sample, setSample] = useState(60);
    const [barrier, setBarrier] = useState(5);
    const stats = statistics(feed.ticks, feed.precision, sample, barrier);
    const n = stats.window.length;
    const digitReady = feed.precision !== null;
    const direction = mode === 'Rise / Fall';
    const denominator = direction ? Math.max(0, n - 1) : n;
    const pairs: [string, number][] = direction
        ? [
              ['Rise', stats.rise],
              ['Fall', stats.fall],
              ['Unchanged', stats.flat],
          ]
        : mode === 'Over / Under'
          ? [
                [`Over ${barrier}`, stats.over],
                [`Under ${barrier}`, stats.under],
                ['Equal (neither)', stats.match],
            ]
          : mode === 'Matches / Differs'
            ? [
                  [`Matches ${barrier}`, stats.match],
                  [`Differs ${barrier}`, n - stats.match],
              ]
            : [
                  ['Even', stats.even],
                  ['Odd', stats.odd],
              ];
    const ready = denominator > 0 && (direction || digitReady);
    const sorted = [...pairs].sort((a, b) => b[1] - a[1]);
    const leader = !ready
        ? 'Waiting for data'
        : sorted[0][1] === sorted[1][1]
          ? 'Balanced sample'
          : `${sorted[0][0]}: ${((100 * sorted[0][1]) / denominator).toFixed(1)}% observed`;
    return (
        <div className='dz-stack'>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>{tool ? 'Live statistical workspace' : 'Live signal board'}</div>
                <div className='dz-form-row'>
                    <label className='dz-field'>
                        Analysis mode
                        <select value={mode} onChange={e => setMode(e.target.value)}>
                            {['Even / Odd', 'Rise / Fall', 'Matches / Differs', 'Over / Under'].map(value => (
                                <option key={value}>{value}</option>
                            ))}
                        </select>
                    </label>
                    <label className='dz-field'>
                        Sample size
                        <select value={sample} onChange={e => setSample(Number(e.target.value))}>
                            {[30, 60, 100, 200].map(value => (
                                <option key={value} value={value}>
                                    {value} ticks
                                </option>
                            ))}
                        </select>
                    </label>
                    {(mode === 'Matches / Differs' || mode === 'Over / Under') && (
                        <label className='dz-field'>
                            Digit barrier
                            <select value={barrier} onChange={e => setBarrier(Number(e.target.value))}>
                                {Array.from({ length: 10 }, (_, value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
                <div className='dz-analysis-summary'>
                    <strong>{feed.status === 'Live' ? leader : `${feed.status} — observations only`}</strong>
                    <span>
                        {n} / {sample} ticks · {direction ? denominator + ' price changes' : 'rolling digit sample'} ·
                        recalculated on every tick
                    </span>
                </div>
                <div className='dz-stat-grid'>
                    {pairs.map(([label, count]) => (
                        <div key={label}>
                            <small>{label}</small>
                            <b>{ready ? `${((count / denominator) * 100).toFixed(1)}%` : '—'}</b>
                            <span>{ready ? `${count} of ${denominator}` : 'Awaiting market precision/data'}</span>
                        </div>
                    ))}
                </div>
            </section>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>Live digit distribution</div>
                <div className='dz-digit-grid'>
                    {stats.digits.map((count, digit) => (
                        <div className='dz-digit-cell' key={digit}>
                            <b>{digit}</b>
                            <span>{n && digitReady ? ((count / n) * 100).toFixed(1) + '%' : '—'}</span>
                            <i style={{ height: n && digitReady ? `${(count / n) * 160}px` : 0 }} />
                            <small>{count} ticks</small>
                        </div>
                    ))}
                </div>
                <p className='dz-muted-copy'>
                    These are historical frequencies, not probabilities of the next tick or buy/sell recommendations. A
                    more frequent outcome may be expected by the contract structure, not a trading advantage. No orders
                    are placed here.
                </p>
            </section>
        </div>
    );
}
