import { wallSize } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';

// Test card for checking a wall: every screen shows its coordinates, and rings centred on the
// wall plus two diagonals must run unbroken across every bezel. A kink means a screen has the
// wrong `c`/`r` or the wrong layout.

export function CalibrationScene(_props: SceneProps) {
    const { layout } = useWallStage();
    const wall = wallSize(layout);
    const cx = wall.width / 2;
    const cy = wall.height / 2;
    const ringStep = layout.screenHeight;
    const rings = Math.ceil(Math.hypot(cx, cy) / ringStep);
    const labels = [];
    for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.columns; c++) {
            labels.push(
                <ScreenText key={`${c}-${r}`} col={c} row={r} className="font-mono text-white/80">
                    {c},{r}
                </ScreenText>
            );
        }
    }

    return (
        <>
            <svg
                className="absolute top-0 left-0"
                width={wall.width}
                height={wall.height}
                viewBox={`0 0 ${wall.width} ${wall.height}`}
            >
                {Array.from({ length: rings }, (_, i) => (
                    <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r={(i + 1) * ringStep}
                        fill="none"
                        stroke={i % 2 === 0 ? '#56b4e9' : '#e69f00'}
                        strokeWidth={10}
                    />
                ))}
                <line
                    x1={0}
                    y1={0}
                    x2={wall.width}
                    y2={wall.height}
                    stroke="#ffffff"
                    strokeWidth={8}
                />
                <line
                    x1={0}
                    y1={wall.height}
                    x2={wall.width}
                    y2={0}
                    stroke="#ffffff"
                    strokeWidth={8}
                />
            </svg>
            {labels}
        </>
    );
}
