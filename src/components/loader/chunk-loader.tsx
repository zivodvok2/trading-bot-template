import { useEffect, useState } from 'react';
import './zenith-loader.scss';

export default function ChunkLoader({ message }: { message: string }) {
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setSlow(true), 15000);
        return () => clearTimeout(timer);
    }, []);
    return (
        <div className='dz-boot' role='status' aria-live='polite'>
            <div className='dz-boot__grid' aria-hidden='true' />
            <div className='dz-boot__content'>
                <span className='dz-boot__brand'>D-ZENITH / SYSTEM LINK</span>
                <div className='dz-boot__core' aria-hidden='true'>
                    <i />
                    <i />
                    <b>✦</b>
                </div>
                <h2>{slow ? 'The link is taking longer.' : 'Powering your trading desk.'}</h2>
                <p>
                    {slow
                        ? 'Still waiting for the app or Deriv connection. You can reload and try again.'
                        : 'Getting your workspace ready. Stay sharp.'}
                </p>
                <div className='dz-boot__scan' aria-hidden='true' />
                <small>
                    {message
                        .replace(/Initializing Deriv Bot account\.\.\./i, 'Connecting to Deriv')
                        .replace(/Welcome to.*trading.*\.?/i, 'Preparing the workspace')}
                </small>
                {slow && <button onClick={() => window.location.reload()}>Retry connection ↗</button>}
                <span className='dz-boot__foot'>YOUR STRATEGY. YOUR LIMITS. YOUR CONTROL.</span>
            </div>
        </div>
    );
}
