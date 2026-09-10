import { LiveMarketProvider, LiveTape } from '../dzenith-tools/live-market';
import '../dzenith-tools/styles.scss';
import './dashboard.scss';
import './command-center.scss';

export default function Dashboard({ handleTabChange }: { handleTabChange: (index: number) => void }) {
    return (
        <div className='dz-command dz-tool-page'>
            <section className='dz-command-hero'>
                <div className='dz-command-copy'>
                    <span className='dz-eyebrow'>D-ZENITH / YOUR TRADING HQ</span>
                    <h1>
                        Find your rhythm.
                        <br />
                        <em>Own your next move.</em>
                    </h1>
                    <p>
                        One cockpit for the tick stream, your strategies, and the decisions that stay yours. Less noise.
                        More control.
                    </p>
                    <div className='dz-command-actions'>
                        <button className='dz-primary' onClick={() => handleTabChange(4)}>
                            Enter the live desk <span>↗</span>
                        </button>
                        <button className='dz-secondary' onClick={() => handleTabChange(1)}>
                            Open Bot Builder
                        </button>
                    </div>
                    <div className='dz-command-tags'>
                        <span>01 / OBSERVE</span>
                        <span>02 / BUILD</span>
                        <span>03 / TEST</span>
                    </div>
                </div>
                <div className='dz-core-art' aria-hidden='true'>
                    <div className='dz-core-orbit' />
                    <div className='dz-core-orbit dz-core-orbit--inner' />
                    <div className='dz-core-mark'>✦</div>
                    <span className='dz-core-label'>D-Z / COMMAND CORE</span>
                    <span className='dz-core-coordinate'>
                        SYNTHETIC INDICES
                        <br />
                        PRECISION OVER NOISE
                    </span>
                </div>
            </section>
            <section className='dz-command-section'>
                <div className='dz-command-title'>
                    <span className='dz-eyebrow'>THE TICK STREAM</span>
                    <h2>Real numbers. Right now.</h2>
                    <p>Live public data from Deriv. No simulated returns.</p>
                </div>
                <LiveMarketProvider>
                    <LiveTape />
                </LiveMarketProvider>
            </section>
            <section className='dz-launch-grid' aria-label='Choose your workspace'>
                {[
                    {
                        n: '01',
                        icon: '⌁',
                        title: 'Read the tape',
                        description: 'Watch the last ten digits and measure a rolling market sample.',
                        action: 'Market analysis',
                        tab: 4,
                    },
                    {
                        n: '02',
                        icon: '◇',
                        title: 'Build your playbook',
                        description: 'Arrange blocks, define conditions, and test a strategy with demo funds.',
                        action: 'Bot Builder',
                        tab: 1,
                    },
                    {
                        n: '03',
                        icon: '◎',
                        title: 'Follow with limits',
                        description: 'Set up a copy-trading plan. Execution requires a connected lead-trader service.',
                        action: 'Copy trading setup',
                        tab: 9,
                    },
                ].map(item => (
                    <button key={item.n} className='dz-launch-card' onClick={() => handleTabChange(item.tab)}>
                        <span className='dz-launch-number'>{item.n} / WORKSPACE</span>
                        <span className='dz-launch-icon'>{item.icon}</span>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <span className='dz-launch-link'>{item.action} ↗</span>
                    </button>
                ))}
            </section>
            <footer className='dz-command-footer'>
                <span>D-ZENITH / STAY IN CONTROL</span>
                <p>
                    Trading can result in loss of your entire stake. Historical tick patterns do not predict the next
                    outcome. Practice on demo before risking funds.
                </p>
            </footer>
        </div>
    );
}
