import { useState } from 'react';
import './dashboard.scss';

const watchlist = [
    { symbol: 'Volatility 75 Index', code: 'R_75', move: '+2.84%', tone: 'up' },
    { symbol: 'Boom 500 Index', code: 'BOOM500', move: '+1.19%', tone: 'up' },
    { symbol: 'Crash 1000 Index', code: 'CRASH1000', move: '-0.72%', tone: 'down' },
];

const Dashboard = () => {
    const [timeframe, setTimeframe] = useState('1H');
    return (
        <section className='dz-home'>
            <div className='dz-home__hero'><div><div className='dz-eyebrow'>D-ZENITH TRADING DESK</div><h1>Read the market.<br /><span>Trade with intent.</span></h1><p>A focused workspace for synthetic-index traders: live context, disciplined automation, and clear risk controls.</p><div className='dz-home__actions'><button className='dz-button dz-button--primary' onClick={() => window.location.hash = 'bot_builder'}>Build a strategy <span>↗</span></button><button className='dz-button dz-button--ghost' onClick={() => window.location.hash = 'chart'}>Open live charts</button></div></div><div className='dz-hero-card'><div className='dz-hero-card__top'><span className='dz-status-dot' /> MARKET PULSE <span className='dz-muted'>LIVE</span></div><div className='dz-hero-card__value'>+18.42%</div><div className='dz-sparkline'><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div className='dz-hero-card__foot'><span>Synthetic basket</span><strong>Last 24 hours</strong></div></div></div>
            <div className='dz-section-heading'><div><span className='dz-eyebrow'>YOUR EDGE</span><h2>Everything you need in one desk</h2></div><span className='dz-muted'>Demo-first · Risk-aware</span></div>
            <div className='dz-card-grid'><button className='dz-feature-card' onClick={() => window.location.hash = 'market_analysis'}><span className='dz-feature-card__icon'>⌁</span><strong>Market Analysis</strong><span>Spot momentum, volatility and market rhythm before you act.</span><small>Explore signals ↗</small></button><button className='dz-feature-card dz-feature-card--accent' onClick={() => window.location.hash = 'ai_trader'}><span className='dz-feature-card__icon'>✦</span><strong>AI Strategy Lab</strong><span>Turn a market view into a testable, rules-based plan.</span><small>Design a strategy ↗</small></button><button className='dz-feature-card' onClick={() => window.location.hash = 'free_bots'}><span className='dz-feature-card__icon'>◈</span><strong>Strategy Library</strong><span>Start with curated bot templates and make them your own.</span><small>Browse free bots ↗</small></button></div>
            <div className='dz-section-heading dz-section-heading--compact'><div><span className='dz-eyebrow'>WATCHLIST</span><h2>Markets in focus</h2></div><div className='dz-timeframes'>{['15M', '1H', '4H', '1D'].map(item => <button key={item} className={timeframe === item ? 'is-active' : ''} onClick={() => setTimeframe(item)}>{item}</button>)}</div></div>
            <div className='dz-watchlist'>{watchlist.map(item => <div className='dz-watchlist__row' key={item.code}><div><strong>{item.symbol}</strong><span>{item.code} · {timeframe} context</span></div><div className='dz-mini-chart'><i /><i /><i /><i /><i /><i /></div><b className={item.tone === 'up' ? 'dz-up' : 'dz-down'}>{item.move}</b><button>View →</button></div>)}</div>
            <p className='dz-disclaimer'>Synthetic indices involve substantial risk. D-Zenith provides tools and education, not financial advice. Test strategies on a demo account before using real funds.</p>
        </section>
    );
};
export default Dashboard;