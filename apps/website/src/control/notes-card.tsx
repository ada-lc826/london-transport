import { loadJourneyTimes, summariseOrigin } from '../data/journeys';
import { loadNetwork, summariseStepFree } from '../data/network';
import { loadRaces } from '../data/races';
import { nextNote, stepNote } from '../scenes/notes';
import { SCENE_META, type SceneState } from '../scenes/scene-state';
import { useAsset } from '../scenes/use-asset';

// Presenter tablet: what the wall shows now, what to say, the figures on the wall right now
// (they change with tablet B's choices), and what Next step will bring.

export function NotesCard({ scene }: { scene: SceneState }) {
    const meta = SCENE_META[scene.id];
    const note = stepNote(scene.id, scene.step);
    const next = nextNote(scene.id, scene.step);
    return (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <h2 className="text-[10px] tracking-[0.2em] text-[var(--muted-foreground)] uppercase">
                {meta.title} · step {scene.step + 1}/{meta.steps}
            </h2>
            {note ? (
                <>
                    <p className="text-xs text-[var(--muted-foreground)] italic">{note.cue}</p>
                    <p className="text-base leading-snug">{note.say}</p>
                </>
            ) : null}
            <LiveFigures scene={scene} />
            <p className="border-t border-[var(--border)] pt-2 text-xs text-[var(--muted-foreground)]">
                {next ? (
                    <>
                        <span className="font-semibold">Next:</span> {next.cue}
                    </>
                ) : (
                    'Last step of this scene.'
                )}
            </p>
        </section>
    );
}

function LiveFigures({ scene }: { scene: SceneState }) {
    const network = useAsset(loadNetwork);
    const journeys = useAsset(loadJourneyTimes);
    const races = useAsset(loadRaces);
    if (!network) return null;
    let figures: string[] = [];
    if (scene.id === 'the-step') {
        const s = summariseStepFree(network.stations);
        figures = [
            `${s.full} of ${s.total} fully step-free (${Math.round((s.full / s.total) * 100)}%)`,
            `${s.partial} partial · ${s.none} none`
        ];
    } else if (scene.id === 'two-londons') {
        const origin = scene.params.origin ?? '';
        const name = network.stations.find((s) => s.id === origin)?.name ?? origin;
        const s = summariseOrigin(journeys?.times[origin]);
        figures = [
            `From ${name}`,
            s.medianExtraMinutes === null
                ? 'No journey data'
                : `+${Math.round(s.medianExtraMinutes)} min median extra`,
            s.shareAtLeastDouble === null
                ? ''
                : `${Math.round(s.shareAtLeastDouble * 100)}% at least twice as long`,
            `${s.noStepFreeRoute} with no step-free route`
        ].filter(Boolean);
    } else if (scene.id === 'the-race') {
        const race = races?.races.find((r) => r.id === scene.params.race);
        if (race?.standard && race.stepFree) {
            figures = [
                `A standard ${race.standard.minutes} min · B step-free ${race.stepFree.minutes} min`,
                `+${race.stepFree.minutes - race.standard.minutes} min for B`
            ];
        }
    }
    if (!figures.length) return null;
    return (
        <ul className="rounded-md bg-[var(--muted)] px-2 py-1 text-sm tabular-nums">
            {figures.map((figure) => (
                <li key={figure}>{figure}</li>
            ))}
        </ul>
    );
}
