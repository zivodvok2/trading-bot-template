import React, { createContext, useContext, useEffect, useState } from 'react';
import brandConfig from '../../../brand.config.json';
import './live-market.scss';
import './polish.scss';

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
    if (precision === null || !ticks.length) return <span>Waiting for market data…</span>;
    const recent = ticks.slice(-10);
    return (
        <div className='dz-digit-balls' role='list' aria-label='Last ten digits, oldest to newest'>
            {recent.map((tick, index) => {
                const digit = digitOf(tick.quote, precision);
                return (
                    <span
                        role='listitem'
                        aria-label={digit + (index === recent.length - 1 ? ', latest' : '')}
                        key={tick.epoch}
                        className={
                            'dz-digit-ball' +
                            (digit % 2 ? ' dz-digit-ball--odd' : '') +
                            (index === recent.length - 1 ? ' dz-digit-ball--latest' : '')
                        }
                    >
                        {digit}
                    </span>
                );
            })}
        </div>
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
                <small>Last 10 digits · oldest → newest</small>
                <LiveDigits />
                <div className='dz-digit-legend'>
                    <span>Even</span>
                    <span>Odd</span>
                    <span>Ring = newest tick</span>
                </div>
            </div>
        </section>
    );
}
// Colors below are pinned to specific validated hexes (not the raw brand teal/green,
// which read as too light on this dark surface) — see scripts/validate_palette.js in
// the dataviz skill. Each pair passes lightness-band, CVD-separation and contrast
// checks against the app's #0b1020 surface.
const EVEN_COLOR = '#0ea89a';
const ODD_COLOR = '#6d5ef5';
const RISE_COLOR = '#0e9463';
const FALL_COLOR = '#ef4444';
const PRICE_COLOR = '#12c7b0';

export function PriceLineChart({ ticks, precision }: { ticks: Tick[]; precision: number | null }) {
    const points = ticks.slice(-60);
    const [active, setActive] = useState<number | null>(null);
    if (points.length < 2) {
        return (
            <div className='dz-chart dz-chart--empty'>Waiting for enough ticks to draw a chart…</div>
        );
    }
    const quotes = points.map(t => t.quote);
    const min = Math.min(...quotes);
    const max = Math.max(...quotes);
    const range = max - min || 1;
    const width = 600;
    const height = 140;
    const padY = 16;
    const toX = (i: number) => (i / (points.length - 1)) * width;
    const toY = (q: number) => height - padY - ((q - min) / range) * (height - padY * 2);
    const path = points
        .map((t, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(t.quote).toFixed(2)}`)
        .join(' ');
    const latest = points[points.length - 1];
    const hovered = active !== null ? points[active] : null;
    const fmt = (q: number) => (precision === null ? String(q) : q.toFixed(precision));
    const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = (event.clientX - rect.left) / rect.width;
        const index = Math.round(ratio * (points.length - 1));
        setActive(Math.min(points.length - 1, Math.max(0, index)));
    };
    return (
        <div className='dz-chart dz-chart--line'>
            <div className='dz-chart-heading'>
                <span>Price · last {points.length} ticks</span>
                <b>{fmt(latest.quote)}</b>
            </div>
            <div className='dz-chart-svg-wrap'>
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio='none'
                    role='img'
                    aria-label={`Line chart of the last ${points.length} tick quotes, latest ${fmt(latest.quote)}`}
                    onPointerMove={handleMove}
                    onPointerLeave={() => setActive(null)}
                >
                    <line x1={0} y1={height - padY} x2={width} y2={height - padY} className='dz-chart-baseline' />
                    {active !== null && (
                        <line x1={toX(active)} y1={0} x2={toX(active)} y2={height} className='dz-chart-crosshair' />
                    )}
                    <path d={path} className='dz-chart-line-path' style={{ stroke: PRICE_COLOR }} />
                    <circle
                        cx={toX(points.length - 1)}
                        cy={toY(latest.quote)}
                        r={4}
                        className='dz-chart-end-dot'
                        style={{ fill: PRICE_COLOR }}
                    />
                </svg>
                {hovered && (
                    <div className='dz-chart-tooltip' style={{ left: `${(active! / (points.length - 1)) * 100}%` }}>
                        <b>{fmt(hovered.quote)}</b>
                        <span>{new Date(hovered.epoch * 1000).toISOString().slice(11, 19)} UTC</span>
                    </div>
                )}
            </div>
            <div className='dz-chart-axis'>
                <span>{fmt(min)}</span>
                <span>{fmt(max)}</span>
            </div>
        </div>
    );
}

export function DigitBarChart({ digits, n, digitReady }: { digits: number[]; n: number; digitReady: boolean }) {
    const [active, setActive] = useState<number | null>(null);
    if (!digitReady || !n) {
        return <div className='dz-chart dz-chart--empty'>Waiting for market precision/data…</div>;
    }
    const max = Math.max(...digits, 1);
    return (
        <div className='dz-chart dz-chart--bars'>
            <div className='dz-chart-legend'>
                <span className='dz-legend-swatch' style={{ background: EVEN_COLOR }} />
                Even
                <span className='dz-legend-swatch' style={{ background: ODD_COLOR }} />
                Odd
            </div>
            <div className='dz-digit-bars' role='img' aria-label='Bar chart of last-digit frequency, digits 0 through 9'>
                {digits.map((count, digit) => {
                    const pct = (count / n) * 100;
                    const heightPct = (count / max) * 100;
                    const isEven = digit % 2 === 0;
                    return (
                        <div
                            className='dz-digit-bar-col'
                            key={digit}
                            tabIndex={0}
                            onPointerEnter={() => setActive(digit)}
                            onPointerLeave={() => setActive(null)}
                            onFocus={() => setActive(digit)}
                            onBlur={() => setActive(null)}
                        >
                            <b>{pct.toFixed(1)}%</b>
                            <div className='dz-digit-bar-track'>
                                <div
                                    className='dz-digit-bar-fill'
                                    style={{ height: `${heightPct}%`, background: isEven ? EVEN_COLOR : ODD_COLOR }}
                                />
                            </div>
                            <small>{digit}</small>
                            {active === digit && (
                                <div className='dz-chart-tooltip dz-chart-tooltip--bar'>
                                    <b>Digit {digit}</b>
                                    <span>
                                        {count} of {n} ticks ({pct.toFixed(1)}%)
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function RiseFallBars({
    rise,
    fall,
    flat,
    denominator,
}: {
    rise: number;
    fall: number;
    flat: number;
    denominator: number;
}) {
    const [active, setActive] = useState<'rise' | 'fall' | null>(null);
    if (!denominator) {
        return <div className='dz-chart dz-chart--empty'>Waiting for enough price changes…</div>;
    }
    const rows: { key: 'rise' | 'fall'; label: string; count: number; pct: number; color: string }[] = [
        { key: 'rise', label: 'Rise', count: rise, pct: (rise / denominator) * 100, color: RISE_COLOR },
        { key: 'fall', label: 'Fall', count: fall, pct: (fall / denominator) * 100, color: FALL_COLOR },
    ];
    return (
        <div className='dz-chart dz-chart--hbars'>
            <div className='dz-chart-legend'>
                <span className='dz-legend-swatch' style={{ background: RISE_COLOR }} />
                Rise
                <span className='dz-legend-swatch' style={{ background: FALL_COLOR }} />
                Fall
            </div>
            {rows.map(row => (
                <div
                    className='dz-hbar-row'
                    key={row.key}
                    tabIndex={0}
                    onPointerEnter={() => setActive(row.key)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(row.key)}
                    onBlur={() => setActive(null)}
                >
                    <small>{row.label}</small>
                    <div className='dz-hbar-track'>
                        <div className='dz-hbar-fill' style={{ width: `${row.pct}%`, background: row.color }} />
                    </div>
                    <b>{row.pct.toFixed(1)}%</b>
                    {active === row.key && (
                        <div className='dz-chart-tooltip dz-chart-tooltip--hbar'>
                            <span>
                                {row.count} of {denominator} price changes
                            </span>
                        </div>
                    )}
                </div>
            ))}
            {flat > 0 && (
                <p className='dz-muted-copy'>
                    {flat} unchanged tick{flat === 1 ? '' : 's'} excluded from the ratio.
                </p>
            )}
        </div>
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
                <div className='dz-panel-heading'>Price movement</div>
                <PriceLineChart ticks={feed.ticks} precision={feed.precision} />
            </section>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>{direction ? 'Rise vs fall' : 'Live digit distribution'}</div>
                {direction ? (
                    <RiseFallBars rise={stats.rise} fall={stats.fall} flat={stats.flat} denominator={denominator} />
                ) : (
                    <DigitBarChart digits={stats.digits} n={n} digitReady={digitReady} />
                )}
                <p className='dz-muted-copy'>
                    These are historical frequencies, not probabilities of the next tick or buy/sell recommendations. A
                    more frequent outcome may be expected by the contract structure, not a trading advantage. No orders
                    are placed here.
                </p>
            </section>
        </div>
    );
}
