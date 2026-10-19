import { createFileRoute } from '@tanstack/react-router';
import { defineHooks } from 'crossws';

import type { BusMessage } from '../lib/realtime';
import { initialBusState, reduceBusMessage } from '../lib/realtime/bus-state';
import { decodePing, encodePong, isBinaryFrame } from '../lib/realtime/clock';

// In-memory bus state for this server process.
// New clients receive this snapshot in the `hello` handshake so they can
// join late without waiting for another control interaction.
let busSharedState = initialBusState(Date.now());

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

        const { state, broadcast } = reduceBusMessage(busSharedState, payload, Date.now());
        busSharedState = state;

        if (broadcast) {
            // Server-owned state: everyone, sender included, gets the authoritative version.
            // No `peerId`, so the sender's engine does not drop it as its own echo.
            const outgoing = { ...broadcast, peerCount: peer.peers.size };
            peer.send(outgoing);
            peer.publish('do', outgoing);
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
