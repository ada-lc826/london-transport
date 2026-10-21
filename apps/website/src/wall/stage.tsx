import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
    rectsIntersect,
    regionRect,
    wallSize,
    type GridRegion,
    type WallLayout,
    type WallRect
} from './layout';

// A stage shows one rectangle of the wall (`view`): a single screen on `/screen`, the whole
// wall on `/world`. Scenes lay out DOM in wall pixels and never need to know which it is.
//
// DOM content sits in one wall-sized box, shifted so `view` is at the origin and CSS-scaled to
// fit the window (scale 1 on a real screen). Maps cannot be scaled that way (a 30720 px canvas
// is beyond GPU limits), so they render in a separate unscaled layer at device resolution and
// compensate through their camera; see `cameraForRect`.

export type WallStageContextValue = {
    layout: WallLayout;
    view: WallRect;
    // Device pixels per wall pixel.
    scale: number;
    debug: boolean;
    mapLayer: HTMLElement | null;
};

const WallStageContext = createContext<WallStageContextValue | null>(null);

export function useWallStage() {
    const context = use(WallStageContext);
    if (!context) throw new Error('useWallStage must be used inside <WallStage>');
    return context;
}

type WallStageProps = {
    layout: WallLayout;
    view: WallRect;
    debug?: boolean;
    children: ReactNode;
};

export function WallStage({ layout, view, debug = false, children }: WallStageProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const [mapLayer, setMapLayer] = useState<HTMLDivElement | null>(null);
    const wall = wallSize(layout);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const update = () => {
            // Fit the view inside the host, preserving aspect ratio.
            const next = Math.min(host.clientWidth / view.width, host.clientHeight / view.height);
            setScale(next > 0 ? next : 1);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(host);
        return () => observer.disconnect();
    }, [view.width, view.height]);

    const value: WallStageContextValue = { layout, view, scale, debug, mapLayer };

    return (
        <div ref={hostRef} className="relative h-full w-full overflow-hidden bg-[#0a0e14]">
            <div
                className="absolute top-0 left-0 overflow-hidden"
                style={{ width: view.width * scale, height: view.height * scale }}
            >
                <div ref={setMapLayer} className="absolute inset-0" />
                <div
                    // Wall-pixel origin and scale, for the end-to-end checks.
                    data-wall=""
                    data-scale={scale}
                    data-view-x={view.x}
                    data-view-y={view.y}
                    className="absolute top-0 left-0 origin-top-left"
                    style={{
                        width: wall.width,
                        height: wall.height,
                        transform: `scale(${scale}) translate(${-view.x}px, ${-view.y}px)`
                    }}
                >
                    <WallStageContext value={value}>{children}</WallStageContext>
                </div>
            </div>
        </div>
    );
}

type WallRegionProps = GridRegion & {
    className?: string;
    children?: ReactNode;
};

/**
 * A block of whole screens. It is not rendered at all on screens it does not touch, so each of
 * the 64 screens only builds the parts of a scene it can show (BEST_PRACTICES §5).
 */
export function WallRegion({ className, children, ...region }: WallRegionProps) {
    const { layout, view } = useWallStage();
    const rect = regionRect(layout, region);
    if (!rectsIntersect(rect, view)) return null;
    return (
        <div
            className={`absolute ${className ?? ''}`}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        >
            {children}
        </div>
    );
}

/**
 * Render children into the unscaled map layer, sized and placed to cover `rect` (wall pixels),
 * clipped to the stage's view. Children get the device-pixel box they occupy.
 */
export function MapLayerPortal({
    rect,
    children
}: {
    rect: WallRect;
    children: (box: { rect: WallRect; scale: number }) => ReactNode;
}) {
    const { view, scale, mapLayer } = useWallStage();
    if (!mapLayer || !rectsIntersect(rect, view)) return null;
    // Only draw the visible part: a screen never allocates a canvas for the rest of the wall.
    const x0 = Math.max(rect.x, view.x);
    const y0 = Math.max(rect.y, view.y);
    const x1 = Math.min(rect.x + rect.width, view.x + view.width);
    const y1 = Math.min(rect.y + rect.height, view.y + view.height);
    const visible = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    return createPortal(
        <div
            className="absolute"
            style={{
                left: (visible.x - view.x) * scale,
                top: (visible.y - view.y) * scale,
                width: visible.width * scale,
                height: visible.height * scale
            }}
        >
            {children({ rect: visible, scale })}
        </div>,
        mapLayer
    );
}
