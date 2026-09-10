import { useEffect, useRef, useState } from 'react';
import type { CopytradingList } from '@deriv/api-types';
import { CopyConnection, copyRequest, CopyResponse } from './copy-api';

export default function CopyTrading() {
    const client = useRef<CopyConnection | null>(null);
    const [appId, setAppId] = useState('');
    const [token, setToken] = useState('');
    const [code, setCode] = useState('');
    const [minimum, setMinimum] = useState('0.35');
    const [maximum, setMaximum] = useState('2');
    const [account, setAccount] = useState<CopyResponse['authorize']>();
    const [traders, setTraders] = useState<CopytradingList['traders']>([]);
    const [review, setReview] = useState<ReturnType<typeof copyRequest> | null>(null);
    const [agreed, setAgreed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Not connected. No trades will be copied until you authorize and confirm.');
    const [synced, setSynced] = useState(false);
    useEffect(
        () => () => {
            client.current?.close();
            client.current = null;
        },
        []
    );
    const refresh = async (connection: CopyConnection) => {
        setSynced(false);
        const response = await connection.request({ copytrading_list: 1 });
        if (!response.copytrading_list) throw new Error('Deriv did not confirm the active copy list.');
        if (client.current !== connection) return;
        setTraders(response.copytrading_list.traders);
        setSynced(true);
    };
    const run = async (operation: () => Promise<void>) => {
        setBusy(true);
        try {
            await operation();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to complete the request.');
        } finally {
            setBusy(false);
        }
    };
    const connect = () =>
        run(async () => {
            if (!token.trim())
                throw new Error('Enter your follower account API token with the required trading permissions.');
            const connection = new CopyConnection(appId.trim(), () => {
                if (client.current === connection) {
                    setAccount(undefined);
                    setSynced(false);
                    setReview(null);
                    setTraders([]);
                    setMessage(
                        'Disconnected. Existing server-side copying may still be active. Reconnect to check or stop it.'
                    );
                }
            });
            client.current?.close();
            client.current = connection;
            try {
                const response = await connection.request({ authorize: token.trim() });
                setToken('');
                if (!response.authorize) throw new Error('Deriv did not authorize this account.');
                setAccount(response.authorize);
                await refresh(connection);
                setMessage('Account connected. Active copy relationships refreshed from Deriv.');
            } catch (error) {
                setToken('');
                connection.close();
                throw error;
            }
        });
    const prepare = () => {
        try {
            setReview(copyRequest(code, minimum, maximum));
            setAgreed(false);
            setMessage('Review the destination account and stake filters below. Nothing has been started.');
        } catch (error) {
            setMessage((error as Error).message);
        }
    };
    const start = () =>
        run(async () => {
            if (!client.current || !account || !review || !agreed || !synced) return;
            const connection = client.current;
            const request = review;
            setReview(null);
            setAgreed(false);
            setSynced(false);
            const response = await connection.request(request);
            if (response.copy_start !== 1)
                throw new Error('Start was not confirmed. Refresh the list before trying again.');
            setCode('');
            setMessage('Deriv confirmed copying started. Refreshing active relationships…');
            await refresh(connection);
        });
    const stop = (trader: CopytradingList['traders'][number]) =>
        run(async () => {
            if (!client.current || !trader.token || !account) return;
            const connection = client.current;
            setSynced(false);
            const response = await connection.request({ copy_stop: trader.token });
            if (response.copy_stop !== 1) throw new Error('Stop was not confirmed. Refresh the list before retrying.');
            setMessage('Deriv confirmed copying stopped. Already-open contracts may remain open.');
            await refresh(connection);
        });
    return (
        <div className='dz-stack'>
            <div className='dz-copy-grid'>
                <section className='dz-panel'>
                    <span className='dz-eyebrow'>01 / FOLLOWER ACCOUNT</span>
                    <h2>Connect. Review. Then follow.</h2>
                    <p>
                        Use the lead trader’s copy token—not their password. Your own API token authorizes the account
                        that will copy trades.
                    </p>
                    {!account ? (
                        <>
                            <label className='dz-field'>
                                Registered legacy App ID
                                <input
                                    inputMode='numeric'
                                    value={appId}
                                    onChange={e => setAppId(e.target.value)}
                                    placeholder='Numeric Deriv App ID'
                                    disabled={busy}
                                />
                            </label>
                            <label className='dz-field'>
                                Your follower API token
                                <input
                                    type='password'
                                    autoComplete='off'
                                    value={token}
                                    onChange={e => setToken(e.target.value)}
                                    placeholder='Kept in memory, never saved'
                                    disabled={busy}
                                />
                            </label>
                            <button className='dz-primary' disabled={busy} onClick={connect}>
                                {busy ? 'Connecting…' : 'Connect follower account'}
                            </button>
                        </>
                    ) : (
                        <>
                            <p className='dz-copy-notice'>
                                {account.is_virtual ? 'DEMO' : 'REAL MONEY'} · {account.loginid} · {account.currency}
                            </p>
                            <label className='dz-field'>
                                Lead trader’s copy token
                                <input
                                    type='password'
                                    autoComplete='off'
                                    value={code}
                                    onChange={e => {
                                        setCode(e.target.value);
                                        setReview(null);
                                    }}
                                    disabled={busy}
                                />
                            </label>
                            <div className='dz-form-row'>
                                <label className='dz-field'>
                                    Minimum trade stake ({account.currency})
                                    <input
                                        type='number'
                                        step='0.01'
                                        min='0.01'
                                        value={minimum}
                                        onChange={e => {
                                            setMinimum(e.target.value);
                                            setReview(null);
                                        }}
                                        disabled={busy}
                                    />
                                </label>
                                <label className='dz-field'>
                                    Maximum trade stake ({account.currency})
                                    <input
                                        type='number'
                                        step='0.01'
                                        min='0.01'
                                        value={maximum}
                                        onChange={e => {
                                            setMaximum(e.target.value);
                                            setReview(null);
                                        }}
                                        disabled={busy}
                                    />
                                </label>
                            </div>
                            <p>
                                These are Deriv’s per-trade stake filters, not a session loss cap or a guaranteed
                                follower stake.
                            </p>
                            <button className='dz-primary' disabled={busy || !synced} onClick={prepare}>
                                Review copy setup ↗
                            </button>
                            <button
                                className='dz-secondary'
                                disabled={busy}
                                onClick={() => {
                                    client.current?.close();
                                    setCode('');
                                }}
                            >
                                Disconnect session
                            </button>
                        </>
                    )}
                    {review && account && (
                        <div className='dz-copy-review'>
                            <h2>Confirm {account.is_virtual ? 'demo' : 'real-money'} copying</h2>
                            <p>
                                Follower: {account.loginid}. Lead code: ••••{review.copy_start.slice(-4)}. Stake
                                filters: {review.min_trade_stake}–{review.max_trade_stake} {account.currency}.
                            </p>
                            <label>
                                <input type='checkbox' checked={agreed} onChange={e => setAgreed(e.target.checked)} />I
                                understand this starts automatic trades and can lose funds. Closing this page does not
                                stop server-side copying.
                            </label>
                            <button className='dz-primary' disabled={!agreed || busy || !synced} onClick={start}>
                                Confirm and start copying
                            </button>
                            <button className='dz-secondary' disabled={busy} onClick={() => setReview(null)}>
                                Cancel
                            </button>
                        </div>
                    )}
                </section>
                <aside className='dz-panel'>
                    <span className='dz-eyebrow'>COPY LINK / DERIV LEGACY</span>
                    <h2>A separate connection. Same control.</h2>
                    {[
                        [
                            '1',
                            'Authorize yourself',
                            'Connect your follower account directly to Deriv. Start with a demo account.',
                        ],
                        [
                            '2',
                            'Add a trader code',
                            'The lead trader must have copy trading enabled and share the appropriate copy token.',
                        ],
                        [
                            '3',
                            'Check, then confirm',
                            'Review stake filters and account type before allowing automated copying.',
                        ],
                    ].map(([n, title, detail]) => (
                        <div key={n} className='dz-copy-step'>
                            <b>{n}</b>
                            <div>
                                <strong>{title}</strong>
                                <p>{detail}</p>
                            </div>
                        </div>
                    ))}
                    <p className='dz-copy-notice'>
                        The newer Options connection does not support this legacy list request. This panel needs your
                        own numeric legacy App ID and an eligible Deriv account. No credentials are stored in local
                        storage or sent to a D-Zenith server.
                    </p>
                    <p>
                        Disconnecting or leaving this tab does not stop copying on Deriv. Use Stop copying and wait for
                        confirmation. No automatic retry of start/stop requests.
                    </p>
                </aside>
            </div>
            <div className='dz-copy-activity' role='status'>
                {message}
            </div>
            <section className='dz-panel dz-work-panel'>
                <div className='dz-panel-heading'>
                    Active copy relationships
                    <button
                        className='dz-secondary'
                        disabled={!account || busy}
                        onClick={() =>
                            run(async () => {
                                if (client.current) {
                                    await refresh(client.current);
                                    setMessage('Active relationships refreshed from Deriv.');
                                }
                            })
                        }
                    >
                        Refresh from Deriv
                    </button>
                </div>
                {!synced ? (
                    <p className='dz-muted-copy'>
                        No verified list available. Connect or refresh to check the server state.
                    </p>
                ) : !traders.length ? (
                    <p className='dz-muted-copy'>Deriv reports no active traders for this follower account.</p>
                ) : (
                    traders.map((trader, index) => (
                        <div className='dz-copy-review' key={trader.loginid || index}>
                            <strong>{trader.loginid || 'Lead trader'}</strong>
                            <p>
                                Stake filters: {trader.min_trade_stake ?? 'Not set'}–
                                {trader.max_trade_stake ?? 'Not set'} {account?.currency}
                            </p>
                            <button
                                className='dz-secondary'
                                disabled={busy || !trader.token || !synced}
                                onClick={() => stop(trader)}
                            >
                                Stop copying
                            </button>
                        </div>
                    ))
                )}
            </section>
        </div>
    );
}
