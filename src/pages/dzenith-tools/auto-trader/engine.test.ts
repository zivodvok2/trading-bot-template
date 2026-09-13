import { analyse, AutoSession, Broker, defaults, Snapshot, validate } from './engine';
const feed = (): Snapshot => ({
    market: 'R_75',
    status: 'Live',
    received: Date.now(),
    precision: 2,
    ticks: Array.from({ length: 60 }, (_, i) => ({ epoch: i + 1, quote: 10.02 })),
});
const broker = (): Broker => ({
    account: { id: 'demo-1', type: 'demo', currency: 'USD' },
    ready: () => true,
    quote: jest.fn(async () => ({ id: 'proposal-1', price: 1 })),
    buy: jest.fn(async () => 'contract-1'),
    settle: jest.fn(async () => -0.5),
    close: jest.fn(),
});
test('derives parity from server precision; rejects stale or insufficient data', () => {
    expect(analyse(feed(), defaults).contract).toBe('DIGITEVEN');
    expect(analyse({ ...feed(), status: 'Stale' }, defaults).contract).toBeNull();
    expect(analyse({ ...feed(), ticks: [] }, defaults).contract).toBeNull();
    expect(analyse({ ...feed(), received: Date.now() - 11000 }, defaults).contract).toBeNull();
});
test('direction counts changes, not digits', () => {
    const f = feed();
    f.ticks = f.ticks.map((t, i) => ({ ...t, quote: i }));
    expect(analyse(f, { ...defaults, strategy: 'direction' }).contract).toBe('CALL');
});
test('rejects invalid risk parameters', () => {
    expect(() => validate({ ...defaults, stake: Infinity })).toThrow();
    expect(() => validate({ ...defaults, stake: 10, maxLoss: 5 })).toThrow();
    expect(() => validate({ ...defaults, maxTrades: 2.5 })).toThrow();
});
test('no execution before start; executes once and settles when armed', async () => {
    const b = broker(),
        mark = jest.fn();
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), mark);
    await s.tick();
    expect(b.buy).not.toHaveBeenCalled();
    s.start();
    await s.tick();
    expect(b.buy).toHaveBeenCalledTimes(1);
    expect(s.pnl).toBe(-0.5);
    expect(mark.mock.calls.map(c => c[0])).toEqual(['unknown', 'contract-1', null]);
    await s.tick();
    expect(b.buy).toHaveBeenCalledTimes(1);
});
test('stop during proposal cancels purchase', async () => {
    const b = broker();
    let resolve!: (q: { id: string; price: number }) => void;
    b.quote = jest.fn(
        () =>
            new Promise(r => {
                resolve = r;
            })
    );
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), jest.fn());
    s.start();
    const work = s.tick();
    s.stop();
    resolve({ id: 'p', price: 1 });
    await work;
    expect(b.buy).not.toHaveBeenCalled();
});
test('concurrent ticks never create duplicate purchases', async () => {
    const b = broker();
    let resolve!: (q: { id: string; price: number }) => void;
    b.quote = jest.fn(
        () =>
            new Promise(r => {
                resolve = r;
            })
    );
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), jest.fn());
    s.start();
    const first = s.tick();
    await s.tick();
    resolve({ id: 'p', price: 1 });
    await first;
    expect(b.quote).toHaveBeenCalledTimes(1);
    expect(b.buy).toHaveBeenCalledTimes(1);
});
test('uncertain buy stops and retains pending marker without retry', async () => {
    const b = broker(),
        mark = jest.fn();
    b.buy = jest.fn(async () => {
        throw new Error('timeout');
    });
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), mark);
    s.start();
    await s.tick();
    await s.tick();
    expect(s.running).toBe(false);
    expect(b.buy).toHaveBeenCalledTimes(1);
    expect(mark.mock.calls.map(c => c[0])).toEqual(['unknown']);
});
test('loss budget reserves full next stake and trade caps stop entries', async () => {
    const b = broker();
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), jest.fn());
    s.start();
    s.pnl = -4.5;
    await s.tick();
    expect(b.buy).not.toHaveBeenCalled();
    expect(s.running).toBe(false);
    const t = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), jest.fn());
    t.start();
    t.trades = defaults.maxTrades;
    await t.tick();
    expect(t.running).toBe(false);
});
test('market changes, disconnects and stale data stop execution', async () => {
    for (const f of [
        { ...feed(), market: 'R_100' },
        { ...feed(), status: 'Disconnected' },
    ]) {
        const b = broker();
        const s = new AutoSession(defaults, 'R_75', b, () => f, jest.fn(), jest.fn());
        s.start();
        await s.tick();
        expect(s.running).toBe(false);
        expect(b.buy).not.toHaveBeenCalled();
    }
});
test('rejects quote above approved stake', async () => {
    const b = broker();
    b.quote = jest.fn(async () => ({ id: 'p', price: 2 }));
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), jest.fn());
    s.start();
    await s.tick();
    expect(b.buy).not.toHaveBeenCalled();
    expect(s.running).toBe(false);
});
test('an armed session waits for a qualifying signal without buying', async () => {
    const f = feed();
    f.ticks = f.ticks.map((t, i) => ({ ...t, quote: i % 2 ? 10.01 : 10.02 }));
    const b = broker();
    const s = new AutoSession(defaults, 'R_75', b, () => f, jest.fn(), jest.fn());
    s.start();
    await s.tick();
    expect(s.running).toBe(true);
    expect(b.buy).not.toHaveBeenCalled();
});
test('stopping during an open contract still records its settlement', async () => {
    const b = broker();
    let settle!: (n: number) => void;
    b.settle = jest.fn(
        () =>
            new Promise(r => {
                settle = r;
            })
    );
    const s = new AutoSession(defaults, 'R_75', b, feed, jest.fn(), jest.fn());
    s.start();
    const work = s.tick();
    await Promise.resolve();
    await Promise.resolve();
    s.stop();
    settle(0.8);
    await work;
    expect(s.pnl).toBe(0.8);
    expect(s.running).toBe(false);
});
