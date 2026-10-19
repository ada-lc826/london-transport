import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';
import { useTimelineMs } from './use-timeline';

// S0 · Attract. The title sits around the wall's centre line, one word per screen so no word
// crosses a bezel, in the eye-height band. The step glyph "breathes" on the shared timeline:
// a quick visual check that every screen is on the same clock.

const BREATH_PERIOD_MS = 6_000;

export function AttractScene({ scene }: SceneProps) {
    const { layout } = useWallStage();
    // On the 16-column wall the four title screens c6-c9 straddle the centre bezel.
    const mid = Math.max(2, Math.floor(layout.columns / 2));
    const t = useTimelineMs(scene);
    const breath =
        t === null ? 1 : 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / BREATH_PERIOD_MS));
    const titleRow = Math.min(1, layout.rows - 1);
    const subtitleRow = Math.min(2, layout.rows - 1);

    return (
        <>
            <ScreenText
                col={mid - 2}
                row={titleRow}
                level="display"
                className="font-bold tracking-tight"
            >
                MIND
            </ScreenText>
            <ScreenText
                col={mid - 1}
                row={titleRow}
                level="display"
                className="font-bold tracking-tight"
            >
                THE
            </ScreenText>
            <ScreenText
                col={mid}
                row={titleRow}
                level="display"
                className="font-bold tracking-tight text-[#e69f00]"
            >
                STEP
            </ScreenText>
            <StepGlyph col={mid + 1} row={titleRow} opacity={breath} />
            {subtitleRow !== titleRow ? (
                <>
                    <ScreenText
                        col={mid - 1}
                        row={subtitleRow}
                        level="h2"
                        align="right"
                        className="text-white/80"
                    >
                        One network,
                    </ScreenText>
                    <ScreenText
                        col={mid}
                        row={subtitleRow}
                        level="h2"
                        align="left"
                        className="text-white/80"
                    >
                        two Londons
                    </ScreenText>
                </>
            ) : null}
        </>
    );
}

function StepGlyph({ col, row, opacity }: { col: number; row: number; opacity: number }) {
    const { layout } = useWallStage();
    const w = layout.screenWidth;
    const h = layout.screenHeight;
    // A single kerb step: the barrier the whole story is about.
    return (
        <svg
            className="absolute"
            style={{ left: col * w, top: row * h, width: w, height: h, opacity }}
            viewBox={`0 0 ${w} ${h}`}
        >
            <path
                d={`M ${w * 0.12} ${h * 0.72} H ${w * 0.45} V ${h * 0.4} H ${w * 0.88}`}
                fill="none"
                stroke="#e69f00"
                strokeWidth={h * 0.05}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
