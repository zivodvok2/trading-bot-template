import React from 'react';
import './styles.scss';
import CopyTrading from './copy-trading';
import { MarketOverview, AnalysisLab } from './market-workbench';
import TradeTicket from './trade-ticket';
import FreeBots from './free-bots';
import { LiveStatus, LiveTape } from './live-market';

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

const META: Record<string, { eyebrow: string; title: string; intro: string }> = {
    market_analysis: {
        eyebrow: 'Market Analysis',
        title: 'Read the tape before choosing a contract.',
        intro: 'Live price action, digit distribution and market movement at a glance.',
    },
    manual_trader: {
        eyebrow: 'Manual Trader',
        title: 'Choose the contract, then define the risk.',
        intro: 'Quote, review and buy one contract on your selected Deriv account.',
    },
    ai_trader: {
        eyebrow: 'Auto Trader',
        title: 'Analyse. Execute. Stay in control.',
        intro: 'A single site-wide session, explicit permission and visible risk limits.',
    },
    free_bots: {
        eyebrow: 'Free Bots',
        title: 'Your next strategy starts in the builder.',
        intro: 'Load an original XML bot, inspect its rules, and test on demo.',
    },
    analysis_tool: {
        eyebrow: 'Analysis Tool',
        title: 'Measure digits, direction and volatility.',
        intro: 'Freeze a sample and investigate historical rules without placing trades.',
    },
    copy_trading: {
        eyebrow: 'Copy Trading',
        title: 'Their trades. Your boundaries.',
        intro: 'Connect a trader code through Deriv copy trading. Review the account and limits before enabling mirroring.',
    },
    accumulators: {
        eyebrow: 'Accumulators',
        title: 'Configure growth rate and market behavior.',
        intro: 'Understand range risk, choose growth and take profit, then review a live quote.',
    },
    competition: {
        eyebrow: 'Competition',
        title: 'Compete on consistency, not noise.',
        intro: 'Competition status and published rules will appear here when available.',
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
function Competition() {
    return <Panel title='Competition centre'><h2>No active competition</h2><p className='dz-muted-copy'>This area is reserved for published rules, dates and verified results. No entry fees, registrations or prize claims are being accepted until a competition service and organiser are configured.</p></Panel>;
}
function Automation({ kind }: { kind: string }) {
    return <Panel title={kind === 'ea_bots' ? 'EA Bots · MT5 workspace' : 'Automation presets'}>
        {kind === 'ea_bots' ? <><h2>Expert advisors run in MT5</h2><p className='dz-muted-copy'>An MT5 expert advisor is not a Blockly XML bot. Install and test the EA in your MT5 terminal using a demo account. This browser cannot execute an EX5 or MQL5 file. Use Free Bots for browser-compatible XML strategies.</p></> : <><h2>{kind === 'speed_bot' ? 'Short-duration automation' : 'Rule-based automation'}</h2><p className='dz-muted-copy'>Use the shared Auto Trader console to choose a strategy, tick duration, fixed stake, cooldown and session limits. These pages do not start separate hidden bots.</p><button className='dz-primary' onClick={() => window.dispatchEvent(new Event('dzenith:open-auto'))}>Open Auto Trader controls</button></>}
    </Panel>;
}
export default function DZenithTools({ variant }: { variant: Variant }) {
    const meta = META[variant];
    const body =
        variant === 'market_analysis' ? (
            <MarketOverview />
        ) : variant === 'analysis_tool' ? (
            <AnalysisLab />
        ) : variant === 'manual_trader' ? (
            <TradeTicket />
        ) : variant === 'ai_trader' ? (
            <section className='dz-panel'><h2>Your site-wide Auto Trader</h2><p>Open the floating Auto Trader console at the bottom right. It keeps analysing the selected market across all site tabs. Verify an account and explicitly arm a session to enable purchases.</p><p>Rules use recent tick frequencies, not a trained prediction model. You choose when to start; fixed-stake and session limits control execution. No proven trading edge is claimed.</p></section>
        ) : variant === 'free_bots' ? (
            <FreeBots />
        ) : variant === 'copy_trading' ? (
            <CopyTrading />
        ) : variant === 'accumulators' ? (
            <TradeTicket accumulator />
        ) : variant === 'competition' ? (
            <Competition />
        ) : (
            <Automation kind={variant} />
        );
    const page = (
        <main className='dz-tool-page'>
            <header className='dz-page-heading'>
                <div>
                    <span className='dz-eyebrow'>{meta.eyebrow}</span>
                    <h1>{meta.title}</h1>
                    <p>{meta.intro}</p>
                </div>
                {variant === 'copy_trading' ? (
                    <div className='dz-connection-card'>
                        Deriv copy link<small>Separate account authorization</small>
                    </div>
                ) : (
                    <LiveStatus />
                )}
            </header>
            {!['copy_trading', 'analysis_tool', 'free_bots', 'competition', 'ea_bots'].includes(variant) && <LiveTape />}
            {body}
        </main>
    );
    return page;
}
