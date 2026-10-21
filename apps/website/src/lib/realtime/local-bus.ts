import { initialBusState, reduceBusMessage } from './bus-state';
import { decodePing, encodePong, isBinaryFrame } from './clock';
import type { BusMessage, BusSharedState } from './types';
import { parseScreenReport, summariseHealth, type ReportEntry } from './wall-health';

// The bus without a server, for the static demo (GitHub Pages has no WebSocket server).
//
// Every page on the same origin (the simulator's iframes, or separate tabs) joins one
// BroadcastChannel. Each page keeps its own replica of the bus state and applies every
// intent, its own and others', with the same reducer the server uses (`bus-state.ts`) and the
// sender's timestamp, so all replicas reach the same scene state. A page that opens late asks
// the others for their state and adopts the newest. Clock pings are answered at once: pages
// on one machine share a clock.
//
// `LocalBusSocket` stands in for the WebSocket in `bus-engine.ts`, so the engines are unchanged.

const CHANNEL = 'mind-the-step-bus';
const HEALTH_PUSH_MS = 1_000;

type ChannelMessage =
    | { kind: 'message'; from: string; peer: string; at: number; message: BusMessage }
    | { kind: 'sync-request'; from: string }
    | { kind: 'sync-state'; from: string; state: BusSharedState }
    | { kind: 'bye'; from: string; peers: string[] };

function randomId() {
    return Math.random().toString(36).slice(2, 10);
}

class LocalHub {
    private state = initialBusState(Date.now());
    private readonly id = randomId();
    private readonly peers = new Set<LocalBusSocket>();
    private readonly reports = new Map<string, ReportEntry>();
    private readonly channel: BroadcastChannel | null;
    private healthTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.channel =
            typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
        if (this.channel) this.channel.onmessage = (event) => this.onChannel(event.data);
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', () =>
                this.post({
                    kind: 'bye',
                    from: this.id,
                    peers: [...this.peers].map((p) => p.peerId)
                })
            );
        }
    }

    attach(peer: LocalBusSocket) {
        this.peers.add(peer);
        peer.deliver({ type: 'hello', peerId: peer.peerId, state: this.state });
        this.post({ kind: 'sync-request', from: this.id });
    }

    detach(peer: LocalBusSocket) {
        this.peers.delete(peer);
        if (this.reports.delete(peer.peerId)) this.scheduleHealth();
    }

    receive(peer: LocalBusSocket, data: string | ArrayBuffer) {
        if (typeof data !== 'string') {
            const bytes = new Uint8Array(data);
            if (!isBinaryFrame(bytes)) return;
            const t0 = decodePing(bytes);
            if (t0 !== null) {
                const now = Date.now();
                peer.deliverBinary(encodePong(t0, now, now));
            }
            return;
        }
        let message: BusMessage;
        try {
            const parsed = JSON.parse(data) as unknown;
            if (typeof parsed !== 'object' || parsed === null) return;
            message = parsed as BusMessage;
        } catch {
            return;
        }
        const at = Date.now();
        this.apply(message, peer.peerId, at);
        this.post({ kind: 'message', from: this.id, peer: peer.peerId, at, message });
    }

    private onChannel(data: ChannelMessage) {
        if (!data || data.from === this.id) return;
        switch (data.kind) {
            case 'message':
                this.apply(data.message, data.peer, data.at);
                return;
            case 'sync-request':
                this.post({ kind: 'sync-state', from: this.id, state: this.state });
                return;
            case 'sync-state':
                // A replica that has seen more changes wins; ties keep ours.
                if (data.state.scene.revision > this.state.scene.revision) {
                    this.state = data.state;
                    this.broadcast({ type: 'scene/state', scene: this.state.scene });
                    this.broadcast({
                        type: 'screen/map-view',
                        city: this.state.city,
                        view: { zoom: this.state.zoom }
                    });
                }
                return;
            case 'bye':
                for (const peer of data.peers) this.reports.delete(peer);
                this.scheduleHealth();
                return;
        }
    }

    // The server's message handling (`routes/bus.ts`), applied to this page's replica.
    private apply(message: BusMessage, peerId: string, at: number) {
        if (message.type === 'screen/report') {
            const report = parseScreenReport(message);
            if (report) this.reports.set(peerId, { report, receivedAt: at });
            this.scheduleHealth();
            return;
        }
        if (message.type === 'control/join') {
            this.scheduleHealth();
            return;
        }
        const { state, broadcast } = reduceBusMessage(this.state, message, at);
        this.state = state;
        if (broadcast) {
            this.broadcast(broadcast);
            if (broadcast.type === 'scene/state') this.scheduleHealth();
            return;
        }
        // Relayed with the sender's peer id, so the sender's own engine drops its echo.
        this.broadcast({ ...message, peerId });
    }

    private scheduleHealth() {
        if (this.healthTimer !== null) return;
        this.healthTimer = setTimeout(() => {
            this.healthTimer = null;
            const health = summariseHealth(
                [...this.reports.values()],
                this.state.scene.revision,
                Date.now()
            );
            // Screens ignore it; control tablets show it.
            this.broadcast({ type: 'wall/health', health });
        }, HEALTH_PUSH_MS);
    }

    private broadcast(message: BusMessage) {
        for (const peer of this.peers) peer.deliver(message);
    }

    private post(message: ChannelMessage) {
        this.channel?.postMessage(message);
    }
}

let hub: LocalHub | null = null;

/** The subset of WebSocket that `bus-engine.ts` uses, backed by the page's LocalHub. */
export class LocalBusSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;

    readyState = LocalBusSocket.CONNECTING;
    binaryType: BinaryType = 'arraybuffer';
    readonly peerId = randomId();
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor() {
        hub ??= new LocalHub();
        // Open asynchronously, like a real socket, so the engine's handlers are set first.
        setTimeout(() => {
            if (this.readyState !== LocalBusSocket.CONNECTING) return;
            this.readyState = LocalBusSocket.OPEN;
            this.onopen?.();
            hub?.attach(this);
        }, 0);
    }

    send(data: string | ArrayBuffer) {
        if (this.readyState === LocalBusSocket.OPEN) hub?.receive(this, data);
    }

    close() {
        if (this.readyState === LocalBusSocket.CLOSED) return;
        this.readyState = LocalBusSocket.CLOSED;
        hub?.detach(this);
        this.onclose?.();
    }

    deliver(message: BusMessage) {
        if (this.readyState === LocalBusSocket.OPEN)
            this.onmessage?.({ data: JSON.stringify(message) });
    }

    deliverBinary(frame: ArrayBuffer) {
        if (this.readyState === LocalBusSocket.OPEN) this.onmessage?.({ data: frame });
    }
}

/** True in the static demo build (`VITE_LOCAL_BUS=1`), which has no server to connect to. */
export const USE_LOCAL_BUS = import.meta.env.VITE_LOCAL_BUS === '1';
