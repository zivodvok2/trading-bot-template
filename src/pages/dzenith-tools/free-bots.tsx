import { useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { api_base, load } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';

export const FREE_BOTS = [
    {
        name: 'BA Alpha — Over/Under',
        file: 'even-odd-percentage.xml',
        description:
            'The original library labeled this Even Odd, but its supplied XML trades Over/Under. Review its stake settings before running.',
    },
    {
        name: 'Digit Over Compounder',
        file: 'digit-over-compounder.xml',
        description: 'Original digit-over compounding strategy. Stake progression can increase losses.',
    },
    {
        name: 'Dynamic Digits Auto Bot',
        file: 'dynamic-digits.xml',
        description: 'Original dynamic digits strategy. Inspect the contract and restart rules before running.',
    },
];

export default function FreeBots() {
    const { dashboard } = useStore();
    const [loading, setLoading] = useState('');
    const [error, setError] = useState('');
    const busy = useRef(false);
    const open = async (bot: (typeof FREE_BOTS)[number]) => {
        if (busy.current) return;
        setError('');
        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace) {
            setError('Bot Builder is still initializing. Please try again shortly.');
            return;
        }
        if (api_base.is_running) {
            setError('Stop the running bot before loading another strategy.');
            return;
        }
        if (
            workspace.getAllBlocks().length &&
            !window.confirm(
                `Load ${bot.name}? This replaces the current builder workspace. Save any changes you want to keep first. No trades will start.`
            )
        )
            return;
        busy.current = true;
        setLoading(bot.name);
        const backup = window.Blockly.Xml.workspaceToDom(workspace);
        let importing = false;
        try {
            const response = await fetch(`/free-bots/${bot.file}`);
            if (!response.ok) throw new Error('The strategy file could not be downloaded. Please try again.');
            const xml = await response.text();
            if (api_base.is_running) throw new Error('Stop the running bot before loading another strategy.');
            importing = true;
            const result = await load({
                block_string: xml,
                file_name: bot.name,
                workspace,
                from: save_types.UNSAVED,
                drop_event: null,
                strategy_id: null,
                showIncompatibleStrategyDialog: null,
            });
            if (result?.error) throw new Error(result.error);
            dashboard.setActiveTab(1);
        } catch (cause) {
            if (importing) window.Blockly.Xml.clearWorkspaceAndLoadFromXml(backup, workspace);
            setError(cause instanceof Error ? cause.message : 'Unable to load this strategy.');
        } finally {
            busy.current = false;
            setLoading('');
        }
    };
    return (
        <section className='dz-panel dz-work-panel'>
            <div className='dz-panel-heading'>Strategy library</div>
            <p className='dz-muted-copy'>
                Choose a bot to import its actual strategy into Bot Builder. Loading never starts trading. Review all
                settings and test with demo funds first; these original strategies are not verified profitable.
            </p>
            <div className='dz-bot-grid'>
                {FREE_BOTS.map(bot => (
                    <button
                        className='dz-bot-card'
                        key={bot.file}
                        disabled={Boolean(loading)}
                        onClick={() => void open(bot)}
                    >
                        <span>Blockly strategy</span>
                        <b>{bot.name}</b>
                        <p>{bot.description}</p>
                        <small>{loading === bot.name ? 'Loading strategy…' : 'Load into Bot Builder →'}</small>
                    </button>
                ))}
            </div>
            {error && (
                <p role='alert' className='dz-result'>
                    {error}
                </p>
            )}
            <p className='dz-muted-copy'>
                Under 8 Smart Strategy requires unsupported custom purchase and risk-control blocks, so importing it is
                disabled. Even Odd Pattern Reverse and Fibonacci Sequence Bot have no matching XML in the original
                library.
            </p>
        </section>
    );
}
