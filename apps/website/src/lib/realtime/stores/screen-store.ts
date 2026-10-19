import { Store, useStore } from '@tanstack/react-store';

import { createInitialScreenStoreState, type ScreenStoreState } from '../types';

// Singleton store for all screen-route realtime state.
export const screenStore = new Store(createInitialScreenStoreState());

export function useScreenStore(): ScreenStoreState;
export function useScreenStore<T>(
    selector: (state: ScreenStoreState) => T,
    compare?: (a: T, b: T) => boolean
): T;
export function useScreenStore<T>(
    selector?: (state: ScreenStoreState) => T,
    compare?: (a: T, b: T) => boolean
) {
    // Default selector returns full state; callers can pass a narrow selector for perf.
    const safeSelector = (selector ?? ((state: ScreenStoreState) => state as unknown as T)) as (
        state: ScreenStoreState
    ) => T;
    return useStore(screenStore, safeSelector, compare);
}
