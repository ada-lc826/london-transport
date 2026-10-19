import { describe, expect, test } from 'vite-plus/test';

import {
    CLOCK_PING,
    CLOCK_PONG,
    ClockEstimator,
    decodePing,
    decodePong,
    encodePing,
    encodePong,
    isBinaryFrame,
    reanchor,
    sampleFromPong,
    timelineAt
} from './clock';

describe('binary frames', () => {
    test('ping round-trips and uses Vizzy opcode 0x08, little-endian', () => {
        const frame = new Uint8Array(encodePing(1_760_000_000_123.5));
        expect(frame[0]).toBe(CLOCK_PING);
        expect(frame.byteLength).toBe(9);
        expect(new DataView(frame.buffer).getFloat64(1, true)).toBe(1_760_000_000_123.5);
        expect(decodePing(frame)).toBe(1_760_000_000_123.5);
    });

    test('pong round-trips and uses opcode 0x09', () => {
        const frame = new Uint8Array(encodePong(1, 2.5, 3.25));
        expect(frame[0]).toBe(CLOCK_PONG);
        expect(decodePong(frame)).toEqual({ t0: 1, t1: 2.5, t2: 3.25 });
    });

    test('decoders reject wrong opcodes and lengths', () => {
        expect(decodePing(new Uint8Array(encodePong(1, 2, 3)))).toBeNull();
        expect(decodePong(new Uint8Array(encodePing(1)))).toBeNull();
        expect(decodePing(new Uint8Array([CLOCK_PING, 1, 2]))).toBeNull();
    });

    test('decoding works on a view into a larger buffer', () => {
        const padded = new Uint8Array(32);
        padded.set(new Uint8Array(encodePing(42)), 7);
        expect(decodePing(padded.subarray(7, 16))).toBe(42);
    });

    test('JSON text is never mistaken for a binary frame', () => {
        expect(isBinaryFrame(new TextEncoder().encode('{"type":"hello"}'))).toBe(false);
        expect(isBinaryFrame(new Uint8Array(encodePing(0)))).toBe(true);
        expect(isBinaryFrame(new Uint8Array())).toBe(false);
    });
});

test('offset and round trip from one exchange', () => {
    // Server is 1000 ms ahead; 20 ms each way; server takes 2 ms to answer.
    const t0 = 5_000;
    const t1 = t0 + 20 + 1_000;
    const t2 = t1 + 2;
    const t3 = t2 - 1_000 + 20;
    expect(sampleFromPong(t0, t1, t2, t3)).toEqual({ offsetMs: 1_000, rttMs: 40 });
});

test('estimator trusts the fastest round trip in its window', () => {
    const clock = new ClockEstimator(3);
    expect(clock.best()).toBeNull();
    clock.add({ offsetMs: 990, rttMs: 10 });
    clock.add({ offsetMs: 1_200, rttMs: 300 });
    clock.add({ offsetMs: 1_010, rttMs: 30 });
    expect(clock.best()).toEqual({ offsetMs: 990, rttMs: 10 });
    // The fast sample falls out of the 3-sample window.
    clock.add({ offsetMs: 1_005, rttMs: 20 });
    expect(clock.best()).toEqual({ offsetMs: 1_005, rttMs: 20 });
    clock.add({ offsetMs: Number.NaN, rttMs: 1 });
    clock.add({ offsetMs: 0, rttMs: -5 });
    expect(clock.best()).toEqual({ offsetMs: 1_005, rttMs: 20 });
});

describe('timeline', () => {
    const anchor = { anchorTimelineMs: 1_000, anchorServerMs: 50_000, rate: 1, playing: true };

    test('extrapolates while playing and holds while paused', () => {
        expect(timelineAt(anchor, 52_500)).toBe(3_500);
        expect(timelineAt({ ...anchor, rate: 2 }, 52_500)).toBe(6_000);
        expect(timelineAt({ ...anchor, playing: false }, 52_500)).toBe(1_000);
    });

    test('pausing and resuming keeps the position continuous', () => {
        const paused = reanchor(anchor, 52_000, { playing: false });
        expect(paused).toEqual({
            anchorTimelineMs: 3_000,
            anchorServerMs: 52_000,
            rate: 1,
            playing: false
        });
        expect(timelineAt(paused, 60_000)).toBe(3_000);
        const resumed = reanchor(paused, 60_000, { playing: true });
        expect(timelineAt(resumed, 61_000)).toBe(4_000);
    });
});
