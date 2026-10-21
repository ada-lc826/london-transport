import type { Page } from '@playwright/test';

import type { SceneId } from '../src/scenes/scene-state';

// A bare bus client for the tests: sends tablet intents and reports the scene revision the
// bus has reached, so a test can wait until a page shows exactly that state.
export class Bus {
    private revision = -1;

    private constructor(private readonly socket: WebSocket) {
        socket.addEventListener('message', (event) => {
            if (typeof event.data !== 'string') return;
            const message = JSON.parse(event.data) as {
                type?: string;
                state?: { scene?: { revision: number } };
                scene?: { revision: number };
            };
            const scene = message.type === 'hello' ? message.state?.scene : message.scene;
            if (scene && (message.type === 'hello' || message.type === 'scene/state')) {
                this.revision = Math.max(this.revision, scene.revision);
            }
        });
    }

    static async connect(baseURL: string): Promise<Bus> {
        const socket = new WebSocket(`${baseURL.replace(/^http/, 'ws')}/bus`);
        await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener('error', reject, { once: true });
        });
        const bus = new Bus(socket);
        await bus.settled();
        return bus;
    }

    send(message: Record<string, unknown>) {
        this.socket.send(JSON.stringify(message));
    }

    /** Show a scene at a step with the given params; resolves with the bus's new revision. */
    async show(sceneId: SceneId, step = 0, params: Record<string, string> = {}) {
        this.send({ type: 'scene/goto', sceneId, step });
        for (const [key, value] of Object.entries(params)) {
            this.send({ type: 'scene/param', key, value });
        }
        return this.settled();
    }

    /** Waits until the bus has stopped answering, then returns the revision it reached. */
    private async settled() {
        let last = -2;
        while (last !== this.revision) {
            last = this.revision;
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return this.revision;
    }

    close() {
        this.socket.close();
    }
}

/** Waits until `page` draws the scene at `revision`. */
export async function shows(page: Page, revision: number) {
    await page.locator(`[data-revision="${revision}"]`).waitFor({ state: 'attached' });
}
