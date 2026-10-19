import { Store, useStore } from '@tanstack/react-store';

import { createInitialControlStoreState, type ControlStoreState } from '../types';

// Singleton store for all control-route realtime state.
export const controlStore = new Store(createInitialControlStoreState());

export function useControlStore(): ControlStoreState;
export function useControlStore<T>(
    selector: (state: ControlStoreState) => T,
    compare?: (a: T, b: T) => boolean
): T;
export function useControlStore<T>(
    selector?: (state: ControlStoreState) => T,
    compare?: (a: T, b: T) => boolean
) {
    // Default selector returns full state; callers can pass a narrow selector for perf.
    const safeSelector = (selector ?? ((state: ControlStoreState) => state as unknown as T)) as (
        state: ControlStoreState
    ) => T;
    return useStore(controlStore, safeSelector, compare);
}
