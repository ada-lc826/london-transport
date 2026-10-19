// Wall geometry: the one place that knows how many screens there are and how big they are.
// Shaped like Vizzy Studio's `StageLayout` so code written here ports to Vizzy unchanged.

export type WallLayout = {
    columns: number;
    rows: number;
    screenWidth: number;
    screenHeight: number;
};

// The Data Observatory: 4 rows x 16 columns of 1920x1080 panels (30720 x 4320 px).
export const DO_LAYOUT: WallLayout = {
    columns: 16,
    rows: 4,
    screenWidth: 1920,
    screenHeight: 1080
};

// The starter's 3x2 simulator wall, kept for quick local iteration.
export const MINI_LAYOUT: WallLayout = {
    columns: 3,
    rows: 2,
    screenWidth: 1920,
    screenHeight: 1080
};

export type LayoutName = 'do' | 'mini';

export function resolveLayout(name: unknown): WallLayout {
    return name === 'mini' ? MINI_LAYOUT : DO_LAYOUT;
}

export function wallSize(layout: WallLayout) {
    return {
        width: layout.columns * layout.screenWidth,
        height: layout.rows * layout.screenHeight
    };
}

// A rectangle in wall pixels (origin top-left of column 0, row 0).
export type WallRect = { x: number; y: number; width: number; height: number };

export type Tile = { c: number; r: number };

export function tileRect(layout: WallLayout, tile: Tile): WallRect {
    return {
        x: tile.c * layout.screenWidth,
        y: tile.r * layout.screenHeight,
        width: layout.screenWidth,
        height: layout.screenHeight
    };
}

export function wallRect(layout: WallLayout): WallRect {
    return { x: 0, y: 0, ...wallSize(layout) };
}

// A region of the wall in whole-screen units, e.g. the central six columns.
export type GridRegion = { col: number; row: number; colSpan: number; rowSpan: number };

export function regionRect(layout: WallLayout, region: GridRegion): WallRect {
    return {
        x: region.col * layout.screenWidth,
        y: region.row * layout.screenHeight,
        width: region.colSpan * layout.screenWidth,
        height: region.rowSpan * layout.screenHeight
    };
}

export function rectsIntersect(a: WallRect, b: WallRect) {
    return (
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    );
}

/**
 * Parse `?c=&r=` for a screen. Unlike the starter, out-of-range values are rejected rather
 * than clamped: clamping made columns 3-15 of the real 16x4 wall all render column 2.
 */
export function parseTile(layout: WallLayout, c: unknown, r: unknown): Tile | null {
    const col = toInteger(c);
    const row = toInteger(r);
    if (col === null || row === null) return null;
    if (col < 0 || col >= layout.columns || row < 0 || row >= layout.rows) return null;
    return { c: col, r: row };
}

function toInteger(value: unknown) {
    const parsed =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && value !== ''
              ? Number(value)
              : NaN;
    return Number.isInteger(parsed) ? parsed : null;
}

// Composition zones (plan §2.1, §4.3). A viewer at the centre of the room comfortably takes in
// about a third of the 313° wall, so the 16 columns split 5 | 6 | 5: context, key message,
// implications. The split scales proportionally on other layouts.
export type ZoneName = 'left' | 'centre' | 'right';

export function zones(layout: WallLayout): Record<ZoneName, GridRegion> {
    const side = Math.round((layout.columns * 5) / 16);
    const centre = layout.columns - 2 * side;
    const full = { row: 0, rowSpan: layout.rows };
    return {
        left: { col: 0, colSpan: side, ...full },
        centre: { col: side, colSpan: centre, ...full },
        right: { col: side + centre, colSpan: side, ...full }
    };
}

// Eye-height band (plan §2.1): on the 2.53 m floor-standing wall, rows 1-2 span roughly
// 0.63-1.90 m and cover both standing (~1.6 m) and seated or wheelchair (~1.1-1.3 m) eye lines.
// Key content goes here; the bottom row is often hidden behind people in a group.
export function eyeBand(layout: WallLayout): { firstRow: number; lastRow: number } {
    if (layout.rows < 4) return { firstRow: 0, lastRow: layout.rows - 1 };
    return { firstRow: 1, lastRow: 2 };
}
