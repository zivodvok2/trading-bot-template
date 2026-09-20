import { useState } from 'react';
import { digitOf, statistics, Tick, useLiveMarket } from './live-market';

export function study(ticks: Tick[], precision: number, lookback: number, threshold: number) {
    const digits = ticks.map(t => digitOf(t.quote, precision));
    let entries = 0, hits = 0;
    const transitions = Array.from({ length: 10 }, () => Array<number>(10).fill(0));
    digits.forEach((d, i) => { if(i) transitions[digits[i-1]][d]++; });
    for(let i=lookback; i<digits.length; i++) {
        const even = digits.slice(i-lookback,i).filter(d=>d%2===0).length;
        const share = Math.max(even,lookback-even)/lookback*100;
        if(share < threshold || even===lookback/2) continue;
        entries++;
        if((digits[i]%2===0)===(even>lookback/2)) hits++;
    }
    return { entries, hits, transitions };
}

function Trace({ticks}:{ticks:Tick[]}) {
    if(ticks.length<2) return <p>Waiting for live ticks…</p>;
    const prices=ticks.map(t=>t.quote), lo=Math.min(...prices), hi=Math.max(...prices);
    const points=prices.map((p,i)=>`${i/(prices.length-1)*900},${150-(p-lo)/(hi-lo||1)*130}`).join(' ');
    return <svg className='dz-price-trace' viewBox='0 0 900 170' role='img' aria-label={`Price trace of ${ticks.length} recent ticks; low ${lo}, high ${hi}`}><path d='M0 20H900 M0 85H900 M0 150H900' className='dz-trace-grid'/><polyline points={points} fill='none' stroke='currentColor' strokeWidth='2.5' vectorEffect='non-scaling-stroke'/></svg>;
}

export function MarketOverview() {
    const feed=useLiveMarket();
    const stats=statistics(feed.ticks,feed.precision,200,5);
    const changes=feed.ticks.slice(1).map((t,i)=>t.quote-feed.ticks[i].quote);
    const mean=changes.reduce((a,b)=>a+b,0)/(changes.length||1);
    const volatility=Math.sqrt(changes.reduce((a,b)=>a+(b-mean)**2,0)/(changes.length||1));
    const high=feed.ticks.length?Math.max(...feed.ticks.map(t=>t.quote)):null;
    const low=feed.ticks.length?Math.min(...feed.ticks.map(t=>t.quote)):null;
    return <div className='dz-observatory'>
        <section className='dz-panel'><div className='dz-panel-heading'><span>PRICE RADAR</span><span className='dz-chip'>{feed.status}</span></div><Trace ticks={feed.ticks}/>
            <div className='dz-metric-strip'><div><small>Window high</small><b>{high?.toFixed(feed.precision??2)??'—'}</b></div><div><small>Window low</small><b>{low?.toFixed(feed.precision??2)??'—'}</b></div><div><small>Tick-change deviation</small><b>{changes.length?volatility.toFixed(4):'—'}</b></div><div><small>Net direction</small><b>{changes.length?mean>0?'UPWARD':mean<0?'DOWNWARD':'FLAT':'—'}</b></div></div>
        </section>
        <section className='dz-panel'><div className='dz-panel-heading'>DIGIT FREQUENCY · LAST {feed.ticks.length} TICKS</div><div className='dz-frequency'>{stats.digits.map((count,d)=><div key={d}><b className={'dz-orb '+(d%2?'odd':'even')}>{d}</b><div className='dz-frequency-track'><i style={{height:`${count/(feed.ticks.length||1)*400}%`}}/></div><strong>{feed.precision===null?'—':(count/(feed.ticks.length||1)*100).toFixed(1)+'%'}</strong><small>{count} ticks</small></div>)}</div></section>
        <section className='dz-panel'><div className='dz-panel-heading'>DIRECTION BALANCE</div><div className='dz-direction-meter'><i style={{width:`${stats.rise/(changes.length||1)*100}%`}}/><i style={{width:`${stats.fall/(changes.length||1)*100}%`}}/></div><p>{stats.rise} rises · {stats.fall} falls · {stats.flat} unchanged. Recent movement describes this window; it does not predict the next tick.</p></section>
    </div>;
}

export function AnalysisLab() {
    const feed=useLiveMarket();
    const [snapshot,setSnapshot]=useState<{ticks:Tick[];precision:number;market:string;time:string}|null>(null);
    const [lookback,setLookback]=useState(30), [threshold,setThreshold]=useState(60);
    const result=snapshot?study(snapshot.ticks,snapshot.precision,lookback,threshold):null;
    return <div className='dz-stack'>
        <section className='dz-panel'><div className='dz-panel-heading'>PATTERN LAB · FROZEN SAMPLE</div><p>Capture live data and test a parity-frequency rule against the following tick. Unlike Market Analysis, this sample stays fixed while you investigate it.</p>
            <button className='dz-primary' disabled={feed.status!=='Live'||feed.precision===null||feed.ticks.length<60} onClick={()=>setSnapshot({ticks:[...feed.ticks],precision:feed.precision!,market:feed.market,time:new Date().toISOString()})}>Capture {feed.ticks.length} ticks</button>
            {snapshot&&<p>Captured {snapshot.market} · {snapshot.time} · {snapshot.ticks.length} ticks. Live market changes do not alter this sample.</p>}
            <div className='dz-form-row'><label className='dz-field'>Lookback<select value={lookback} onChange={e=>setLookback(Number(e.target.value))}>{[10,20,30,50].map(n=><option key={n}>{n}</option>)}</select></label><label className='dz-field'>Observed frequency threshold<select value={threshold} onChange={e=>setThreshold(Number(e.target.value))}>{[55,60,65,70,75,80].map(n=><option key={n}>{n}</option>)}</select></label></div>
            <div className='dz-metric-strip'><div><small>Qualifying historical entries</small><b>{result?.entries??'—'}</b></div><div><small>Next-tick matches</small><b>{result?.hits??'—'}</b></div><div><small>Match rate</small><b>{result?.entries?(result.hits/result.entries*100).toFixed(1)+'%':'—'}</b></div></div>
            <p>No future ticks are used to choose an entry. This is a small-sample diagnostic, not a profit backtest: payouts, execution delays and costs are excluded. Repeatedly tuning on this same sample can overfit it.</p>
        </section>
        {result&&<section className='dz-panel'><div className='dz-panel-heading'>DIGIT TRANSITIONS · ROW → NEXT DIGIT</div><div className='dz-matrix-wrap'><table className='dz-matrix'><thead><tr><th>From / To</th>{Array.from({length:10},(_,i)=><th key={i}>{i}</th>)}</tr></thead><tbody>{result.transitions.map((row,i)=><tr key={i}><th>{i}</th>{row.map((n,j)=><td key={j} style={{background:`rgba(34,211,190,${Math.min(.8,n*.09)})`}}>{n}</td>)}</tr>)}</tbody></table></div><p>Counts show observed transitions only, not a reliable forecasting advantage.</p></section>}
    </div>;
}
