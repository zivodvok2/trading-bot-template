import React, { useState } from 'react';
import './styles.scss';
import { LiveMarketProvider, LiveStatus, LiveTape, LiveAnalysis, MarketSelector, LiveDigits } from './live-market';

type Variant =
    | 'market_analysis'
    | 'manual_trader'
    | 'ai_trader'
    | 'free_bots'
    | 'analysis_tool'
    | 'copy_trading'
    | 'accumulators'
    | 'competition'
    | 'ultimate_bot'
    | 'speed_bot'
    | 'ea_bots';

const BOTS = [
    ['Even Odd Percentage Based', 'Trade Even or Odd when the rolling percentage crosses your threshold.', 'Digit'],
    ['Even Odd Pattern Reverse', 'Read the last five digits and take the opposing parity signal.', 'Pattern'],
    ['Digit Over Compounder', 'Adaptive stake sizing with a hard session stop.', 'Compounding'],
    ['Under 8 Smart Strategy', 'Pattern recognition for Under 8 contracts.', 'Digit'],
    ['Dynamic Digits Auto Bot', 'Switch between digit types as distribution changes.', 'Adaptive'],
    ['Fibonacci Sequence Bot', 'Controlled progression with maximum steps and reset rules.', 'Risk'],
];
const META: Record<string, { eyebrow: string; title: string; intro: string }> = {
    market_analysis: {
        eyebrow: 'Market Analysis',
        title: 'Read the tape before choosing a contract.',
        intro: 'Market selection, digit distribution, direction balance and strategy signals from the original D-Zenith desk.',
    },
    manual_trader: {
        eyebrow: 'Manual Trader',
        title: 'Choose the contract, then define the risk.',
        intro: 'A real contract ticket for the strategy types and trade explanations used in the original project.',
    },
    ai_trader: {
        eyebrow: 'AI Strategy Lab',
        title: 'Convert your idea into rules you can audit.',
        intro: 'Draft a strategy with local templates. AI model integration is not yet connected; no trades are placed.',
    },
    free_bots: {
        eyebrow: 'Free Bots',
        title: 'Load a tested idea into Bot Builder.',
        intro: 'Ready-to-use digit, pattern, compounder and progression strategies.',
    },
    analysis_tool: {
        eyebrow: 'Analysis Tool',
        title: 'Measure digits, direction and volatility.',
        intro: 'Evaluate a sample before making a prediction.',
    },
    copy_trading: {
        eyebrow: 'Copy Trading',
        title: 'Compare playbooks before allocating risk.',
        intro: 'Review transparent assumptions and choose a demo allocation.',
    },
    accumulators: {
        eyebrow: 'Accumulators',
        title: 'Configure growth rate and market behavior.',
        intro: 'Supported markets, growth rates, live digits and stake controls.',
    },
    competition: {
        eyebrow: 'Competition',
        title: 'Compete on consistency, not noise.',
        intro: 'A leaderboard, prize structure and clear rules for synthetic-index practice.',
    },
    ultimate_bot: {
        eyebrow: 'Ultimate Bot',
        title: 'One control room for adaptive strategies.',
        intro: 'Combine a market, entry condition and session guardrails before a demo run.',
    },
    speed_bot: {
        eyebrow: 'Speed Bot',
        title: 'Fast entries need faster risk controls.',
        intro: 'Short-duration presets with a maximum-loss and stop-after-win plan.',
    },
    ea_bots: {
        eyebrow: 'EA Bots',
        title: 'Automate a plan you can still explain.',
        intro: 'Review expert-advisor style presets and export a ruleset.',
    },
};
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className='dz-panel dz-work-panel'>
            <div className='dz-panel-heading'>
                <span>{title}</span>
                <span className='dz-chip'>D-Zenith desk</span>
            </div>
            {children}
        </section>
    );
}
function SelectField({
    label,
    value,
    onChange,
    children,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}) {
    return (
        <label className='dz-field'>
            {label}
            <select value={value} onChange={e => onChange(e.target.value)}>
                {children}
            </select>
        </label>
    );
}
function Manual() {
    const [strategy, setStrategy] = useState('Rise / Fall');
    const [stake, setStake] = useState('2');
    const [status, setStatus] = useState('');
    return (
        <div className='dz-stack'>
            <Panel title='Contract ticket'>
                <div className='dz-form-row'>
                    <SelectField label='Contract strategy' value={strategy} onChange={setStrategy}>
                        <option>Rise / Fall</option>
                        <option>Multiplier Up</option>
                        <option>Multiplier Down</option>
                        <option>Digit Over / Under</option>
                        <option>Digit Even / Odd</option>
                        <option>Ends In / Out</option>
                    </SelectField>
                    <MarketSelector />
                </div>
                <div className='dz-form-row'>
                    <label className='dz-field'>
                        Stake
                        <input value={stake} onChange={e => setStake(e.target.value)} type='number' min='0.35' />
                    </label>
                    <label className='dz-field'>
                        Duration
                        <input defaultValue='5' type='number' min='1' />
                    </label>
                </div>
                <div className='dz-ticket-preview'>
                    <b>{strategy}</b>
                    <span>Demo order preview</span>
                    <small>Stake {'$' + stake} · 5 ticks</small>
                </div>
                <button
                    className='dz-primary'
                    onClick={() => setStatus('Demo order prepared — review before connecting your Deriv account.')}
                >
                    Prepare demo order →
                </button>
                {status && (
                    <div className='dz-result'>
                        <b>Ticket ready</b>
                        <span>{status}</span>
                    </div>
                )}
            </Panel>
            <Panel title='Before you trade'>
                <ul className='dz-check-list'>
                    <li>Confirm direction or barrier</li>
                    <li>Set a maximum session loss</li>
                    <li>Use demo funds while validating</li>
                    <li>Never chase a previous loss</li>
                </ul>
            </Panel>
        </div>
    );
}
function Ai() {
    const [idea, setIdea] = useState('');
    const [result, setResult] = useState('');
    return (
        <div className='dz-stack'>
            <Panel title='AI strategy brief'>
                <label className='dz-field'>
                    Describe the setup
                    <textarea
                        value={idea}
                        onChange={e => setIdea(e.target.value)}
                        placeholder='Compare the last 60 digits and only consider Over when distribution is stable...'
                    />
                </label>
                <div className='dz-form-row'>
                    <MarketSelector />
                    <SelectField label='Risk profile' value='Conservative' onChange={() => undefined}>
                        <option>Conservative</option>
                        <option>Balanced</option>
                        <option>Experimental</option>
                    </SelectField>
                </div>
                <button
                    className='dz-primary'
                    onClick={() =>
                        setResult(
                            idea
                                ? 'Use a 60-tick sample, require two confirming conditions, cap each stake at 1% of demo balance, and stop after three consecutive losses.'
                                : 'Describe your setup first, then generate an auditable ruleset.'
                        )
                    }
                >
                    Generate auditable ruleset →
                </button>
                {result && (
                    <div className='dz-result'>
                        <b>Local rules template · no AI model connected</b>
                        <span>{result}</span>
                    </div>
                )}
            </Panel>
            <Panel title='Guardrails'>
                <div className='dz-guardrail-grid'>
                    <b>Explainable</b>
                    <span>Every signal becomes a visible rule.</span>
                    <b>Demo-first</b>
                    <span>No order is sent from this panel.</span>
                    <b>Private</b>
                    <span>Provider secrets stay server-side.</span>
                </div>
            </Panel>
        </div>
    );
}
function Bots() {
    const [selected, setSelected] = useState('');
    return (
        <div className='dz-stack'>
            <Panel title='Strategy library'>
                <div className='dz-bot-grid'>
                    {BOTS.map(bot => (
                        <button
                            className={'dz-bot-card ' + (selected === bot[0] ? 'is-selected' : '')}
                            key={bot[0]}
                            onClick={() => setSelected(bot[0])}
                        >
                            <span>{bot[2]}</span>
                            <b>{bot[0]}</b>
                            <p>{bot[1]}</p>
                            <small>Open details →</small>
                        </button>
                    ))}
                </div>
                {selected && (
                    <div className='dz-result'>
                        <b>{selected}</b>
                        <span>Strategy selected. Assemble and test it in Bot Builder.</span>
                        <button className='dz-secondary' onClick={() => (window.location.hash = 'bot_builder')}>
                            Open Bot Builder
                        </button>
                    </div>
                )}
            </Panel>
            <Panel title='Risk calculator'>
                <div className='dz-stat-grid'>
                    <div>
                        <small>Suggested stake</small>
                        <b>0.5–1%</b>
                    </div>
                    <div>
                        <small>Stop after</small>
                        <b>3 losses</b>
                    </div>
                    <div>
                        <small>Mode</small>
                        <b>Demo first</b>
                    </div>
                </div>
            </Panel>
        </div>
    );
}
function Accumulators() {
    const [rate, setRate] = useState('3');
    const [stake, setStake] = useState('2');
    return (
        <div className='dz-stack'>
            <Panel title='Accumulator configurator'>
                <div className='dz-form-row'>
                    <MarketSelector />
                    <label className='dz-field'>
                        Stake (USD)
                        <input type='number' value={stake} onChange={e => setStake(e.target.value)} />
                    </label>
                    <label className='dz-field'>
                        Profit target (USD)
                        <input defaultValue='0.5' type='number' />
                    </label>
                </div>
                <div className='dz-rate-row'>
                    <span>Growth rate</span>
                    {['1', '2', '3', '4', '5'].map(r => (
                        <button className={rate === r ? 'is-active' : ''} onClick={() => setRate(r)} key={r}>
                            {r}%
                        </button>
                    ))}
                </div>
                <div className='dz-accu-card'>
                    <b>Selected market</b>
                    <span>
                        Last digits: <LiveDigits />
                    </span>
                    <small>
                        Rate {rate}% · stake {'$' + stake}
                    </small>
                    <button className='dz-primary'>Prepare accumulator demo</button>
                </div>
            </Panel>
            <Panel title='Supported behavior'>
                <p className='dz-muted-copy'>
                    Accumulators express a view on the range of movement of an index. Test growth rate with a demo
                    balance before any live use.
                </p>
            </Panel>
        </div>
    );
}
function Competition() {
    const [joined, setJoined] = useState(false);
    const rows = [
        ['🥇', 'CR10008059', '$0.37', 'Example'],
        ['🥈', 'CR8648863', '$0.04', 'Example'],
        ['🥉', 'CR1234567', '$0.00', 'Example'],
    ];
    return (
        <div className='dz-stack'>
            <Panel title='Competition preview — sample data, not live standings'>
                <div className='dz-competition-hero'>
                    <span>🏆</span>
                    <div>
                        <b>Prize pool: 1st $300 · 2nd $200 · 3rd $100</b>
                        <small>All trading must use Deriv synthetic indices.</small>
                    </div>
                    <button className='dz-primary' onClick={() => setJoined(true)}>
                        {joined ? 'Joined' : 'Join competition'}
                    </button>
                </div>
                <div className='dz-table-wrap'>
                    <table className='dz-table'>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Login ID</th>
                                <th>Net profit</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r[1]}>
                                    <td>{r[0]}</td>
                                    <td>{r[1]}</td>
                                    <td className='positive'>{r[2]}</td>
                                    <td>{r[3]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
            <Panel title='Competition rules'>
                <ul className='dz-check-list'>
                    <li>Start with a $10 real account</li>
                    <li>No deposits after the start</li>
                    <li>Net profit accounts for deposits and withdrawals</li>
                    <li>Top three participants win prizes</li>
                </ul>
            </Panel>
        </div>
    );
}
function Automation({ kind }: { kind: string }) {
    const labels =
        kind === 'ultimate_bot'
            ? ['Adaptive signal blend', 'Trend + digit confirmation', 'Session guardrail']
            : kind === 'speed_bot'
              ? ['Tick duration', 'Entry trigger', 'Max rapid trades']
              : ['Export format', 'Signal source', 'Execution mode'];
    return (
        <div className='dz-stack'>
            <Panel title={kind === 'ea_bots' ? 'Expert advisor workspace' : 'Automation controls'}>
                <div className='dz-form-row'>
                    <MarketSelector />
                    <SelectField label='Mode' value='Demo' onChange={() => undefined}>
                        <option>Demo</option>
                        <option>Backtest</option>
                        <option>Review only</option>
                    </SelectField>
                </div>
                <div className='dz-automation-list'>
                    {labels.map(label => (
                        <label className='dz-field' key={label}>
                            {label}
                            <input placeholder='Configure before running' />
                        </label>
                    ))}
                </div>
                <button className='dz-primary'>Validate automation plan →</button>
            </Panel>
            <Panel title='Execution boundary'>
                <p className='dz-muted-copy'>
                    This workspace validates rules. It does not promise profits or run unattended trades without
                    explicit account connection and approval.
                </p>
            </Panel>
        </div>
    );
}
export default function DZenithTools({ variant }: { variant: Variant }) {
    const meta = META[variant];
    const body =
        variant === 'market_analysis' ? (
            <LiveAnalysis />
        ) : variant === 'analysis_tool' ? (
            <LiveAnalysis tool />
        ) : variant === 'manual_trader' ? (
            <Manual />
        ) : variant === 'ai_trader' ? (
            <Ai />
        ) : variant === 'free_bots' || variant === 'copy_trading' ? (
            <Bots />
        ) : variant === 'accumulators' ? (
            <Accumulators />
        ) : variant === 'competition' ? (
            <Competition />
        ) : (
            <Automation kind={variant} />
        );
    return (
        <LiveMarketProvider key={variant}>
            <main className='dz-tool-page'>
                <header className='dz-page-heading'>
                    <div>
                        <span className='dz-eyebrow'>{meta.eyebrow}</span>
                        <h1>{meta.title}</h1>
                        <p>{meta.intro}</p>
                    </div>
                    <LiveStatus />
                </header>
                <LiveTape />
                {body}
            </main>
        </LiveMarketProvider>
    );
}
