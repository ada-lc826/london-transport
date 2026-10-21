import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { rectsIntersect, regionRect } from './layout';
import { useWallStage } from './stage';

// Type scale in wall pixels, as fractions of screen height (plan §4.6; BEST_PRACTICES §6 asks
// for primary text of at least 20% of screen height for viewing at ~10 m).
export const TYPE = {
    display: 0.4, // 432 px: the title, one word per screen
    h1: 0.2, // 216 px: headline numbers and the key message
    h2: 0.1, // 108 px: labels
    detail: 0.06 // 65 px: close-reading "data wall" detail only; needs a recorded design reason
} as const;

export type TypeLevel = keyof typeof TYPE;

export function typeSize(level: TypeLevel, screenHeight: number) {
    return Math.round(TYPE[level] * screenHeight);
}

type ScreenTextProps = {
    col: number;
    row: number;
    level?: TypeLevel;
    align?: 'left' | 'center' | 'right';
    className?: string;
    children: ReactNode;
};

/**
 * Text confined to a single screen. Text must never run across a bezel, so this is the only
 * way scenes place text. With `?m=dev`, overflowing text is outlined in red.
 */
export function ScreenText({
    col,
    row,
    level = 'h1',
    align = 'center',
    className,
    children
}: ScreenTextProps) {
    const { layout, view, debug } = useWallStage();
    const rect = regionRect(layout, { col, row, colSpan: 1, rowSpan: 1 });
    const visible = rectsIntersect(rect, view);
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [overflows, setOverflows] = useState(false);

    useLayoutEffect(() => {
        if (!debug || !boxRef.current) return;
        const box = boxRef.current;
        setOverflows(
            box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1
        );
    });

    if (!visible) return null;
    // Keep a safe margin from the bezel so nothing touches the panel edge.
    const padding = Math.round(layout.screenHeight * 0.06);
    return (
        <div
            ref={boxRef}
            // Marks wall text for the end-to-end bezel checks (e2e/wall-text.spec.ts).
            data-wall-text=""
            className={`absolute flex flex-col justify-center overflow-hidden leading-[1.05] ${className ?? ''}`}
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                padding,
                fontSize: typeSize(level, layout.screenHeight),
                textAlign: align,
                outline: debug && overflows ? '12px solid #ff3b30' : undefined,
                outlineOffset: -12
            }}
        >
            {children}
        </div>
    );
}
