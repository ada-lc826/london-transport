import { createFileRoute, useHydrated } from '@tanstack/react-router';

import { Button } from '../components/button';
import { Slider } from '../components/slider';
import { controlEngine } from '../lib/realtime/engines/control-engine';
import { useControlStore } from '../lib/realtime/stores/control-store';
import type { MapCity } from '../lib/realtime/types';
import { SCENE_IDS, SCENE_META } from '../scenes/scene-state';

type ControlSearch = {
    // Optional label so multiple control clients can be distinguished in the simulator.
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
    // `/control` models a handheld/operator endpoint:
    // - it sends intent (city, zoom, selection) into the websocket bus
    // - it does not render the heavy map visuals itself
    // This separation mirrors operational setups where controllers and wall screens have
    // different hardware constraints and UX goals.
    const { operator } = Route.useSearch();
    const sliderValue = useControlStore((state) => state.sliderValue);
    const selectedCity = useControlStore((state) => state.selectedCity);
    const scene = useControlStore((state) => state.scene);
    const connection = useControlStore((state) => state.connection);
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
        <main className="h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
            <div className="flex h-full w-full flex-col p-3">
                <header className="mb-3 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div>
                        <p className="text-[10px] tracking-[0.2em] text-[var(--muted-foreground)] uppercase">
                            Operator
                        </p>
                        <h1 className="text-sm font-semibold">Control Panel {operator}</h1>
                    </div>
                    <span className="rounded-full bg-[var(--primary)] px-2 py-1 text-[10px] font-medium text-[var(--primary-foreground)]">
                        /control
                    </span>
                </header>

                <section className="mb-3 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
                    <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                        <span>
                            Scene{' '}
                            {scene
                                ? `${SCENE_META[scene.id].title} · step ${scene.step + 1}/${SCENE_META[scene.id].steps}`
                                : '—'}
                        </span>
                        <span>{connection}</span>
                    </div>
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
                    <div className="flex gap-2">
                        <Button onClick={() => controlEngine.stepScene(-1)}>Previous step</Button>
                        <Button onClick={() => controlEngine.stepScene(1)}>Next step</Button>
                        <Button
                            onClick={() =>
                                controlEngine.setScenePlaying(!(scene?.timeline.playing ?? true))
                            }
                        >
                            {scene?.timeline.playing === false ? 'Play' : 'Pause'}
                        </Button>
                    </div>
                    {scene
                        ? Object.entries(SCENE_META[scene.id].params ?? {}).map(([key, spec]) => (
                              <div key={key} className="flex flex-col gap-1">
                                  <span className="text-xs text-[var(--muted-foreground)]">
                                      {spec.label}
                                  </span>
                                  <div className="grid grid-cols-3 gap-1">
                                      {spec.options.map((option) => (
                                          <Button
                                              key={option.value}
                                              onClick={() =>
                                                  controlEngine.setSceneParam(key, option.value)
                                              }
                                              variant={
                                                  scene.params[key] === option.value
                                                      ? 'highlight'
                                                      : 'normal'
                                              }
                                          >
                                              {option.label}
                                          </Button>
                                      ))}
                                  </div>
                              </div>
                          ))
                        : null}
                </section>

                <section className="flex gap-4">
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
                        <p className="text-xs text-[var(--muted-foreground)]">
                            City and zoom drive the Map check scene.
                        </p>
                    </div>
                </section>
            </div>
        </main>
    );
}
