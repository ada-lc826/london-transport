import { defineConfig } from '@playwright/test';

// End-to-end tests against the production server build (`vp build` first; `pnpm e2e` does
// both). One worker: every test drives the same bus, whose scene state is shared.
const PORT = 5791;

// The web app's tsconfig has no Node types; this file only needs the environment.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
    testDir: './e2e',
    timeout: 120_000,
    workers: 1,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: { baseURL: `http://localhost:${PORT}`, browserName: 'chromium' },
    webServer: {
        command: 'node .output/server/index.mjs',
        env: { PORT: String(PORT) },
        url: `http://localhost:${PORT}/control`,
        reuseExistingServer: !process.env.CI
    }
});
