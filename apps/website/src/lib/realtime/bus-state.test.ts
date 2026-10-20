import { expect, test } from 'vite-plus/test';

import { initialBusState, reduceBusMessage } from './bus-state';

const T0 = 1_000_000;

test('starts on the attract scene', () => {
    const state = initialBusState(T0);
    expect(state.scene.id).toBe('attract');
    expect(state.scene.revision).toBe(0);
});

test('scene/goto switches scene, restarts its timeline and broadcasts to everyone', () => {
    const { state, broadcast } = reduceBusMessage(
        initialBusState(T0),
        { type: 'scene/goto', sceneId: 'calibration' },
        T0 + 5_000
    );
    expect(state.scene).toMatchObject({ id: 'calibration', step: 0, revision: 1 });
    expect(state.scene.timeline).toEqual({
        anchorTimelineMs: 0,
        anchorServerMs: T0 + 5_000,
        rate: 1,
        playing: true
    });
    expect(broadcast).toEqual({ type: 'scene/state', scene: state.scene });
});

test('unknown scenes and malformed intents change nothing', () => {
    const initial = initialBusState(T0);
    for (const message of [
        { type: 'scene/goto', sceneId: 'nope' },
        { type: 'scene/goto' },
        { type: 'scene/play', playing: 'yes' },
        { type: 'something/else' }
    ]) {
        const { state, broadcast } = reduceBusMessage(initial, message, T0);
        expect(state).toBe(initial);
        expect(broadcast).toBeNull();
    }
});

test('steps are clamped to the scene', () => {
    const initial = initialBusState(T0);
    // The attract scene has one step, so stepping is a no-op.
    expect(reduceBusMessage(initial, { type: 'scene/step', delta: 1 }, T0).broadcast).toBeNull();
    // S2 has three: 0 -> 1 -> 2, then held at 2; back to 1.
    let s2 = reduceBusMessage(initial, { type: 'scene/goto', sceneId: 'the-step' }, T0).state;
    for (const expected of [1, 2, 2]) {
        s2 = reduceBusMessage(s2, { type: 'scene/step', delta: 1 }, T0).state;
        expect(s2.scene.step).toBe(expected);
    }
    s2 = reduceBusMessage(s2, { type: 'scene/step', delta: -1 }, T0).state;
    expect(s2.scene.step).toBe(1);
    const { state } = reduceBusMessage(
        initial,
        { type: 'scene/goto', sceneId: 'attract', step: 99 },
        T0
    );
    expect(state.scene.step).toBe(0);
});

test('pause re-anchors so the timeline holds where it was', () => {
    const initial = initialBusState(T0);
    const { state } = reduceBusMessage(initial, { type: 'scene/play', playing: false }, T0 + 4_000);
    expect(state.scene.timeline).toMatchObject({ anchorTimelineMs: 4_000, playing: false });
    expect(state.scene.revision).toBe(1);
    // Pausing again is not a change.
    expect(
        reduceBusMessage(state, { type: 'scene/play', playing: false }, T0 + 9_000).broadcast
    ).toBeNull();
});

test('map-view updates are kept for late joiners and relayed as-is', () => {
    const { state, broadcast } = reduceBusMessage(
        initialBusState(T0),
        { type: 'screen/map-view', city: 'paris', view: { zoom: 11 } },
        T0
    );
    expect(state).toMatchObject({ city: 'paris', zoom: 11 });
    expect(broadcast).toBeNull();
});
