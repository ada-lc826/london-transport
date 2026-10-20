import { createFileRoute } from '@tanstack/react-router';
import { defineHooks, type Peer } from 'crossws';

import type { BusMessage } from '../lib/realtime';
import { initialBusState, reduceBusMessage } from '../lib/realtime/bus-state';
import { decodePing, encodePong, isBinaryFrame } from '../lib/realtime/clock';
import { parseScreenReport, summariseHealth, type ReportEntry } from '../lib/realtime/wall-health';

// In-memory bus state for this server process.
// New clients receive this snapshot in the `hello` handshake so they can
// join late without waiting for another control interaction.
let busSharedState = initialBusState(Date.now());

// Wall health: each screen's latest `screen/report`, and the control tablets that receive the
// summary. Screens report every few seconds, so the summary is sent at most once a second.
const HEALTH_PUSH_MS = 1_000;
const screenReports = new Map<string, ReportEntry>();
const controlPeers = new Map<string, Peer>();
let healthTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleHealthPush() {
    if (healthTimer !== null || controlPeers.size === 0) return;
    healthTimer = setTimeout(() => {
        healthTimer = null;
        sendHealth([...controlPeers.values()]);
    }, HEALTH_PUSH_MS);
}

function sendHealth(peers: Peer[]) {
    const health = summariseHealth(
        [...screenReports.values()],
        busSharedState.scene.revision,
        Date.now()
    );
    for (const peer of peers) peer.send({ type: 'wall/health', health });
}

const hooks = defineHooks({
    open(peer) {
        // `hello` is our bootstrap packet:
        // it communicates peer identity + current collaborative state.
        peer.send({
            type: 'hello',
            peerId: peer.id,
            state: busSharedState
        });

        // All collaborating clients publish/subscribe on one logical channel (`do`).
        // This keeps the demo simple while still showing fan-out semantics.
        peer.subscribe('do');
        peer.publish('do', {
            type: 'peer',
            peerId: peer.id,
            peerCount: peer.peers.size
        });
    },
    message(peer, message) {
        const bytes = message.uint8Array();
        if (isBinaryFrame(bytes)) {
            // Clock pings are answered directly and never fanned out.
            const receivedAt = Date.now();
            const t0 = decodePing(bytes);
            if (t0 !== null) peer.send(encodePong(t0, receivedAt, Date.now()));
            return;
        }

        // Ignore malformed payloads; only valid JSON objects enter the shared-state path.
        let payload: Partial<BusMessage>;
        try {
            const parsed = message.json() as unknown;
            if (typeof parsed !== 'object' || parsed === null) return;
            payload = parsed as Partial<BusMessage>;
        } catch {
            return;
        }

        if (payload.type === 'screen/report') {
            const report = parseScreenReport(payload);
            if (report) screenReports.set(peer.id, { report, receivedAt: Date.now() });
            scheduleHealthPush();
            return;
        }
        if (payload.type === 'control/join') {
            controlPeers.set(peer.id, peer);
            sendHealth([peer]);
            return;
        }

        const { state, broadcast } = reduceBusMessage(busSharedState, payload, Date.now());
        busSharedState = state;

        if (broadcast) {
            // Server-owned state: everyone, sender included, gets the authoritative version.
            // No `peerId`, so the sender's engine does not drop it as its own echo.
            const outgoing = { ...broadcast, peerCount: peer.peers.size };
            peer.send(outgoing);
            peer.publish('do', outgoing);
            // A new revision leaves every screen "behind" until it reports again.
            if (broadcast.type === 'scene/state') scheduleHealthPush();
            return;
        }

        // Broadcast to all peers. Each client engine can ignore own echoes via peerId.
        peer.publish('do', {
            ...payload,
            peerId: peer.id,
            peerCount: peer.peers.size
        });
    },
    close(peer) {
        controlPeers.delete(peer.id);
        if (screenReports.delete(peer.id)) scheduleHealthPush();
        peer.publish('do', {
            type: 'bye',
            peerId: peer.id,
            peerCount: peer.peers.size
        });
        peer.unsubscribe('do');
    }
});

export const Route = createFileRoute('/bus')({
    server: {
        handlers: {
            GET: async () => {
                // HTTP fallback response: this endpoint is a websocket upgrade target.
                return Object.assign(
                    new Response('WebSocket upgrade is required.', {
                        status: 426
                    }),
                    {
                        crossws: hooks
                    }
                );
            }
        }
    }
});
