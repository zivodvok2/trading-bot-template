import { useEffect, useRef, useState } from 'react';
import { acquireSession, createBroker, pendingKey, TicketBroker } from './auto-trader/broker';
import { useLiveMarket } from './live-market';

export function ticketParameters(accumulator:boolean, market:string, type:string, stake:number, duration:number, barrier:number, rate:number, target:number) {
    if(!Number.isFinite(stake)||stake<.35||stake>100) throw new Error('Stake must be between 0.35 and 100 in account currency.');
    if(accumulator) {
        if(![1,2,3,4,5].includes(rate)||!Number.isFinite(target)||target<=0||target>1000) throw new Error('Choose a growth rate and a positive take-profit amount up to 1000.');
        return { underlying_symbol:market, amount:stake, basis:'stake', contract_type:'ACCU', growth_rate:rate/100, limit_order:{take_profit:target} };
    }
    if(!['CALL','PUT','DIGITEVEN','DIGITODD','DIGITOVER','DIGITUNDER','DIGITMATCH','DIGITDIFF'].includes(type)) throw new Error('Unsupported contract type.');
    if(!Number.isInteger(duration)||duration<1||duration>10) throw new Error('Duration must be 1–10 ticks.');
    if(!Number.isInteger(barrier)||barrier<0||barrier>9) throw new Error('Choose a digit from 0 to 9.');
    return { underlying_symbol:market, amount:stake, basis:'stake',contract_type:type,duration,duration_unit:'t',...(['DIGITOVER','DIGITUNDER','DIGITMATCH','DIGITDIFF'].includes(type)?{barrier:String(barrier)}:{}) };
}

export default function TradeTicket({accumulator=false}:{accumulator?:boolean}) {
    const feed=useLiveMarket(), latest=useRef(feed); latest.current=feed;
    const broker=useRef<TicketBroker|null>(null), release=useRef<(()=>void)|null>(null), flight=useRef(false);
    const [account,setAccount]=useState<TicketBroker['account']|null>(null);
    const [type,setType]=useState('CALL'),[stake,setStake]=useState(1),[duration,setDuration]=useState(5),[barrier,setBarrier]=useState(5),[rate,setRate]=useState(1),[target,setTarget]=useState(1);
    const [busy,setBusy]=useState(false),[message,setMessage]=useState('Connect your selected Deriv account to request a quote.');
    const [quote,setQuote]=useState<(Awaited<ReturnType<TicketBroker['ticket']>> & {time:number;market:string})|null>(null);
    const [pending,setPending]=useState<string|null>(null),[position,setPosition]=useState<Awaited<ReturnType<TicketBroker['contract']>>|null>(null),[real,setReal]=useState('');
    const alive=useRef(true);
    useEffect(()=>{alive.current=true; return()=>{alive.current=false;broker.current?.close();release.current?.();};},[]);
    useEffect(()=>{setQuote(null);setReal('');},[type,stake,duration,barrier,rate,target,feed.market]);
    const run=async(fn:()=>Promise<void>)=>{if(flight.current)return;flight.current=true;setBusy(true);try{await fn();}catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Request failed.');}finally{flight.current=false;if(alive.current)setBusy(false);}};
    const connect=()=>run(async()=>{
        broker.current?.close();release.current?.();release.current=null;setAccount(null);setQuote(null);
        const b=await createBroker();
        if(!alive.current){b.close();return;}
        try {release.current=await acquireSession(b.account.id);} catch(e){b.close();throw e;}
        if(!alive.current){release.current?.();b.close();return;}
        broker.current=b;setAccount(b.account);setPending(localStorage.getItem(pendingKey(b.account.id)));setMessage('Account verified. Quotes do not place trades.');
    });
    const check=async()=>{
        const b=broker.current;if(!b||!pending||pending==='unknown')return;
        const c=await b.contract(pending);setPosition(c);
        if(c.is_sold){if(!Number.isFinite(c.profit))throw new Error('Settlement result is invalid. Reconcile before continuing.');localStorage.removeItem(pendingKey(b.account.id));setPending(null);setMessage(`Contract settled. Realised result: ${c.profit} ${b.account.currency}.`);}
        else setMessage('Contract remains open. Refresh to see its current status.');
    };
    const getQuote=()=>run(async()=>{
        const b=broker.current;setQuote(null);if(!b?.ready())throw new Error('Verify your account again.');
        if(localStorage.getItem(pendingKey(b.account.id)))throw new Error('Resolve the previous purchase first.');
        const market=latest.current.market;
        const q=await b.ticket(ticketParameters(accumulator,market,type,stake,duration,barrier,rate,target));
        if(q.price>stake+1e-8)throw new Error('Quote exceeds your selected stake.');
        if(latest.current.market!==market)throw new Error('Market changed. Request a new quote.');
        setQuote({...q,time:Date.now(),market});setMessage('Quote ready. Confirm the account, contract and maximum cost below. Valid for 10 seconds.');
    });
    const buy=()=>run(async()=>{
        const b=broker.current,q=quote;setQuote(null);
        if(!b?.ready()||!q||Date.now()-q.time>10000||q.market!==latest.current.market)throw new Error('Quote expired or account/market changed. Request another quote.');
        if(b.account.type==='real'&&real!=='BUY REAL')throw new Error('Type BUY REAL to confirm this real-money purchase.');
        if(localStorage.getItem(pendingKey(b.account.id)))throw new Error('A purchase is unresolved.');
        localStorage.setItem(pendingKey(b.account.id),'unknown');setPending('unknown');
        const id=await b.buy(q.id,q.price);localStorage.setItem(pendingKey(b.account.id),id);setPending(id);setPosition(null);setReal('');setMessage(`Purchased contract ${id}. Use Refresh contract to check settlement. No repeat trade will be placed.`);
    });
    return <section className='dz-panel dz-ticket'>
        <div className='dz-panel-heading'>{accumulator?'ACCUMULATOR ORDER':'MANUAL ORDER'}<span className='dz-chip'>YOU CONFIRM EVERY PURCHASE</span></div>
        <p>{accumulator?'An accumulator grows while price stays inside its tick range. A range breach can lose your stake. Choose growth and take profit, then review Deriv’s quote.':'Choose a contract, request a live quote, then confirm one purchase. This is not an automated strategy.'}</p>
        <button className='dz-secondary' disabled={busy} onClick={connect}>{account?'Reconnect account':'Verify selected account'}</button>
        {account&&<p className='dz-copy-notice'>{account.type.toUpperCase()} · {account.id} · {account.currency}</p>}
        <fieldset disabled={busy||Boolean(pending)} className='dz-form-row'>
            {!accumulator&&<label className='dz-field'>Contract<select value={type} onChange={e=>setType(e.target.value)}>{[['CALL','Rise'],['PUT','Fall'],['DIGITEVEN','Even'],['DIGITODD','Odd'],['DIGITOVER','Over'],['DIGITUNDER','Under'],['DIGITMATCH','Matches'],['DIGITDIFF','Differs']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>}
            <label className='dz-field'>Stake ({account?.currency||'account currency'})<input type='number' min='.35' max='100' step='.01' value={stake} onChange={e=>setStake(Number(e.target.value))}/></label>
            {accumulator?<><label className='dz-field'>Growth per tick<select value={rate} onChange={e=>setRate(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option value={n} key={n}>{n}%</option>)}</select></label><label className='dz-field'>Take profit (account currency)<input type='number' min='.01' step='.01' value={target} onChange={e=>setTarget(Number(e.target.value))}/></label></>:<><label className='dz-field'>Duration (ticks)<input type='number' min='1' max='10' value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>{['DIGITOVER','DIGITUNDER','DIGITMATCH','DIGITDIFF'].includes(type)&&<label className='dz-field'>Digit barrier<select value={barrier} onChange={e=>setBarrier(Number(e.target.value))}>{Array.from({length:10},(_,n)=><option key={n}>{n}</option>)}</select></label>}</>}
        </fieldset>
        <button className='dz-primary' disabled={!account||busy||Boolean(pending)} onClick={getQuote}>Request live quote</button>
        {quote&&<div className='dz-order-review'><h3>Review one purchase</h3><p>{quote.description}</p><p>Maximum cost: {quote.price} {account?.currency} · {quote.market}{quote.payout!==undefined?` · quoted payout ${quote.payout}`:''}</p>{account?.type==='real'&&<label className='dz-field'>Type BUY REAL<input value={real} onChange={e=>setReal(e.target.value)}/></label>}<button className='dz-primary' disabled={busy||(account?.type==='real'&&real!=='BUY REAL')} onClick={buy}>Buy one {account?.type} contract</button><button className='dz-secondary' onClick={()=>setQuote(null)}>Cancel quote</button></div>}
        {pending&&<div className='dz-order-review'><h3>{pending==='unknown'?'Purchase outcome uncertain':`Contract ${pending}`}</h3>{pending==='unknown'?<p>Do not repeat the purchase. Check your Deriv statement and reconcile the outcome before continuing.</p>:<><p>{position?`Current P/L: ${position.profit} ${account?.currency}`:'Settlement not yet checked.'}</p><button className='dz-secondary' disabled={busy} onClick={()=>run(check)}>Refresh contract</button>{Boolean(position?.is_valid_to_sell)&&<button className='dz-primary' disabled={busy} onClick={()=>run(async()=>{if(!window.confirm('Sell this open contract at Deriv’s available market price?'))return;await broker.current!.sell(pending);await check();})}>Sell at market price</button>}</>}</div>}
        <p role='status'>{message}</p><p>Availability depends on the market and account. Leaving this page does not cancel a purchased contract. Reconnect here to reconcile it; pending purchases are never automatically retried.</p>
    </section>;
}
