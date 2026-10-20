import { useEffect, useState } from 'react';

import { stationBounds, type Network } from '../data/network';
import { fitCamera, type MapCamera } from '../wall/camera';
import type { WallRect } from '../wall/layout';

/** Load a data asset once on mount; null until it arrives (or if it fails). */
export function useAsset<T>(load: () => Promise<T | null>): T | null {
    const [value, setValue] = useState<T | null>(null);
    useEffect(() => {
        let live = true;
        void load().then((loaded) => {
            if (live) setValue(loaded);
        });
        return () => {
            live = false;
        };
    }, [load]);
    return value;
}

/** A camera that fits every station into `frame`, with a margin. */
export function networkCamera(network: Network, frame: WallRect, padding = 260): MapCamera | null {
    const bounds = stationBounds(network.stations);
    if (!bounds) return null;
    return fitCamera([bounds.west, bounds.south, bounds.east, bounds.north], frame, padding);
}
