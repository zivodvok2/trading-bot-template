import { CopyConnection } from './copy-api';
class Socket {
    static OPEN = 1;
    static last: Socket;
    readyState = 1;
    onopen?: () => void;
    onerror?: () => void;
    onclose?: () => void;
    onmessage?: (e: { data: string }) => void;
    send = jest.fn();
    close = jest.fn(() => {
        this.readyState = 3;
        this.onclose?.();
    });
    constructor(public url: string) {
        Socket.last = this;
    }
}
const original = global.WebSocket;
beforeEach(() => {
    jest.useFakeTimers();
    global.WebSocket = Socket as unknown as typeof WebSocket;
});
afterEach(() => {
    global.WebSocket = original;
    jest.useRealTimers();
});
test('uses isolated legacy endpoint and correlates responses', async () => {
    const api = new CopyConnection('12345', jest.fn());
    const socket = Socket.last;
    socket.onopen?.();
    const result = api.request({ copytrading_list: 1 });
    await Promise.resolve();
    expect(socket.url).toBe('wss://ws.derivws.com/websockets/v3?app_id=12345');
    const { req_id } = JSON.parse(socket.send.mock.calls[0][0]);
    socket.onmessage?.({ data: JSON.stringify({ req_id, copytrading_list: { traders: [], copiers: [] } }) });
    await expect(result).resolves.toMatchObject({ copytrading_list: { traders: [] } });
    api.close();
});
test('does not retry a timed-out trade mutation', async () => {
    const api = new CopyConnection('12345', jest.fn());
    Socket.last.onopen?.();
    const result = api.request({ copy_start: 'testcode123' });
    await Promise.resolve();
    const rejection = expect(result).rejects.toThrow('No confirmation');
    jest.advanceTimersByTime(12000);
    await rejection;
    expect(Socket.last.send).toHaveBeenCalledTimes(1);
    api.close();
});
