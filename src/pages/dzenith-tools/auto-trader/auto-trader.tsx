import { useEffect, useRef, useState } from 'react';
import { useLiveMarket } from '../live-market';
import { analyse, AutoSession, Broker, defaults, Journal, Settings, validate } from './engine';
import { acquireSession, createBroker, pendingKey } from './broker';
import './auto-trader.scss';

export default function AutoTrader() {
    const feed = useLiveMarket();
    const feedRef = useRef(feed);
    feedRef.current = feed;
    const [settings, setSettings] = useState<Settings>({ ...defaults });
    const [account, setAccount] = useState<Broker['account'] | null>(null);
    const [status, setStatus] = useState('Monitor mode. No orders are being sent.');
    const [log, setLog] = useState<Journal[]>([]);
    const [agreed, setAgreed] = useState(false);
    const [realConfirm, setRealConfirm] = useState('');
    const [connecting, setConnecting] = useState(false);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [report, setReport] = useState({ running: false, busy: false, trades: 0, pnl: 0, losses: 0 });
    const broker = useRef<Broker | null>(null);
    const session = useRef<AutoSession | null>(null);
    const unlock = useRef<(() => void) | null>(null);
    const mounted = useRef(true);
    const signal = analyse(feed, settings);
    const update = () => {
        const s = session.current;
        if (s && mounted.current) {
            setReport({ running: s.running, busy: s.busy, trades: s.trades, pnl: s.pnl, losses: s.losses });
            if (!s.running && !s.busy) {
                unlock.current?.();
                unlock.current = null;
            }
        }
    };
    useEffect(() => {
        mounted.current = true;
        const timer = setInterval(() => {
            const s = session.current;
            if (s) {
                void s.tick().finally(update);
                update();
            }
        }, 1000);
        const onHide = () => {
            if (document.hidden) {
                session.current?.stop('Tab hidden. New entries paused; existing contract will still settle.');
                update();
            }
        };
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (session.current?.busy) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
            mounted.current = false;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('beforeunload', beforeUnload);
            session.current?.dispose();
            broker.current?.close();
            unlock.current?.();
        };
    }, []);
    const note = (entry: Journal) => {
        if (mounted.current) {
            setLog(items => [entry, ...items].slice(0, 150));
            setStatus(entry.message);
        }
    };
    const persist = (id: string | null) => {
        const current = broker.current;
        if (!current) throw new Error('Account disconnected.');
        if (id) localStorage.setItem(pendingKey(current.account.id), id);
        else localStorage.removeItem(pendingKey(current.account.id));
        if (mounted.current) setPendingId(id);
    };
    const connect = async () => {
        setConnecting(true);
        setAccount(null);
        setAgreed(false);
        setRealConfirm('');
        broker.current?.close();
        try {
            const connected = await createBroker();
            if (!mounted.current) {
                connected.close();
                return;
            }
            broker.current = connected;
            setAccount(connected.account);
            setPendingId(localStorage.getItem(pendingKey(connected.account.id)));
            setStatus('Account verified with Deriv. Review settings and acknowledge before starting.');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            if (mounted.current) setConnecting(false);
        }
    };
    const start = async () => {
        if (connecting || report.running || report.busy) return;
        setConnecting(true);
        try {
            validate(settings);
            const connected = broker.current;
            if (!connected || !connected.ready()) throw new Error('Verify your Deriv account again.');
            if (!agreed || (connected.account.type === 'real' && realConfirm !== 'START REAL'))
                throw new Error('Review and acknowledge the trading risks first.');
            const currentFeed = feedRef.current;
            if (
                currentFeed.status !== 'Live' ||
                Date.now() - currentFeed.received > 10000 ||
                currentFeed.ticks.length < settings.sample ||
                (settings.strategy === 'parity' && currentFeed.precision === null)
            )
                throw new Error('Wait for a complete, fresh market sample before arming.');
            unlock.current = await acquireSession(connected.account.id);
            if (!mounted.current) {
                unlock.current();
                unlock.current = null;
                return;
            }
            if (localStorage.getItem(pendingKey(connected.account.id)))
                throw new Error('A previous purchase is unresolved. Reconcile it before starting.');
            session.current = new AutoSession(
                { ...settings },
                feedRef.current.market,
                connected,
                () => feedRef.current,
                note,
                persist
            );
            setLog([]);
            session.current.start();
            update();
        } catch (error) {
            unlock.current?.();
            unlock.current = null;
            setStatus((error as Error).message);
        } finally {
            if (mounted.current) setConnecting(false);
        }
    };
    const reconcile = async () => {
        if (!broker.current || !pendingId || pendingId === 'unknown') return;
        setConnecting(true);
        try {
            const profit = await broker.current.settle(pendingId);
            persist(null);
            setStatus(
                `Contract ${pendingId} is settled: ${profit.toFixed(2)}. Review your account before starting a new session.`
            );
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setConnecting(false);
        }
    };
    const download = () => {
        const blob = new Blob(
            [
                JSON.stringify(
                    {
                        settings,
                        market: feed.market,
                        account: account ? { id: account.id, type: account.type, currency: account.currency } : null,
                        summary: report,
                        events: log,
                    },
                    null,
                    2
                ),
            ],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dzenith-auto-session.json';
        link.click();
        URL.revokeObjectURL(url);
    };
    const locked = report.running || report.busy || connecting;
    return (
        <div className='dz-stack dz-auto'>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>
                    <span>Auto Trader / statistical execution</span>
                    <span className='dz-chip'>
                        {report.running ? 'ARMED' : report.busy ? 'SETTLING' : 'MONITOR ONLY'}
                    </span>
                </div>
                <p className='dz-muted-copy'>
                    No chatbot or paid AI provider. This engine measures recent ticks and automatically trades a
                    qualifying rule after you start it. Historical frequencies are not a prediction or a proven edge.
                </p>
                <div className='dz-auto-signal'>
                    <b>{signal.contract ? `Rule qualifies · ${signal.contract}` : 'WAIT · no entry'}</b>
                    <span>{signal.reason}</span>
                </div>
                <div className='dz-form-row'>
                    <label className='dz-field'>
                        Analysis strategy
                        <select
                            disabled={locked}
                            value={settings.strategy}
                            onChange={e =>
                                setSettings({ ...settings, strategy: e.target.value as Settings['strategy'] })
                            }
                        >
                            <option value='parity'>Even / Odd frequency</option>
                            <option value='direction'>Rise / Fall momentum</option>
                        </select>
                    </label>
                    {(
                        [
                            ['sample', 'Rolling ticks', 30, 200, 1],
                            ['threshold', 'Entry threshold (%)', 51, 95, 1],
                            ['duration', 'Contract duration (ticks)', 1, 10, 1],
                            ['stake', `Fixed stake (${account?.currency || 'account currency'})`, 0.35, 100, 0.01],
                            ['maxLoss', 'Session net-loss limit', 0.35, 1000, 0.01],
                            ['takeProfit', 'Session profit target', 0.35, 1000, 0.01],
                            ['maxTrades', 'Maximum trades', 1, 100, 1],
                            ['maxLosses', 'Consecutive-loss stop', 1, 20, 1],
                            ['cooldown', 'Cooldown (seconds)', 2, 300, 1],
                        ] as const
                    ).map(([key, label, min, max, step]) => (
                        <label className='dz-field' key={key}>
                            {label}
                            <input
                                disabled={locked}
                                type='number'
                                min={min}
                                max={max}
                                step={step}
                                value={settings[key]}
                                onChange={e => {
                                    setSettings({ ...settings, [key]: Number(e.target.value) });
                                    setAgreed(false);
                                }}
                            />
                        </label>
                    ))}
                </div>
                <p className='dz-muted-copy'>
                    Fixed stake only; no martingale. One contract at a time. Net-loss checks reserve the next full
                    stake. Limits apply to this session, not other bots, manual trades, or account-wide activity.
                </p>
            </section>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>Account & execution permission</div>
                <button className='dz-secondary' disabled={locked} onClick={connect}>
                    {connecting ? 'Verifying…' : 'Verify selected Deriv account'}
                </button>
                {account && (
                    <p className={account.type === 'real' ? 'dz-auto-warning' : 'dz-muted-copy'}>
                        {account.type.toUpperCase()} · {account.id} · {account.currency}.{' '}
                        {account.type === 'real' ? 'Real funds are at risk.' : 'Demo funds only.'}
                    </p>
                )}
                <label className='dz-auto-consent'>
                    <input
                        type='checkbox'
                        disabled={locked}
                        checked={agreed}
                        onChange={e => setAgreed(e.target.checked)}
                    />
                    I approve this session’s market, strategy and limits. I understand automatic trades can lose the
                    stake and changing tabs stops new entries, not existing contracts.
                </label>
                {account?.type === 'real' && (
                    <label className='dz-field'>
                        Type START REAL to enable real-money execution
                        <input
                            disabled={locked}
                            value={realConfirm}
                            onChange={e => setRealConfirm(e.target.value)}
                            autoComplete='off'
                        />
                    </label>
                )}
                <div className='dz-auto-actions'>
                    <button
                        className='dz-primary'
                        disabled={
                            locked ||
                            !account ||
                            !agreed ||
                            Boolean(pendingId) ||
                            (account?.type === 'real' && realConfirm !== 'START REAL')
                        }
                        onClick={start}
                    >
                        Start {account?.type === 'real' ? 'real-money' : 'demo'} automation
                    </button>
                    <button
                        className='dz-secondary dz-auto-stop'
                        disabled={!report.running}
                        onClick={() => {
                            session.current?.stop();
                            update();
                        }}
                    >
                        Stop new trades
                    </button>
                    <button className='dz-secondary' disabled={!log.length} onClick={download}>
                        Export journal
                    </button>
                </div>
                <p className='dz-muted-copy'>
                    Keep this tab open and visible. Closing, hiding, switching markets/accounts, or losing fresh data
                    stops new entries. Stop does not sell an open contract. Do not run another bot on the same account.
                </p>
                {pendingId && (
                    <div className='dz-auto-warning'>
                        Unresolved purchase:{' '}
                        {pendingId === 'unknown'
                            ? 'No contract ID received. Check your Deriv statement; do not repeat the purchase. This account remains locked in Auto Trader until the outcome is reconciled.'
                            : `contract ${pendingId}.`}
                        {pendingId !== 'unknown' && (
                            <button className='dz-secondary' disabled={locked} onClick={reconcile}>
                                Check settlement
                            </button>
                        )}
                    </div>
                )}
            </section>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>Session telemetry</div>
                <div className='dz-stat-grid'>
                    <div>
                        <small>Completed + open trades</small>
                        <b>{report.trades}</b>
                    </div>
                    <div>
                        <small>Realised P/L ({account?.currency || '—'})</small>
                        <b>{report.pnl.toFixed(2)}</b>
                    </div>
                    <div>
                        <small>Consecutive losses</small>
                        <b>{report.losses}</b>
                    </div>
                </div>
                <p role='status' className='dz-auto-status'>
                    {status}
                </p>
                <ol className='dz-auto-journal'>
                    {log.map((entry, i) => (
                        <li key={`${entry.time}-${i}`}>
                            <time>{entry.time.slice(11, 19)} UTC</time>
                            <span>{entry.message}</span>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
