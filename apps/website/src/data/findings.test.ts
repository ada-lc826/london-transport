import { expect, test } from 'vite-plus/test';

import equityJson from '../../public/data/equity.json';
import liftsJson from '../../public/data/lifts.json';
import networkJson from '../../public/data/network.json';
import pulseJson from '../../public/data/pulse.json';
import upgradesJson from '../../public/data/upgrades.json';
import { parseEquity } from './equity';
import { closingFindings } from './findings';
import { parseLiftRecord } from './lifts';
import { parseNetwork } from './network';
import { parsePulse } from './pulse';
import { parseUpgradePlans } from './upgrades';

const inputs = {
    network: parseNetwork(networkJson),
    pulse: parsePulse(pulseJson),
    equity: parseEquity(equityJson),
    lifts: parseLiftRecord(liftsJson),
    plans: parseUpgradePlans(upgradesJson)
};

test('one finding per scene asset, figures drawn from the assets', () => {
    const findings = closingFindings(inputs);
    expect(findings.map((f) => f.scene)).toEqual(['S2', 'S1', 'S4', 'S4', 'S5', 'S7']);
    const stations = inputs.network!.stations;
    const full = stations.filter((s) => s.stepFree === 'full').length;
    expect(findings[0].figure).toBe(`${full} of ${stations.length}`);
    expect(findings.at(-1)!.figure).toMatch(/^\+\d+%$/);
});

test('a missing asset drops its finding rather than showing a stale one', () => {
    const findings = closingFindings({ ...inputs, lifts: null, plans: null });
    expect(findings.map((f) => f.scene)).toEqual(['S2', 'S1', 'S4', 'S4']);
    expect(
        closingFindings({ network: null, pulse: null, equity: null, lifts: null, plans: null })
    ).toEqual([]);
});
