import { expect, test, type Page } from '@playwright/test';

import { SCENE_IDS, SCENE_META, type SceneId } from '../src/scenes/scene-state';
import { Bus, shows } from './bus';

// Text on the wall must never cross a bezel, and must never be cut off (BEST_PRACTICES §6).
// Every scene, at every step, with every choice the tablets offer, is drawn on the full 16x4
// wall (`/world`), and every element marked `data-wall-text` is checked: its box lies within
// one screen, and its content fits the box (nothing clipped or truncated with an ellipsis).

type Failure = { text: string; problem: string; box: number[] };

// Runs in the page. Boxes are converted to wall pixels via the stage's scale.
function findFailures(screen: { width: number; height: number }): Failure[] {
    const wall = document.querySelector<HTMLElement>('[data-wall]');
    if (!wall) return [{ text: '', problem: 'no wall stage', box: [] }];
    const scale = Number(wall.dataset.scale);
    const origin = wall.getBoundingClientRect();
    const failures: Failure[] = [];
    for (const el of document.querySelectorAll<Element>('[data-wall-text]')) {
        const text = (el.textContent ?? '').trim();
        if (!text) continue;
        const r = el.getBoundingClientRect();
        const box = [
            (r.left - origin.left) / scale,
            (r.top - origin.top) / scale,
            (r.right - origin.left) / scale,
            (r.bottom - origin.top) / scale
        ].map((v) => Math.round(v));
        const [x0, y0, x1, y1] = box;
        // 2 px of slack for rounding at the scaled-down size.
        const sameColumn =
            Math.floor((x0 + 2) / screen.width) === Math.floor((x1 - 2) / screen.width);
        const sameRow =
            Math.floor((y0 + 2) / screen.height) === Math.floor((y1 - 2) / screen.height);
        if (!sameColumn || !sameRow) failures.push({ text, problem: 'crosses a bezel', box });
        if (el instanceof HTMLElement) {
            const clipped =
                el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
            const truncated = [...el.querySelectorAll<HTMLElement>('*')].some(
                (child) =>
                    getComputedStyle(child).textOverflow === 'ellipsis' &&
                    child.scrollWidth > child.clientWidth + 1
            );
            if (clipped) failures.push({ text, problem: 'clipped', box });
            if (truncated) failures.push({ text, problem: 'truncated', box });
        }
    }
    return failures;
}

async function check(page: Page, label: string) {
    // Something must be on the wall, or the check would pass on a page still loading.
    await expect(page.locator('[data-wall-text]').first()).toBeAttached();
    const failures = await page.evaluate(findFailures, { width: 1920, height: 1080 });
    expect(failures, `${label}: ${JSON.stringify(failures, null, 1)}`).toEqual([]);
}

// Every combination of a scene's choices; one empty combination for scenes without any.
function paramCombinations(id: SceneId): Array<Record<string, string>> {
    let combos: Array<Record<string, string>> = [{}];
    for (const [key, spec] of Object.entries(SCENE_META[id].params ?? {})) {
        combos = combos.flatMap((combo) =>
            spec.options.map((option) => ({ ...combo, [key]: option.value }))
        );
    }
    return combos;
}

// The map-check scene draws a basemap from the network and has no text of its own.
const SCENES = SCENE_IDS.filter((id) => id !== 'map-check');

for (const id of SCENES) {
    test(`text stays inside one screen: ${SCENE_META[id].title}`, async ({ page, baseURL }) => {
        const bus = await Bus.connect(baseURL!);
        await page.setViewportSize({ width: 3840, height: 540 });
        await page.goto('/world?bezels=0');
        for (const params of paramCombinations(id)) {
            for (let step = 0; step < SCENE_META[id].steps; step++) {
                const revision = await bus.show(id, step, params);
                await shows(page, revision);
                // Let data load and fades settle.
                await page.waitForTimeout(400);
                await check(page, `${id} step ${step} ${JSON.stringify(params)}`);
            }
        }
        bus.close();
    });
}
