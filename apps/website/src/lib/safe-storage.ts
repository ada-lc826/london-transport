// localStorage that never throws. Vizzy Studio can embed a page through a same-origin proxy in
// an iframe sandboxed with `allow-scripts allow-forms` but not `allow-same-origin`; there,
// merely touching `localStorage` throws a SecurityError and would crash the screen. Values then
// live in memory for the life of the page.

const memory = new Map<string, string>();

function storage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

export const safeStorage = {
    getItem(key: string): string | null {
        try {
            const store = storage();
            if (store) return store.getItem(key);
        } catch {
            // fall through to memory
        }
        return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
        try {
            const store = storage();
            if (store) return store.setItem(key, value);
        } catch {
            // fall through to memory
        }
        memory.set(key, value);
    },
    removeItem(key: string) {
        try {
            storage()?.removeItem(key);
        } catch {
            // ignore
        }
        memory.delete(key);
    }
};
