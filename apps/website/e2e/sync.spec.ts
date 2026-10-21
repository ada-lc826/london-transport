import { expect, test } from '@playwright/test';

import { Bus, shows } from './bus';

// The realtime path end to end, through the real server: tablets drive screens, screens that
// join late catch up, and the presenter sees which screens are up.

test('a tablet changes the scene on every screen', async ({ browser }) => {
    const context = await browser.newContext();
    const screens = await Promise.all(
        [
            [0, 0],
            [7, 1],
            [15, 3]
        ].map(async ([c, r]) => {
            const page = await context.newPage();
            await page.setViewportSize({ width: 480, height: 270 });
            await page.goto(`/screen?c=${c}&r=${r}`);
            return page;
        })
    );
    const tablet = await context.newPage();
    await tablet.goto('/control?operator=A');

    await tablet.getByRole('button', { name: 'S2 · The Step' }).click();
    for (const screen of screens) {
        await expect(screen.locator('[data-scene]')).toHaveAttribute('data-scene', 'the-step');
    }
    await tablet.getByRole('button', { name: 'Next step' }).click();
    for (const screen of screens) {
        await expect(screen.locator('[data-scene]')).toHaveAttribute('data-step', '1');
    }
    await context.close();
});

test('a screen that opens late shows the current scene at once', async ({ page, baseURL }) => {
    const bus = await Bus.connect(baseURL!);
    const revision = await bus.show('two-londons', 1, { origin: '940GZZLUBXN' });
    await page.goto('/screen?c=8&r=1');
    await shows(page, revision);
    await expect(page.locator('[data-scene]')).toHaveAttribute('data-step', '1');
    bus.close();
});

test('only the presenter tablet changes scenes; the traveller makes choices', async ({
    browser
}) => {
    const context = await browser.newContext();
    const presenter = await context.newPage();
    const traveller = await context.newPage();
    await presenter.goto('/control?operator=A');
    await traveller.goto('/control?operator=B');
    await presenter.getByRole('button', { name: 'S6 · The Race' }).click();

    await expect(traveller.getByText('On the wall: S6 · The Race')).toBeVisible();
    await expect(traveller.getByRole('button', { name: 'S2 · The Step' })).toHaveCount(0);
    await traveller.getByRole('button', { name: 'Brixton → Kentish Town' }).click();
    // The presenter's notes follow the traveller's choice.
    await expect(presenter.getByText('A standard 30 min · B step-free 56 min')).toBeVisible();
    await context.close();
});

test('the presenter sees which screens are connected', async ({ browser }) => {
    const context = await browser.newContext();
    const tablet = await context.newPage();
    await tablet.goto('/control?operator=A');
    const screens = [];
    for (const [c, r] of [
        [2, 0],
        [3, 0]
    ]) {
        const page = await context.newPage();
        await page.goto(`/screen?c=${c}&r=${r}`);
        screens.push(page);
    }
    // Reports arrive every few seconds; other tests' screens may still be counted, so look
    // for these two by their cells.
    for (const [c, r] of [
        [2, 0],
        [3, 0]
    ]) {
        await expect(tablet.locator(`[title^="c${c} r${r}: ok"]`)).toBeVisible({
            timeout: 15_000
        });
    }
    await expect(tablet.locator('[title^="c9 r2: not connected"]')).toBeVisible();
    await context.close();
});
