import { SCENE_META, type SceneId } from './scene-state';

// Presenter notes for tablet A (plan §4.5, §7): for each step, what the wall is doing and what
// to say. Numbers that depend on data or on the tablet's choices are not written here; the
// tablet shows them live next to the notes (see `routes/control.tsx`).

export type StepNote = {
    // What the audience sees, so the presenter can talk without turning to the wall.
    cue: string;
    say: string;
};

export const SCENE_NOTES: Record<SceneId, StepNote[]> = {
    attract: [
        {
            cue: 'Title across the centre; the step glyph breathes on the shared clock.',
            say: "Mind the Step. Every map of the Tube shows the same London to everyone. This one asks what London looks like if you can't use stairs."
        }
    ],
    'the-step': [
        {
            cue: 'Every tube station, all drawn alike: the network as the map shows it.',
            say: 'These are all 272 Underground stations. On the Tube map they look equal: a dot is a dot.'
        },
        {
            cue: 'Shapes appear. Filled: every platform step-free from the street. Half: some. Ring: none. Left: one row per line.',
            say: "Now the same stations, by whether you can get from the street to the platform without a single step. We worked this out from TfL's own station topology, footpath by footpath. Only about a third pass."
        },
        {
            cue: 'Focus on South Kensington, the station for this room.',
            say: 'And the station you came through to get here, South Kensington, is not one of them.'
        }
    ],
    'two-londons': [
        {
            cue: 'Left map only: the fastest route from the chosen origin to every station, coloured by minutes.',
            say: 'Start here. Brighter is sooner. This is what the Journey Planner gives anyone who can take the stairs.'
        },
        {
            cue: 'Right map fills in: the same trips, step-free only. Headline and biggest gaps on the side zones.',
            say: 'Same city, same departure time, but every step of the way must be step-free. The map dims, and some stations drop out entirely. Tablet B can pick a different starting point.'
        }
    ],
    'the-race': [
        {
            cue: 'Line-up: the trip in the top-left corner; A and B at the start, the finish lines dashed.',
            say: 'Two people leave the same door at the same moment, for the same place. A can take the stairs. B uses a wheelchair. Time runs along the wall: every screen is five minutes.'
        },
        {
            cue: 'The race runs, one minute of journey per second. Each traveller’s clock moves along with them.',
            say: "Watch where B goes first. The Journey Planner's fastest step-free route is often not the tube at all."
        },
        {
            cue: 'Both journeys complete; the gap, and how B got there, next to A’s finish.',
            say: 'A has long since arrived. This is the same trip, step-free. Tablet B can pick another one.'
        }
    ],
    calibration: [
        {
            cue: 'Test card: coordinates on every screen; rings and diagonals cross every bezel.',
            say: 'Check every line runs straight across the bezels. A kink means a screen has the wrong position.'
        }
    ],
    'map-check': [
        {
            cue: 'Basemap across the wall, driven by the city and zoom controls.',
            say: 'Basemap check only; not part of the talk.'
        }
    ]
};

export function stepNote(id: SceneId, step: number): StepNote | null {
    return SCENE_NOTES[id][step] ?? null;
}

// Where Next step goes from here: the scene's next step, or null at its last step.
export function nextNote(id: SceneId, step: number): StepNote | null {
    return step + 1 < SCENE_META[id].steps ? stepNote(id, step + 1) : null;
}
