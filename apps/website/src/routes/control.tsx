import { createFileRoute, useHydrated } from '@tanstack/react-router';

import { Button } from '../components/button';
import { Slider } from '../components/slider';
import { HealthCard } from '../control/health-card';
import { NotesCard } from '../control/notes-card';
import { controlEngine } from '../lib/realtime/engines/control-engine';
import { useControlStore } from '../lib/realtime/stores/control-store';
import type { MapCity } from '../lib/realtime/types';
import { SCENE_IDS, SCENE_META, type SceneState } from '../scenes/scene-state';

type ControlSearch = {
    // Tablet A is the presenter (scenes, notes, wall health); any other operator is a
    // traveller who only makes the current scene's choices, e.g. S3's origin (plan §4.5).
    // The split is in the UI only: the bus accepts every intent from every tablet.
    operator: string;
};

export const Route = createFileRoute('/control')({
    validateSearch: (search: Record<string, unknown>): ControlSearch => {
        return {
            // Default operator id keeps the route usable when query params are omitted.
            operator: typeof search.operator === 'string' ? search.operator : 'A'
        };
    },
    component: ControlPage
});

function ControlPage() {
    // Realtime state arrives over the socket, possibly before React hydrates, so this page
    // renders on the client only; the server sends an empty dark shell.
    if (!useHydrated()) return <main className="h-screen w-screen bg-[var(--background)]" />;
    return <ControlPageContent />;
}

function ControlPageContent() {
    const { operator } = Route.useSearch();
    const presenter = operator === 'A';
    const scene = useControlStore((state) => state.scene);
    const connection = useControlStore((state) => state.connection);

    return (
        <main className="h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
            <div className="flex h-full w-full flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
                <header className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div>
                        <p className="text-[10px] tracking-[0.2em] text-[var(--muted-foreground)] uppercase">
                            Tablet {operator}
                        </p>
                        <h1 className="text-sm font-semibold">
                            {presenter ? 'Presenter' : 'Traveller'}
                        </h1>
                    </div>
                    <span
                        className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                            connection === 'open'
                                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                                : 'bg-red-500 text-white'
                        }`}
                    >
                        {connection === 'open' ? 'connected' : connection}
                    </span>
                </header>
                {presenter ? <PresenterPanel scene={scene} /> : <TravellerPanel scene={scene} />}
            </div>
        </main>
    );
}

function PresenterPanel({ scene }: { scene: SceneState | null }) {
    const wallHealth = useControlStore((state) => state.wallHealth);
    return (
        <>
            <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
                <div className="flex flex-wrap gap-2">
                    {SCENE_IDS.map((id) => (
                        <Button
                            key={id}
                            onClick={() => controlEngine.gotoScene(id)}
                            variant={scene?.id === id ? 'highlight' : 'normal'}
                        >
                            {SCENE_META[id].title}
                        </Button>
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => controlEngine.stepScene(-1)}>Previous step</Button>
                    <Button onClick={() => controlEngine.stepScene(1)} variant="highlight">
                        Next step
                    </Button>
                    <Button
                        onClick={() =>
                            controlEngine.setScenePlaying(!(scene?.timeline.playing ?? true))
                        }
                    >
                        {scene?.timeline.playing === false ? 'Play' : 'Pause'}
                    </Button>
                </div>
            </section>
            {scene ? <NotesCard scene={scene} /> : null}
            {scene ? <SceneParams scene={scene} /> : null}
            {scene?.id === 'map-check' ? <MapCheckControls /> : null}
            <HealthCard health={wallHealth} />
        </>
    );
}

function TravellerPanel({ scene }: { scene: SceneState | null }) {
    const hasParams = !!scene && Object.keys(SCENE_META[scene.id].params ?? {}).length > 0;
    return (
        <>
            <p className="text-xs text-[var(--muted-foreground)]">
                On the wall: {scene ? SCENE_META[scene.id].title : '—'}
            </p>
            {scene && hasParams ? (
                <SceneParams scene={scene} />
            ) : (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
                    Nothing to choose in this scene. Your choices appear here when the presenter
                    moves on.
                </p>
            )}
        </>
    );
}

function SceneParams({ scene }: { scene: SceneState }) {
    const params = Object.entries(SCENE_META[scene.id].params ?? {});
    if (!params.length) return null;
    return (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
            {params.map(([key, spec]) => (
                <div key={key} className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--muted-foreground)]">{spec.label}</span>
                    <div className="grid grid-cols-3 gap-1">
                        {spec.options.map((option) => (
                            <Button
                                key={option.value}
                                onClick={() => controlEngine.setSceneParam(key, option.value)}
                                variant={
                                    scene.params[key] === option.value ? 'highlight' : 'normal'
                                }
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
}

function MapCheckControls() {
    const sliderValue = useControlStore((state) => state.sliderValue);
    const selectedCity = useControlStore((state) => state.selectedCity);
    // Static city list is intentionally explicit for educational readability.
    const cities: Array<{ value: MapCity; label: string }> = [
        { value: 'london', label: 'London' },
        { value: 'paris', label: 'Paris' },
        { value: 'berlin', label: 'Berlin' },
        { value: 'madrid', label: 'Madrid' },
        { value: 'rome', label: 'Rome' },
        { value: 'amsterdam', label: 'Amsterdam' }
    ];

    return (
        <section className="flex gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
            <div className="grid grid-cols-2 gap-2">
                {cities.map((city) => (
                    <Button
                        key={city.value}
                        // Each city click emits a deterministic map-view command
                        // so every connected screen converges on the same location.
                        onClick={() => controlEngine.selectCity(city.value)}
                        variant={selectedCity === city.value ? 'highlight' : 'normal'}
                        className="text-left"
                    >
                        {city.label}
                    </Button>
                ))}
            </div>
            <div className="flex flex-col gap-2">
                <Slider
                    value={sliderValue}
                    // Slider updates are throttled inside the engine before broadcasting.
                    onValueChange={(value) => controlEngine.setSliderValue(value)}
                    onInteractionChange={(isInteracting) =>
                        controlEngine.setSliderInteracting(isInteracting)
                    }
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                    Zoom Level: {sliderValue.toFixed(0)}
                </p>
            </div>
        </section>
    );
}
