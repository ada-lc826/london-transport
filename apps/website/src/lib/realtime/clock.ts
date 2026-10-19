// Shared clock: every screen estimates the server's clock so all 64 screens agree on "now"
// without the server sending a message per frame.
//
// Binary frames follow Vizzy Studio's conventions (little-endian, one opcode byte first):
//   CLOCK_PING 0x08  [u8 op][f64 t0]                 client -> server, t0 = client send time
//   CLOCK_PONG 0x09  [u8 op][f64 t0][f64 t1][f64 t2]  server -> client, t1 = received, t2 = sent
// JSON messages always start with `{`, so the first byte tells the two apart.

export const CLOCK_PING = 0x08;
export const CLOCK_PONG = 0x09;
const PING_BYTES = 1 + 8;
const PONG_BYTES = 1 + 8 * 3;

export function encodePing(t0: number): ArrayBuffer {
    const buffer = new ArrayBuffer(PING_BYTES);
    const view = new DataView(buffer);
    view.setUint8(0, CLOCK_PING);
    view.setFloat64(1, t0, true);
    return buffer;
}

export function decodePing(bytes: Uint8Array): number | null {
    if (bytes.byteLength !== PING_BYTES || bytes[0] !== CLOCK_PING) return null;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1, true);
}

export function encodePong(t0: number, t1: number, t2: number): ArrayBuffer {
    const buffer = new ArrayBuffer(PONG_BYTES);
    const view = new DataView(buffer);
    view.setUint8(0, CLOCK_PONG);
    view.setFloat64(1, t0, true);
    view.setFloat64(9, t1, true);
    view.setFloat64(17, t2, true);
    return buffer;
}

export function decodePong(bytes: Uint8Array): { t0: number; t1: number; t2: number } | null {
    if (bytes.byteLength !== PONG_BYTES || bytes[0] !== CLOCK_PONG) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        t0: view.getFloat64(1, true),
        t1: view.getFloat64(9, true),
        t2: view.getFloat64(17, true)
    };
}

export function isBinaryFrame(bytes: Uint8Array) {
    return bytes.byteLength > 0 && bytes[0] < 0x20;
}

export type ClockSample = { offsetMs: number; rttMs: number };

/** NTP-style offset (server minus client) and round-trip time from one ping/pong. */
export function sampleFromPong(t0: number, t1: number, t2: number, t3: number): ClockSample {
    return {
        offsetMs: (t1 - t0 + (t2 - t3)) / 2,
        rttMs: t3 - t0 - (t2 - t1)
    };
}

/**
 * Keeps the last few samples and trusts the one with the smallest round trip: a fast round trip
 * leaves the least room for asymmetric network delay, which is what skews the offset.
 */
export class ClockEstimator {
    private samples: ClockSample[] = [];
    private readonly windowSize: number;

    constructor(windowSize = 8) {
        this.windowSize = windowSize;
    }

    add(sample: ClockSample) {
        if (!Number.isFinite(sample.offsetMs) || !(sample.rttMs >= 0)) return;
        this.samples.push(sample);
        if (this.samples.length > this.windowSize) this.samples.shift();
    }

    reset() {
        this.samples = [];
    }

    best(): ClockSample | null {
        let best: ClockSample | null = null;
        for (const sample of this.samples) {
            if (!best || sample.rttMs < best.rttMs) best = sample;
        }
        return best;
    }
}

// Timeline anchored to server time, the same idea as Vizzy's VIDEO_SYNC: the server says
// "timeline position T was at server time S, moving at `rate`", and each screen extrapolates
// from its own estimate of server time. Changes are rare, so this travels as JSON.
export type TimelineAnchor = {
    anchorTimelineMs: number;
    anchorServerMs: number;
    rate: number;
    playing: boolean;
};

export function timelineAt(anchor: TimelineAnchor, serverNowMs: number) {
    if (!anchor.playing) return anchor.anchorTimelineMs;
    return anchor.anchorTimelineMs + (serverNowMs - anchor.anchorServerMs) * anchor.rate;
}

/** Re-anchor at `serverNowMs` so the timeline continues from where it is now. */
export function reanchor(
    anchor: TimelineAnchor,
    serverNowMs: number,
    changes: Partial<Pick<TimelineAnchor, 'rate' | 'playing' | 'anchorTimelineMs'>>
): TimelineAnchor {
    return {
        anchorTimelineMs: changes.anchorTimelineMs ?? timelineAt(anchor, serverNowMs),
        anchorServerMs: serverNowMs,
        rate: changes.rate ?? anchor.rate,
        playing: changes.playing ?? anchor.playing
    };
}
