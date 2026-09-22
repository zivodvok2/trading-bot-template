import { fireEvent, render, screen } from '@testing-library/react';
import AiTraderButton from './ai-trader-button';

const setActiveTab = jest.fn();
jest.mock('@/hooks/useStore', () => ({
    useStore: jest.fn(() => ({ dashboard: { setActiveTab: setActiveTab } })),
}));

beforeEach(() => {
    setActiveTab.mockClear();
});

test('jumps straight to the Auto Trader tab when clicked', () => {
    render(<AiTraderButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Auto Trader' }));
    expect(setActiveTab).toHaveBeenCalledWith(7);
});

test('does not throw when the store is not ready yet', () => {
    const { useStore } = require('@/hooks/useStore');
    useStore.mockReturnValueOnce(null);
    render(<AiTraderButton />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Open Auto Trader' }))).not.toThrow();
});
