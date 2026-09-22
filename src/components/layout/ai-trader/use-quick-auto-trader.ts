import { useEffect, useRef, useState } from 'react';
import { acquireSession, createBroker, pendingKey } from '@/pages/dzenith-tools/auto-trader/broker';
import {
    AutoSession,
    Broker,
    defaults,
    Journal,
    Settings,
    Snapshot,
    validate,
} from '@/pages/dzenith-tools/auto-trader/engine';
import { MARKETS, useTickFeed } from '@/pages/dzenith-tools/live-market';

const STORAGE_KEY = 'dzenith:quick-auto:settings';
const DEFAULT_MARKET = MARKETS[0][0];

type QuickSettings = Settings & { market: string };

const loadSettings = (): QuickSettings => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaults, market: DEFAULT_MARKET };
        const parsed = JSON.parse(raw);
        const { market, ...rest } = parsed ?? {};
        const settings = { ...defaults, ...rest };
        validate(settings);
        return { ...settings, market: typeof market === 'string' && market ? market : DEFAULT_MARKET };
    } catch {
        return { ...defaults, market: DEFAULT_MARKET };
    }
};

export type QuickAutoTraderPhase = 'idle' | 'connecting' | 'confirm-real' | 'armed';

export function useQuickAutoTrader() {
    const [settings, setSettingsState] = useState<QuickSettings>(loadSettings);
    const [account, setAccount] = useState<Broker['account'] | null>(null);
    const [phase, setPhase] = useState<QuickAutoTraderPhase>('idle');
    const [status, setStatus] = useState('');
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [report, setReport] = useState({ running: false, busy: false, trades: 0, pnl: 0, losses: 0 });
    const feed = useTickFeed(settings.market);
    const feedRef = useRef(feed);
    feedRef.current = feed;
    const broker = useRef<Broker | null>(null);
    const session = useRef<AutoSession | null>(null);
    const unlock = useRef<(() => void) | null>(null);
    const mounted = useRef(true);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    const setSettings = (next: Partial<QuickSettings>) => {
        setSettingsState(previous => {
            const merged = { ...previous, ...next };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch {
                // Storage can be unavailable (private mode, quota); settings just won't persist.
            }
            return merged;
        });
    };

    const update = () => {
        const s = session.current;
        if (s && mounted.current) {
            setReport({ running: s.running, busy: s.busy, trades: s.trades, pnl: s.pnl, losses: s.losses });
            if (!s.running && !s.busy) {
                unlock.current?.();
                unlock.current = null;
                setPhase('idle');
            }
        }
    };

    const note = (entry: Journal) => {
        if (mounted.current) setStatus(entry.message);
    };
    const persistPending = (id: string | null) => {
        const current = broker.current;
        if (!current) throw new Error('Account disconnected.');
        if (id) localStorage.setItem(pendingKey(current.account.id), id);
        else localStorage.removeItem(pendingKey(current.account.id));
        if (mounted.current) setPendingId(id);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // useTickFeed's return doesn't carry the market it was called with -- the
    // caller already knows it. AutoSession needs a full Snapshot (feed + market).
    const snapshot = (): Snapshot => ({ ...feedRef.current, market: settingsRef.current.market });

    const arm = async () => {
        const connected = broker.current;
        if (!connected || !connected.ready()) throw new Error('Verify your Deriv account again.');
        const current = snapshot();
        if (
            current.status !== 'Live' ||
            Date.now() - current.received > 10000 ||
            current.ticks.length < settingsRef.current.sample ||
            (settingsRef.current.strategy === 'parity' && current.precision === null)
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
            { ...settingsRef.current },
            settingsRef.current.market,
            connected,
            snapshot,
            note,
            persistPending
        );
        session.current.start();
        setPhase('armed');
        update();
    };

    const quickStart = async () => {
        if (phase === 'armed' || report.running || report.busy) {
            session.current?.stop();
            update();
            return;
        }
        if (pendingId) {
            setStatus('An unresolved purchase is pending. Check settlement before starting a new session.');
            return;
        }
        try {
            validate(settingsRef.current);
            setPhase('connecting');
            let connected = broker.current;
            if (!connected || !connected.ready()) {
                connected = await createBroker();
                if (!mounted.current) {
                    connected.close();
                    return;
                }
                broker.current = connected;
                setAccount(connected.account);
                setPendingId(localStorage.getItem(pendingKey(connected.account.id)));
                setStatus('Account verified with Deriv.');
            }
            if (connected.account.type === 'real') {
                setPhase('confirm-real');
                return;
            }
            await arm();
        } catch (error) {
            setPhase('idle');
            setStatus((error as Error).message);
        }
    };

    const confirmRealAndStart = async () => {
        try {
            await arm();
        } catch (error) {
            setPhase('idle');
            setStatus((error as Error).message);
        }
    };

    const cancelConfirm = () => setPhase('idle');

    const reconcile = async () => {
        if (!broker.current || !pendingId) return;
        try {
            const profit = await broker.current.settle(pendingId);
            persistPending(null);
            setStatus(`Contract ${pendingId} is settled: ${profit.toFixed(2)}.`);
        } catch (error) {
            setStatus((error as Error).message);
        }
    };

    return {
        settings,
        setSettings,
        account,
        phase,
        status,
        pendingId,
        report,
        feed,
        markets: MARKETS,
        quickStart,
        confirmRealAndStart,
        cancelConfirm,
        reconcile,
    };
}
