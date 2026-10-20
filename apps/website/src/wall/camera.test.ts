import { WebMercatorViewport } from '@deck.gl/core';
import { describe, expect, test } from 'vite-plus/test';

import {
    cameraForRect,
    fitCamera,
    projectToWall,
    unprojectWallPoint,
    type MapCamera
} from './camera';
import { DO_LAYOUT, regionRect, tileRect, wallRect, zones, type WallRect } from './layout';

// Central London, zoomed so the city fills the wall.
const CAMERA: MapCamera = { longitude: -0.1276, latitude: 51.5072, zoom: 14, bearing: 0, pitch: 0 };
const { screenWidth: W, screenHeight: H } = DO_LAYOUT;

// What one screen actually draws: its camera rendered into a 1920x1080 viewport.
function screenViewport(camera: MapCamera, frame: WallRect, c: number, r: number) {
    const local = cameraForRect(camera, frame, tileRect(DO_LAYOUT, { c, r }));
    return new WebMercatorViewport({ ...local, width: W, height: H });
}

function expectSamePoint(a: number[], b: number[]) {
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo(b[1], 9);
}

describe('seam continuation', () => {
    for (const bearing of [0, 30]) {
        test(`neighbouring screens meet exactly at every bezel (bearing ${bearing})`, () => {
            const camera = { ...CAMERA, bearing };
            const frame = wallRect(DO_LAYOUT);
            for (let r = 0; r < DO_LAYOUT.rows; r++) {
                for (let c = 0; c < DO_LAYOUT.columns; c++) {
                    const here = screenViewport(camera, frame, c, r);
                    for (const y of [0, H / 2, H]) {
                        if (c + 1 < DO_LAYOUT.columns) {
                            const right = screenViewport(camera, frame, c + 1, r);
                            expectSamePoint(here.unproject([W, y]), right.unproject([0, y]));
                        }
                    }
                    for (const x of [0, W / 2, W]) {
                        if (r + 1 < DO_LAYOUT.rows) {
                            const below = screenViewport(camera, frame, c, r + 1);
                            expectSamePoint(here.unproject([x, H]), below.unproject([x, 0]));
                        }
                    }
                }
            }
        });
    }
});

test('the full-wall preview and a single screen agree', () => {
    // The preview draws the whole wall at 1/16 scale in one canvas.
    const frame = wallRect(DO_LAYOUT);
    const scale = 1 / 16;
    const world = cameraForRect(CAMERA, frame, frame, scale);
    const worldViewport = new WebMercatorViewport({
        ...world,
        width: frame.width * scale,
        height: frame.height * scale
    });
    const screen = screenViewport(CAMERA, frame, 11, 2);
    // The centre of screen (11, 2), located in the preview canvas.
    const previewPoint: [number, number] = [(11 * W + W / 2) * scale, (2 * H + H / 2) * scale];
    expectSamePoint(worldViewport.unproject(previewPoint), screen.unproject([W / 2, H / 2]));
});

test('a map framed on the centre zone is centred on that zone', () => {
    const frame = regionRect(DO_LAYOUT, zones(DO_LAYOUT).centre);
    const centre = unprojectWallPoint(CAMERA, frame, [
        frame.x + frame.width / 2,
        frame.y + frame.height / 2
    ]);
    expectSamePoint(centre, [CAMERA.longitude, CAMERA.latitude]);
    // Screens outside the frame see the continuation of the same map.
    const outside = screenViewport(CAMERA, frame, 4, 1);
    const inside = screenViewport(CAMERA, frame, 5, 1);
    expectSamePoint(outside.unproject([W, H / 2]), inside.unproject([0, H / 2]));
});

test('projectToWall inverts unprojectWallPoint', () => {
    const frame = wallRect(DO_LAYOUT);
    const point: [number, number] = [12345, 2345];
    const lngLat = unprojectWallPoint(CAMERA, frame, point);
    const back = projectToWall(CAMERA, frame, lngLat);
    expect(back[0]).toBeCloseTo(point[0], 6);
    expect(back[1]).toBeCloseTo(point[1], 6);
});

test('pitch is forced to 0', () => {
    const frame = wallRect(DO_LAYOUT);
    expect(cameraForRect({ ...CAMERA, pitch: 45 }, frame, frame).pitch).toBe(0);
});

test('fitCamera puts the bounds inside the frame', () => {
    const frame = regionRect(DO_LAYOUT, zones(DO_LAYOUT).centre);
    const bounds: [number, number, number, number] = [-0.61, 51.4, 0.25, 51.71];
    const camera = fitCamera(bounds, frame, 200);
    const [x0, y0] = projectToWall(camera, frame, [bounds[0], bounds[3]]);
    const [x1, y1] = projectToWall(camera, frame, [bounds[2], bounds[1]]);
    for (const x of [x0, x1]) {
        expect(x).toBeGreaterThanOrEqual(frame.x + 199);
        expect(x).toBeLessThanOrEqual(frame.x + frame.width - 199);
    }
    for (const y of [y0, y1]) {
        expect(y).toBeGreaterThanOrEqual(frame.y + 199);
        expect(y).toBeLessThanOrEqual(frame.y + frame.height - 199);
    }
    // The tighter axis touches the padding.
    expect(Math.min(x0 - frame.x, y0 - frame.y)).toBeCloseTo(200, 0);
});
