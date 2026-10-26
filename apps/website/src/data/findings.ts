import type { EquityRecord } from './equity';
import type { LiftRecord } from './lifts';
import { summariseStepFree, type Network } from './network';
import { shareWithoutStepFree, type Pulse } from './pulse';
import type { UpgradePlans } from './upgrades';

// S8's closing findings, one per scene, each computed from that scene's own asset so the
// close always agrees with what the wall showed. A finding whose asset did not load is
// left out rather than shown stale.

export type Finding = { scene: string; figure: string; caption: string };

export type FindingInputs = {
    network: Network | null;
    pulse: Pulse | null;
    equity: EquityRecord | null;
    lifts: LiftRecord | null;
    plans: UpgradePlans | null;
};

export function closingFindings({
    network,
    pulse,
    equity,
    lifts,
    plans
}: FindingInputs): Finding[] {
    const findings: Finding[] = [];
    if (network) {
        const s = summariseStepFree(network.stations);
        findings.push({
            scene: 'S2',
            figure: `${s.full} of ${s.total}`,
            caption: 'tube stations are step-free from street to platform'
        });
    }
    const share = pulse ? shareWithoutStepFree(pulse.stepFree) : null;
    if (share !== null) {
        findings.push({
            scene: 'S1',
            figure: `${Math.round(share * 100)}%`,
            caption: 'of tube journeys start at a station with no step-free access'
        });
    }
    if (equity) {
        findings.push({
            scene: 'S4',
            figure: `+${Math.round(equity.headline.everyone)} min`,
            caption: 'on the average tube journey, step-free'
        });
        findings.push({
            scene: 'S4',
            figure: `${equity.headline.disabled.toFixed(1)} = ${equity.headline.notDisabled.toFixed(1)}`,
            caption: 'disabled Londoners or not: it is where you live, not who you are'
        });
    }
    if (lifts) {
        const paper = lifts.stations.filter((s) => s.paper === 'full').length;
        findings.push({
            scene: 'S5',
            figure: `${paper} of ${lifts.paper.full}`,
            caption: 'step-free stations lost it at least once to a lift, in our log'
        });
    }
    if (plans) {
        const tfl = plans.tfl[plans.tfl.length - 1];
        const ours = plans.strategies.people[plans.tfl.length - 1];
        if (tfl && ours && tfl.savedEveryone > 0) {
            const more = Math.round((ours.savedEveryone / tfl.savedEveryone - 1) * 100);
            findings.push({
                scene: 'S7',
                figure: `+${more}%`,
                caption: `minutes saved by ${plans.tfl.length} stations chosen for the journeys people make`
            });
        }
    }
    return findings;
}
