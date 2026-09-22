import { useStore } from '@/hooks/useStore';
import './ai-trader-button.scss';

// Index of the 'ai_trader' tab in main.tsx's DBOT_TABS-style hash/tab order.
// Kept in sync with the `hash` array and the <div id='id-ai-trader'> tab in
// src/pages/main/main.tsx -- update both if that ordering ever changes.
const AI_TRADER_TAB_INDEX = 7;

export default function AiTraderButton() {
    const store = useStore();
    const openAiTrader = () => {
        store?.dashboard?.setActiveTab(AI_TRADER_TAB_INDEX);
    };
    return (
        <button type='button' className='dz-ai-trader-fab' onClick={openAiTrader} aria-label='Open Auto Trader'>
            <span className='dz-ai-trader-fab__icon' aria-hidden='true'>
                ✦
            </span>
            <span className='dz-ai-trader-fab__label'>Auto Trader</span>
        </button>
    );
}
