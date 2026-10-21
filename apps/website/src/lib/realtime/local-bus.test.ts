import { expect, test } from 'vite-plus/test';

import { encodePing, isBinaryFrame } from './clock';
import { LocalBusSocket } from './local-bus';

type Received = { messages: Array<Record<string, unknown>>; frames: ArrayBuffer[] };

function connect(): Promise<[LocalBusSocket, Received]> {
    const socket = new LocalBusSocket();
    const received: Received = { messages: [], frames: [] };
    socket.onmessage = ({ data }) => {
        if (typeof data === 'string') received.messages.push(JSON.parse(data));
        else received.frames.push(data as ArrayBuffer);
    };
    return new Promise((resolve) => {
        socket.onopen = () => setTimeout(() => resolve([socket, received]), 0);
    });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a new peer gets hello with the shared state, then scene changes from any peer', async () => {
    const [control] = await connect();
    const [, screen] = await connect();
    expect(screen.messages[0]).toMatchObject({
        type: 'hello',
        state: { scene: { id: 'attract' } }
    });

    control.send(JSON.stringify({ type: 'scene/goto', sceneId: 'the-race' }));
    await settle();
    const update = screen.messages.find((m) => m.type === 'scene/state');
    expect(update).toMatchObject({ scene: { id: 'the-race', step: 0 } });
    // Server-owned state carries no peer id, so the sender applies it too.
    expect(update?.peerId).toBeUndefined();
});

test('messages the bus does not own are relayed with the sender id', async () => {
    const [control] = await connect();
    const [, screen] = await connect();
    control.send(JSON.stringify({ type: 'control/slider', value: 40 }));
    await settle();
    expect(screen.messages.find((m) => m.type === 'control/slider')).toMatchObject({
        value: 40,
        peerId: control.peerId
    });
});

test('clock pings are answered with a pong frame', async () => {
    const [screen, received] = await connect();
    screen.send(encodePing(123));
    await settle();
    expect(received.frames).toHaveLength(1);
    expect(isBinaryFrame(new Uint8Array(received.frames[0]))).toBe(true);
});

test('a closed socket stops receiving', async () => {
    const [control] = await connect();
    const [screen, received] = await connect();
    screen.close();
    const before = received.messages.length;
    control.send(JSON.stringify({ type: 'scene/step', delta: 1 }));
    await settle();
    expect(received.messages.length).toBe(before);
});
