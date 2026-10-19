import { createFileRoute, useHydrated } from '@tanstack/react-router';
import { useEffect } from 'react';

import { screenEngine } from '../lib/realtime/engines/screen-engine';
import { useScreenStore } from '../lib/realtime/stores/screen-store';
import { SceneHost } from '../scenes/registry';
import { DebugOverlay } from '../wall/debug-overlay';
import { resolveLayout, wallRect, wallSize } from '../wall/layout';
import { useWallStage, WallStage } from '../wall/stage';

// The whole wall in one page: the full-wall preview, the source for screen recordings, and the
// target for Vizzy's compatibility mode (which renders at world size and crops per screen).
// It uses the same scene code and camera maths as `/screen`, but a single WebGL context, so it
// does not hit the browser's limit the way 64 iframes would.
type WorldSearch = { layout?: unknown; m?: unknown; bezels?: unknown };

export const Route = createFileRoute('/world')({
    validateSearch: (search: Record<string, unknown>): WorldSearch => search,
    component: WorldPage
});

function WorldPage() {
    // Realtime state arrives over the socket, possibly before React hydrates, so this page
    // renders on the client only; the server sends an empty dark shell.
    if (!useHydrated()) return <main className="h-screen w-screen bg-[#0a0e14]" />;
    return <WorldPageContent />;
}

function WorldPageContent() {
    const search = Route.useSearch();
    const layout = resolveLayout(search.layout);
    const scene = useScreenStore((state) => state.scene);

    useEffect(() => {
        screenEngine.getRole();
    }, []);

    return (
        <main className="h-screen w-screen overflow-hidden bg-black text-white">
            <WallStage layout={layout} view={wallRect(layout)} debug={search.m === 'dev'}>
                <SceneHost scene={scene} />
                {search.bezels === '0' ? null : <Bezels />}
                {search.m === 'dev' ? <DebugOverlay /> : null}
            </WallStage>
        </main>
    );
}

// Thin dark lines where the physical bezels are, so the preview shows what crosses them.
function Bezels() {
    const { layout } = useWallStage();
    const wall = wallSize(layout);
    const width = 16;
    return (
        <div className="pointer-events-none absolute top-0 left-0" style={wall}>
            {Array.from({ length: layout.columns - 1 }, (_, i) => (
                <div
                    key={`c${i}`}
                    className="absolute top-0 bg-black"
                    style={{
                        left: (i + 1) * layout.screenWidth - width / 2,
                        width,
                        height: wall.height
                    }}
                />
            ))}
            {Array.from({ length: layout.rows - 1 }, (_, i) => (
                <div
                    key={`r${i}`}
                    className="absolute left-0 bg-black"
                    style={{
                        top: (i + 1) * layout.screenHeight - width / 2,
                        height: width,
                        width: wall.width
                    }}
                />
            ))}
        </div>
    );
}
