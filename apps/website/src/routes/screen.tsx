import { createFileRoute, useHydrated } from '@tanstack/react-router';
import { useEffect } from 'react';

import { screenEngine } from '../lib/realtime/engines/screen-engine';
import { useScreenStore } from '../lib/realtime/stores/screen-store';
import { SceneHost } from '../scenes/registry';
import { DebugOverlay } from '../wall/debug-overlay';
import { parseTile, resolveLayout, tileRect } from '../wall/layout';
import { WallStage } from '../wall/stage';

// One physical screen: `/screen?c=<col>&r=<row>`, the URL Vizzy Studio loads per wall node.
// `layout=mini` switches to the 3x2 simulator wall; `m=dev` adds the debug overlay.
type ScreenSearch = { c?: unknown; r?: unknown; layout?: unknown; m?: unknown };

export const Route = createFileRoute('/screen')({
    validateSearch: (search: Record<string, unknown>): ScreenSearch => search,
    component: ScreenPage
});

function ScreenPage() {
    // Realtime state arrives over the socket, possibly before React hydrates, so this page
    // renders on the client only; the server sends an empty dark shell.
    if (!useHydrated()) return <main className="h-screen w-screen bg-[#0a0e14]" />;
    return <ScreenPageContent />;
}

function ScreenPageContent() {
    const search = Route.useSearch();
    const layout = resolveLayout(search.layout);
    const tile = parseTile(layout, search.c, search.r);
    const scene = useScreenStore((state) => state.scene);

    useEffect(() => {
        // Touch the singleton so it connects on the client (its constructor is SSR-gated).
        screenEngine.getRole();
    }, []);

    if (!tile) {
        return (
            <main className="flex h-screen w-screen items-center justify-center bg-[#0a0e14] p-10 text-center text-4xl text-white">
                Invalid screen coordinates: c={String(search.c)} r={String(search.r)}. Expected 0 ≤
                c &lt; {layout.columns} and 0 ≤ r &lt; {layout.rows}.
            </main>
        );
    }

    return (
        <main className="h-screen w-screen overflow-hidden text-white">
            <WallStage layout={layout} view={tileRect(layout, tile)} debug={search.m === 'dev'}>
                <SceneHost scene={scene} />
                {search.m === 'dev' ? <DebugOverlay /> : null}
            </WallStage>
        </main>
    );
}
