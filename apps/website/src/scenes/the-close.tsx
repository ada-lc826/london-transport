import { Fragment } from 'react';

import { ATTRIBUTIONS, REPO_URL } from '../data/attribution';
import { loadEquity } from '../data/equity';
import { closingFindings, type Finding } from '../data/findings';
import { loadLiftRecord } from '../data/lifts';
import { loadNetwork } from '../data/network';
import { loadPulse } from '../data/pulse';
import { loadUpgradePlans } from '../data/upgrades';
import { withBase } from '../lib/base-path';
import { regionRect, rectsIntersect, zones } from '../wall/layout';
import { useWallStage } from '../wall/stage';
import { ScreenText } from '../wall/typography';
import type { SceneProps } from './registry';
import { useAsset } from './use-asset';

// S8 · Close (plan §4.2). What the talk found, then how and from what.
//
//   step 0  the findings: one figure per scene, each computed from that scene's own asset
//           (data/findings.ts), so the close always matches what the wall showed
//   step 1  the credits: methods, every data source with the credit its licence asks for
//           (data/attribution.ts), and a QR code to the repository
//
// The QR code sits inside one screen, never across a bezel, or phones could not read it.

const ACCENT = '#e69f00';
const FADE = 'opacity 1.2s ease-in-out';

// Where the findings go: figure on one screen, caption on the next, three to a row across
// the eye-height band, one finding per zone.
const SLOTS = [
    { col: 1, row: 1 },
    { col: 6, row: 1 },
    { col: 11, row: 1 },
    { col: 1, row: 2 },
    { col: 6, row: 2 },
    { col: 11, row: 2 }
];

export function TheCloseScene({ scene }: SceneProps) {
    const network = useAsset(loadNetwork);
    const pulse = useAsset(loadPulse);
    const equity = useAsset(loadEquity);
    const lifts = useAsset(loadLiftRecord);
    const plans = useAsset(loadUpgradePlans);
    const findings = closingFindings({ network, pulse, equity, lifts, plans });
    const credits = scene.step >= 1;
    return (
        <>
            <Title />
            <Findings findings={findings} visible={!credits} />
            <Credits visible={credits} />
        </>
    );
}

function Title() {
    const { layout } = useWallStage();
    const centre = zones(layout).centre;
    const mid = centre.col + Math.floor(centre.colSpan / 2);
    return (
        <>
            <ScreenText col={mid - 1} row={0} level="h1" align="right" className="font-bold">
                MIND THE
            </ScreenText>
            <ScreenText col={mid} row={0} level="h1" align="left" className="font-bold">
                <span style={{ color: ACCENT }}>STEP</span>
            </ScreenText>
        </>
    );
}

function Findings({ findings, visible }: { findings: Finding[]; visible: boolean }) {
    const { layout } = useWallStage();
    if (layout.columns < 16) return null;
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    return (
        <>
            {findings.slice(0, SLOTS.length).map((f, i) => {
                const slot = SLOTS[i];
                return (
                    <Fragment key={`${f.scene}-${i}`}>
                        <ScreenText col={slot.col} row={slot.row} level="h1" align="right">
                            <span className="tabular-nums" style={{ ...fade, color: ACCENT }}>
                                {f.figure}
                            </span>
                        </ScreenText>
                        <ScreenText col={slot.col + 1} row={slot.row} level="h2" align="left">
                            <span style={fade}>
                                {f.caption}
                                <span className="block text-white/50">{f.scene}</span>
                            </span>
                        </ScreenText>
                    </Fragment>
                );
            })}
        </>
    );
}

/** A credit as at most two screens' worth: its first sentence, then the rest. */
export function creditParts(credit: string): string[] {
    const split = credit.indexOf('. ');
    return split === -1 ? [credit] : [credit.slice(0, split + 1), credit.slice(split + 2)];
}

function Credits({ visible }: { visible: boolean }) {
    const { layout, view } = useWallStage();
    const { left, centre, right } = zones(layout);
    const fade = { opacity: visible ? 1 : 0, transition: FADE };
    const qrCol = centre.col + Math.floor(centre.colSpan / 2) - 1;
    const qr = regionRect(layout, { col: qrCol, row: 1, colSpan: 1, rowSpan: 1 });
    // Square, inside the screen with a margin: phones need the quiet zone clear of the bezel.
    const side = Math.round(layout.screenHeight * 0.86);
    return (
        <>
            {rectsIntersect(qr, view) ? (
                <img
                    src={withBase('/qr-repo.svg')}
                    alt={`QR code: ${REPO_URL}`}
                    className="absolute"
                    style={{
                        left: qr.x + (qr.width - side) / 2,
                        top: qr.y + (qr.height - side) / 2,
                        width: side,
                        height: side,
                        ...fade
                    }}
                />
            ) : null}
            <ScreenText col={qrCol + 1} row={1} level="h2" align="left">
                <span style={fade}>
                    Methods, data and code
                    <br />
                    <span className="text-white/70">{REPO_URL.replace(/^https:\/\//, '')}</span>
                </span>
            </ScreenText>
            <ScreenText col={left.col + 1} row={1} level="h2" align="left">
                <span style={fade}>
                    <strong>How</strong>
                    <br />
                    <span className="text-white/70">
                        Step-free access from
                        <br />
                        TfL&apos;s station topology
                    </span>
                </span>
            </ScreenText>
            <ScreenText col={left.col + 2} row={1} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    A tube network model
                    <br />
                    calibrated to TfL&apos;s
                    <br />
                    Journey Planner
                </span>
            </ScreenText>
            <ScreenText col={left.col + 3} row={1} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    Our own lift log,
                    <br />
                    every 15 minutes
                </span>
            </ScreenText>
            <ScreenText col={left.col + 1} row={2} level="h2" align="left">
                <span className="text-white/70" style={fade}>
                    Descriptive, not causal;
                    <br />
                    buses estimated by a
                    <br />
                    model, not routed
                </span>
            </ScreenText>
            {/* One column per publisher: who and what in the eye-height band, the credit its
                licence asks for below, a sentence or two per screen at the wall's smallest size. */}
            {ATTRIBUTIONS.map((a, i) => (
                <Fragment key={a.publisher}>
                    <ScreenText
                        col={right.col + 1 + i}
                        row={1}
                        level="h2"
                        align="left"
                        className="justify-start"
                    >
                        <span style={fade}>
                            <strong>{a.publisher}</strong>
                            <span className="mt-4 block text-white/70">{a.data}</span>
                        </span>
                    </ScreenText>
                    {creditParts(a.credit).map((part, k) => (
                        <ScreenText
                            key={k}
                            col={right.col + 1 + i}
                            row={2 + k}
                            level="h2"
                            align="left"
                            className="justify-start"
                        >
                            <span className="text-white/60" style={fade}>
                                {part}
                            </span>
                        </ScreenText>
                    ))}
                </Fragment>
            ))}
            <ScreenText col={centre.col + 1} row={2} level="h1" align="left">
                <span style={fade}>Thank you</span>
            </ScreenText>
        </>
    );
}
