import { WebMercatorViewport } from '@deck.gl/core';

import type { WallRect } from './layout';

export type MapCamera = {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
};

// A map on the wall is described by a `frame` (the wall-pixel rectangle it fills, e.g. the
// central six columns or the whole wall) and a camera for that frame as if it were one huge
// screen: `longitude`/`latitude` sit at the frame's centre, `zoom` is at one wall pixel per
// device pixel. Pitch must stay 0: a pitched camera has no projection that tiles across screens.

function frameViewport(camera: MapCamera, frame: WallRect) {
    return new WebMercatorViewport({
        ...camera,
        pitch: 0,
        width: frame.width,
        height: frame.height
    });
}

/**
 * The camera for drawing `rect` (part of `frame`, in wall pixels) at `scale` device pixels per
 * wall pixel: 1 on a real screen, much less in the full-wall preview.
 *
 * Every view uses this one function, so a screen and the preview agree pixel for pixel and the
 * map continues seamlessly across screen edges.
 */
export function cameraForRect(
    camera: MapCamera,
    frame: WallRect,
    rect: WallRect,
    scale = 1
): MapCamera {
    const [longitude, latitude] = frameViewport(camera, frame).unproject([
        rect.x - frame.x + rect.width / 2,
        rect.y - frame.y + rect.height / 2
    ]);
    return {
        ...camera,
        longitude,
        latitude,
        pitch: 0,
        // Drawing at `scale` pixels per wall pixel is the same map log2(scale) zoom levels out.
        zoom: camera.zoom + Math.log2(scale)
    };
}

/** Wall pixel -> [lon, lat]. */
export function unprojectWallPoint(
    camera: MapCamera,
    frame: WallRect,
    point: [number, number]
): [number, number] {
    const [lon, lat] = frameViewport(camera, frame).unproject([
        point[0] - frame.x,
        point[1] - frame.y
    ]);
    return [lon, lat];
}

/** [lon, lat] -> wall pixel, for placing DOM labels over a map. */
export function projectToWall(
    camera: MapCamera,
    frame: WallRect,
    lngLat: [number, number]
): [number, number] {
    const [x, y] = frameViewport(camera, frame).project(lngLat);
    return [x + frame.x, y + frame.y];
}

/** A camera that fits `bounds` ([west, south, east, north]) inside `frame` with `padding` px. */
export function fitCamera(
    bounds: [number, number, number, number],
    frame: WallRect,
    padding = 0
): MapCamera {
    const [west, south, east, north] = bounds;
    const fitted = new WebMercatorViewport({ width: frame.width, height: frame.height }).fitBounds(
        [
            [west, south],
            [east, north]
        ],
        { padding }
    );
    return {
        longitude: fitted.longitude,
        latitude: fitted.latitude,
        zoom: fitted.zoom,
        bearing: 0,
        pitch: 0
    };
}
