import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api_base, load } from '@/external/bot-skeleton';
import FreeBots, { FREE_BOTS } from './free-bots';
const navigate = jest.fn();
jest.mock('@/hooks/useStore', () => ({ useStore: () => ({ dashboard: { setActiveTab: navigate } }) }));
jest.mock('@/external/bot-skeleton', () => ({ load: jest.fn(), api_base: { is_running: false } }));
const originalFetch = global.fetch;
const originalBlockly = window.Blockly;
beforeEach(() => {
    jest.clearAllMocks();
    api_base.is_running = false;
    global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, text: async () => '<xml><block type="trade_definition"/></xml>' });
    (load as jest.Mock).mockResolvedValue(undefined);
    window.Blockly = {
        derivWorkspace: { getAllBlocks: () => [{}] },
        Xml: { workspaceToDom: jest.fn(() => 'backup'), clearWorkspaceAndLoadFromXml: jest.fn() },
    } as unknown as typeof window.Blockly;
    jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
    global.fetch = originalFetch;
    window.Blockly = originalBlockly;
    jest.restoreAllMocks();
});
test.each(FREE_BOTS)('imports $name and selects the actual builder tab', async bot => {
    render(<FreeBots />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(bot.name) }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(1));
    expect(fetch).toHaveBeenCalledWith(`/free-bots/${bot.file}`);
    expect(load).toHaveBeenCalledWith(
        expect.objectContaining({ file_name: bot.name, workspace: window.Blockly.derivWorkspace })
    );
    expect(load).toHaveBeenCalledTimes(1);
});
test('cancel preserves existing workspace', () => {
    jest.mocked(window.confirm).mockReturnValue(false);
    render(<FreeBots />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(fetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
});
test('failed import restores workspace and does not navigate', async () => {
    (load as jest.Mock).mockResolvedValue({ error: 'Unsupported strategy' });
    render(<FreeBots />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported strategy');
    expect(window.Blockly.Xml.clearWorkspaceAndLoadFromXml).toHaveBeenCalledWith(
        'backup',
        window.Blockly.derivWorkspace
    );
    expect(navigate).not.toHaveBeenCalled();
});
test('download error does not touch workspace', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(<FreeBots />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be downloaded');
    expect(load).not.toHaveBeenCalled();
});
test('running bot prevents replacement', () => {
    api_base.is_running = true;
    render(<FreeBots />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByRole('alert')).toHaveTextContent('Stop the running bot');
    expect(fetch).not.toHaveBeenCalled();
});
