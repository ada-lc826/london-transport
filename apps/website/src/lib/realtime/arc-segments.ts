const ARC_SEGMENTS_URL = '/data/arc-segments.json';

let arcSegmentsRequest: Promise<unknown[] | null> | null = null;

export async function loadArcSegmentsDataset() {
    if (typeof window === 'undefined') return null;

    if (!arcSegmentsRequest) {
        arcSegmentsRequest = (async () => {
            try {
                const response = await fetch(ARC_SEGMENTS_URL, {
                    headers: {
                        accept: 'application/json'
                    }
                });
                if (!response.ok) return null;
                const payload = (await response.json()) as unknown;
                return Array.isArray(payload) ? payload : null;
            } catch {
                return null;
            }
        })();
    }

    const payload = await arcSegmentsRequest;
    if (payload === null) {
        // Failed reads should not poison cache forever.
        arcSegmentsRequest = null;
    }
    return payload;
}
