import type { CopytradingList } from '@deriv/api-types';
export type CopyResponse = {
    req_id?: number;
    error?: { code?: string };
    authorize?: { loginid: string; currency: string; is_virtual: number };
    copytrading_list?: CopytradingList;
    copy_start?: number;
    copy_stop?: number;
};

// This API belongs to Deriv's legacy copy-trading service, not the Options OAuth socket.
// Tokens are held only by the caller in memory and are never persisted or logged.
export class CopyConnection {
    private socket: WebSocket;
    private sequence = 0;
    private pending = new Map<
        number,
        {
            resolve: (response: CopyResponse) => void;
            reject: (error: Error) => void;
            timer: ReturnType<typeof setTimeout>;
        }
    >();
    private heartbeat?: ReturnType<typeof setInterval>;
    private opened: Promise<void>;
    constructor(appId: string, onClose: () => void) {
        if (!/^\d+$/.test(appId)) throw new Error('Enter your registered numeric legacy App ID.');
        this.socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`);
        this.opened = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Deriv connection timed out.'));
                this.close();
            }, 12000);
            this.socket.onopen = () => {
                clearTimeout(timer);
                resolve();
                this.heartbeat = setInterval(() => {
                    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ ping: 1 }));
                }, 25000);
            };
            this.socket.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Could not connect to Deriv. Check the legacy App ID and connection.'));
                this.close();
            };
            this.socket.onclose = () => {
                clearTimeout(timer);
                clearInterval(this.heartbeat);
                reject(new Error('Deriv connection closed.'));
                this.pending.forEach(item => {
                    clearTimeout(item.timer);
                    item.reject(
                        new Error(
                            'Connection lost. An operation may have completed. Reconnect and refresh the list before retrying.'
                        )
                    );
                });
                this.pending.clear();
                onClose();
            };
        });
        this.socket.onmessage = event => {
            let response: CopyResponse;
            try {
                response = JSON.parse(event.data);
            } catch {
                return;
            }
            const item = response.req_id ? this.pending.get(response.req_id) : undefined;
            if (!item || !response.req_id) return;
            clearTimeout(item.timer);
            this.pending.delete(response.req_id);
            if (response.error)
                item.reject(
                    new Error(
                        response.error.code === 'UnrecognisedRequest'
                            ? 'Copy trading is unavailable on this Deriv endpoint/account.'
                            : 'Deriv declined the request. Check token permissions, account eligibility and trader code.'
                    )
                );
            else item.resolve(response);
        };
    }
    async request(payload: Record<string, unknown>): Promise<CopyResponse> {
        await this.opened;
        if (this.socket.readyState !== WebSocket.OPEN) throw new Error('Reconnect to Deriv before continuing.');
        return new Promise((resolve, reject) => {
            const req_id = ++this.sequence;
            const timer = setTimeout(() => {
                this.pending.delete(req_id);
                reject(
                    new Error(
                        'No confirmation received. Do not repeat a start/stop request until you refresh the active list.'
                    )
                );
            }, 12000);
            this.pending.set(req_id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ ...payload, req_id }));
        });
    }
    close() {
        clearInterval(this.heartbeat);
        this.socket.close();
    }
}

export function copyRequest(code: string, minimum: string, maximum: string) {
    const min = Number(minimum),
        max = Number(maximum);
    if (!/^[a-zA-Z0-9]{8,128}$/.test(code.trim()))
        throw new Error('Enter the copy token shared by the lead trader, not a login ID or URL.');
    if (!minimum.trim() || !maximum.trim() || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min)
        throw new Error('Set a positive minimum and a maximum greater than or equal to it.');
    return { copy_start: code.trim(), min_trade_stake: min, max_trade_stake: max };
}
