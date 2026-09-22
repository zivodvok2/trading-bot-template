import { useState } from 'react';
import { useQuickAutoTrader } from './use-quick-auto-trader';
import './ai-trader-fab.scss';

export default function AiTraderFab() {
    const {
        settings,
        setSettings,
        account,
        phase,
        status,
        pendingId,
        report,
        markets,
        quickStart,
        confirmRealAndStart,
        cancelConfirm,
        reconcile,
    } = useQuickAutoTrader();
    const [showSettings, setShowSettings] = useState(false);

    const armed = report.running || report.busy || phase === 'armed';
    const label = armed ? 'Stop' : phase === 'connecting' ? 'Verifying…' : 'Auto Trader';
    const showPopover = phase === 'confirm-real' || armed || Boolean(status) || Boolean(pendingId) || showSettings;

    return (
        <div className='dz-ai-trader'>
            {showPopover && (
                <div className='dz-ai-trader__popover' role='dialog' aria-label='Auto Trader quick launch'>
                    {phase === 'confirm-real' && (
                        <div className='dz-ai-trader__confirm'>
                            <b>Real funds are at risk.</b>
                            <p>
                                {account?.id} will trade live on {settings.market} using the settings below. This can
                                lose the stake.
                            </p>
                            <div className='dz-ai-trader__actions'>
                                <button className='dz-primary' onClick={() => void confirmRealAndStart()}>
                                    Confirm &amp; start real trading
                                </button>
                                <button className='dz-secondary' onClick={cancelConfirm}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    {armed && (
                        <div className='dz-ai-trader__stats'>
                            <div>
                                <small>Trades</small>
                                <b>{report.trades}</b>
                            </div>
                            <div>
                                <small>P/L</small>
                                <b>{report.pnl.toFixed(2)}</b>
                            </div>
                            <div>
                                <small>Losses</small>
                                <b>{report.losses}</b>
                            </div>
                        </div>
                    )}
                    {pendingId && (
                        <div className='dz-ai-trader__pending'>
                            {pendingId === 'unknown' ? (
                                <span>
                                    No contract ID received. Check your Deriv statement; do not repeat the purchase.
                                </span>
                            ) : (
                                <>
                                    <span>Unresolved purchase: contract {pendingId}.</span>
                                    <button className='dz-secondary' onClick={() => void reconcile()}>
                                        Check settlement
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    {status && <p className='dz-ai-trader__status'>{status}</p>}
                    {showSettings && phase !== 'confirm-real' && !armed && (
                        <div className='dz-ai-trader__settings'>
                            <label>
                                Market
                                <select
                                    value={settings.market}
                                    onChange={e => setSettings({ market: e.target.value })}
                                >
                                    {markets.map(([symbol, name]) => (
                                        <option key={symbol} value={symbol}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Fixed stake
                                <input
                                    type='number'
                                    min={0.35}
                                    max={100}
                                    step={0.01}
                                    value={settings.stake}
                                    onChange={e => setSettings({ stake: Number(e.target.value) })}
                                />
                            </label>
                            <label>
                                Session loss cap
                                <input
                                    type='number'
                                    min={settings.stake}
                                    max={1000}
                                    step={0.01}
                                    value={settings.maxLoss}
                                    onChange={e => setSettings({ maxLoss: Number(e.target.value) })}
                                />
                            </label>
                            <p className='dz-ai-trader__hint'>
                                Same engine and limits as the Auto Trader tab. Open that tab for the full settings.
                            </p>
                        </div>
                    )}
                </div>
            )}
            <div className='dz-ai-trader__controls'>
                <button
                    type='button'
                    className='dz-ai-trader-fab__gear'
                    aria-label='Auto Trader quick settings'
                    aria-expanded={showSettings}
                    onClick={() => setShowSettings(value => !value)}
                >
                    ⚙
                </button>
                <button
                    type='button'
                    className={`dz-ai-trader-fab${armed ? ' dz-ai-trader-fab--armed' : ''}`}
                    onClick={() => void quickStart()}
                    disabled={phase === 'connecting'}
                    aria-label={armed ? 'Stop Auto Trader' : 'Start Auto Trader'}
                >
                    <span className='dz-ai-trader-fab__icon' aria-hidden='true'>
                        {armed ? '■' : '✦'}
                    </span>
                    <span className='dz-ai-trader-fab__label'>{label}</span>
                </button>
            </div>
        </div>
    );
}
