import { legLabel, type Segment } from '../data/races';
import type { WallLayout } from '../wall/layout';
import { TYPE, type TypeLevel } from '../wall/typography';

// Where S6 puts each segment's label: inside the screen where the segment starts (or the
// next one, if it starts too near the edge), never across a bezel, and never over the
// previous label. Kept apart from the scene so it can be tested without a wall.

export type LabelPlacement = {
    index: number;
    title: string;
    detail: string;
    minutes: number;
    col: number;
    // Left edge and width in wall pixels; the width stops at the screen's safe margin.
    x: number;
    width: number;
};

// Shortest segment worth a label; shorter waits and walks would crowd the lane.
const MIN_LABELLED_MINUTES = 3;
// Rough width of a character as a share of the font size, for the overlap check.
const CHAR_WIDTH = 0.55;

export function placeLabels(
    parts: Segment[],
    layout: WallLayout,
    minuteX: (minute: number) => number
): LabelPlacement[] {
    const sw = layout.screenWidth;
    const pad = Math.round(layout.screenHeight * 0.06);
    const textWidth = (text: string, level: TypeLevel) =>
        text.length * CHAR_WIDTH * TYPE[level] * layout.screenHeight;
    const placed: LabelPlacement[] = [];
    let taken = -Infinity;
    parts.forEach((part, index) => {
        const minutes = part.end - part.start;
        if (minutes < MIN_LABELLED_MINUTES) return;
        const start = minuteX(part.start);
        const end = minuteX(part.end);
        let col = Math.floor(start / sw);
        let x = Math.max(start + pad, taken + pad);
        if ((col + 1) * sw - pad - x < sw * 0.4) {
            // Too little room left on this screen: move to the next, if the segment reaches it.
            if (end - (col + 1) * sw < sw * 0.4) return;
            col += 1;
            x = Math.max(col * sw + pad, taken + pad);
        }
        if (col >= layout.columns || x >= (col + 1) * sw - pad - sw * 0.25) return;
        const title = part.kind === 'wait' ? 'Wait' : legLabel(part.leg);
        const detail =
            part.kind === 'leg' && part.leg.mode !== 'walking' ? `to ${part.leg.to}` : '';
        const width = (col + 1) * sw - pad - x;
        const needed = Math.max(
            textWidth(`${title} ${minutes}′`, 'h2'),
            textWidth(detail, 'detail')
        );
        placed.push({ index, title, detail, minutes, col, x, width });
        taken = x + Math.min(width, needed);
    });
    return placed;
}
