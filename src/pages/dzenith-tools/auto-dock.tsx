import { useEffect, useState } from 'react';
import AutoTrader from './auto-trader/auto-trader';
import { MarketSelector, useLiveMarket } from './live-market';

export default function AutoDock() {
    const [open, setOpen] = useState(false);
    const [activity, setActivity] = useState({ running: false, busy: false, pnl: 0 });
    const feed = useLiveMarket();
    useEffect(() => { const show=()=>setOpen(true); window.addEventListener('dzenith:open-auto',show); return()=>window.removeEventListener('dzenith:open-auto',show); }, []);
    return <aside className='dz-dock'>
        <section id='auto-console' aria-label='Auto Trader console' hidden={!open} className='dz-dock-console'>
            <header><div><small>AUTOMATION CONSOLE</small><h2>Auto Trader</h2></div><button onClick={() => setOpen(false)} aria-label='Minimize Auto Trader'>−</button></header>
            <p>One session across all site tabs. Minimizing this console does not stop an armed session. Open it to stop new trades.</p>
            <MarketSelector />
            <AutoTrader onActivity={setActivity} />
        </section>
        <button className={'dz-dock-trigger ' + (activity.running ? 'is-armed' : '')} aria-expanded={open} aria-controls='auto-console' onClick={() => setOpen(!open)}>
            <span aria-hidden='true'>✦</span><span>Auto Trader<small>{activity.running ? 'ARMED · ' + activity.pnl.toFixed(2) : activity.busy ? 'SETTLING' : `${feed.status} · ${feed.ticks.length} ticks · monitor`}</small></span>
        </button>
    </aside>;
}
