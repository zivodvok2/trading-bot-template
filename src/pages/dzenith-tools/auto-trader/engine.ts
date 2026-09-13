export type Tick = { quote: number; epoch: number };
export type Snapshot = { market: string; ticks: Tick[]; precision: number | null; status: string; received: number };
export type Settings = {
    strategy: 'parity' | 'direction';
    sample: number;
    threshold: number;
    stake: number;
    duration: number;
    maxLoss: number;
    takeProfit: number;
    maxTrades: number;
    maxLosses: number;
    cooldown: number;
};
export const defaults: Settings = {
    strategy: 'parity',
    sample: 60,
    threshold: 60,
    stake: 1,
    duration: 5,
    maxLoss: 5,
    takeProfit: 5,
    maxTrades: 10,
    maxLosses: 3,
    cooldown: 5,
};
export type Signal = { contract: 'DIGITEVEN' | 'DIGITODD' | 'CALL' | 'PUT' | null; percent: number; reason: string };
export function validate(s: Settings) {
    if (!['parity', 'direction'].includes(s.strategy)) throw new Error('Unsupported strategy.');
    const limits: [keyof Settings, number, number][] = [
        ['sample', 30, 200],
        ['threshold', 51, 95],
        ['stake', 0.35, 100],
        ['duration', 1, 10],
        ['maxLoss', 0.35, 1000],
        ['takeProfit', 0.35, 1000],
        ['maxTrades', 1, 100],
        ['maxLosses', 1, 20],
        ['cooldown', 2, 300],
    ];
    for (const [key, min, max] of limits) {
        const value = s[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
            throw new Error(`${key} must be between ${min} and ${max}.`);
    }
    for (const key of ['sample', 'duration', 'maxTrades', 'maxLosses'] as const)
        if (!Number.isInteger(s[key])) throw new Error(`${key} must be a whole number.`);
    if (s.stake > s.maxLoss) throw new Error('Stake cannot exceed the session loss limit.');
}
export function analyse(feed: Snapshot, s: Settings, now = Date.now()): Signal {
    if (feed.status !== 'Live' || now - feed.received > 10000)
        return { contract: null, percent: 0, reason: 'Waiting for a fresh live feed' };
    const ticks = feed.ticks.slice(-s.sample);
    if (ticks.length < s.sample)
        return { contract: null, percent: 0, reason: `Warming up: ${ticks.length}/${s.sample} ticks` };
    let a = 0,
        b = 0,
        total = ticks.length;
    if (s.strategy === 'parity') {
        if (feed.precision === null)
            return { contract: null, percent: 0, reason: 'Waiting for market decimal precision' };
        ticks.forEach(t => (Number(t.quote.toFixed(feed.precision!).slice(-1)) % 2 ? b++ : a++));
    } else {
        total--;
        for (let i = 1; i < ticks.length; i++) {
            if (ticks[i].quote > ticks[i - 1].quote) a++;
            else if (ticks[i].quote < ticks[i - 1].quote) b++;
        }
    }
    const percent = (Math.max(a, b) / total) * 100;
    const label = s.strategy === 'parity' ? (a > b ? 'Even' : 'Odd') : a > b ? 'Rise' : 'Fall';
    const contract =
        percent >= s.threshold && a !== b
            ? s.strategy === 'parity'
                ? a > b
                    ? 'DIGITEVEN'
                    : 'DIGITODD'
                : a > b
                  ? 'CALL'
                  : 'PUT'
            : null;
    return { contract, percent, reason: `${label} ${percent.toFixed(1)}% observed; entry threshold ${s.threshold}%` };
}
export interface Broker {
    account: { id: string; type: 'demo' | 'real'; currency: string };
    ready: () => boolean;
    quote: (contract: string, market: string, s: Settings) => Promise<{ id: string; price: number }>;
    buy: (id: string, price: number) => Promise<string>;
    settle: (id: string) => Promise<number>;
    close: () => void;
}
export type Journal = { time: string; message: string };
export class AutoSession {
    running = false;
    busy = false;
    trades = 0;
    pnl = 0;
    losses = 0;
    private lastEpoch = 0;
    private lastEnd = 0;
    constructor(
        public settings: Settings,
        public market: string,
        private broker: Broker,
        private feed: () => Snapshot,
        private log: (entry: Journal) => void,
        private pending: (id: string | null) => void
    ) {
        validate(settings);
    }
    private note(message: string) {
        this.log({ time: new Date().toISOString(), message });
    }
    start() {
        if (this.running || this.busy) throw new Error('A session is already active.');
        this.running = true;
        this.note(`Session armed on ${this.broker.account.type} account ${this.broker.account.id}.`);
    }
    stop(reason = 'Stopped by you') {
        this.running = false;
        this.note(reason);
    }
    async tick(now = Date.now()) {
        if (!this.running || this.busy) return;
        const feed = this.feed();
        if (feed.market !== this.market || !this.broker.ready()) {
            this.stop('Stopped: account, connection, or market changed.');
            return;
        }
        if (feed.status !== 'Live' || now - feed.received > 10000) {
            this.stop('Stopped: market data is not current.');
            return;
        }
        if (
            this.trades >= this.settings.maxTrades ||
            this.losses >= this.settings.maxLosses ||
            this.pnl >= this.settings.takeProfit ||
            this.pnl - this.settings.stake < -this.settings.maxLoss - 1e-8
        ) {
            this.stop('Session risk limit reached. No further entries.');
            return;
        }
        const epoch = feed.ticks[feed.ticks.length - 1]?.epoch;
        if (!epoch || epoch === this.lastEpoch || now - this.lastEnd < this.settings.cooldown * 1000) return;
        const signal = analyse(feed, this.settings, now);
        if (!signal.contract) return;
        this.lastEpoch = epoch;
        this.busy = true;
        try {
            this.note(`Entry considered: ${signal.contract}. ${signal.reason}`);
            const quote = await this.broker.quote(signal.contract, this.market, this.settings);
            const latest = this.feed();
            if (
                !this.running ||
                !this.broker.ready() ||
                latest.market !== this.market ||
                analyse(latest, this.settings).contract !== signal.contract
            ) {
                this.stop('Entry cancelled: conditions changed during quote.');
                return;
            }
            if (!Number.isFinite(quote.price) || quote.price <= 0 || quote.price > this.settings.stake + 1e-8)
                throw new Error('Quote exceeds the approved stake.');
            // Persist uncertainty BEFORE sending a buy. Never automatically retry a purchase.
            this.pending('unknown');
            const id = await this.broker.buy(quote.id, quote.price);
            this.pending(id);
            this.trades++;
            this.note(`Contract ${id} purchased. Waiting for settlement.`);
            const profit = await this.broker.settle(id);
            if (!Number.isFinite(profit)) throw new Error('Invalid settlement response.');
            this.pending(null);
            this.pnl += profit;
            this.losses = profit < 0 ? this.losses + 1 : 0;
            this.note(
                `Contract ${id} settled: ${profit.toFixed(2)} ${this.broker.account.currency}. Session: ${this.pnl.toFixed(2)}.`
            );
        } catch (error) {
            this.stop(error instanceof Error ? error.message : 'Execution failed. Check your Deriv account.');
        } finally {
            this.busy = false;
            this.lastEnd = Date.now();
        }
    }
    dispose() {
        this.stop('Panel closed. No new entries; any purchased contract remains on Deriv.');
        this.broker.close();
    }
}
