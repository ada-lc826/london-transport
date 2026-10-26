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
    'the-pulse': [
        {
            cue: 'One weekday plays in 48 seconds: the top row is the day, each line on its own screen on the left, the map swells at the peaks.',
            say: "This is London's railway on an ordinary weekday, from TfL's own demand model. Watch the morning peak arrive: more than two hundred thousand people on the network at once."
        },
        {
            cue: 'Rings appear on stations with no step-free access, sized by the people entering them; the share of journeys starting there, bottom right.',
            say: 'A network built for everyone? Two in five tube journeys start at a station with no step-free way to the platform.'
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
    'who-pays': [
        {
            cue: 'Every London neighbourhood near the tube, coloured by how much longer its tube journeys take step-free; boroughs ranked on the right. Tablet B switches minutes and share of the tube lost.',
            say: "So who pays for the steps? For each of London's neighbourhoods we ran every tube journey twice through our model, standard and step-free. On an average journey the steps cost almost twenty minutes, and they cost most in a band across north London."
        },
        {
            cue: 'Colours change to penalty against the share of residents who are disabled; the scatter on the left; the two averages on the right.',
            say: "We expected the penalty to fall hardest where more disabled people live. It doesn't. The average disabled Londoner and everyone else face the same penalty. The steps don't choose who you are; they choose where you live."
        },
        {
            cue: 'Hot spots light up: neighbourhoods with a high penalty surrounded by others like them. Left: how many disabled Londoners lose half the tube.',
            say: 'And where you live decides a lot. Eight in ten disabled Londoners who live near the tube lose more than half of what it reaches in 45 minutes. The penalty is not random: it clusters, and that tells you where to build.'
        }
    ],
    'the-lifts': [
        {
            cue: 'The latest sample of our lift log: step-free stations on paper, how many are in practice, and which are not, with TfL’s own message.',
            say: 'On paper, 95 tube stations are fully step-free. But a step-free route is only as good as its lifts. Since the start of this project we have logged every lift outage, every 15 minutes, and recomputed each station without the broken lifts.'
        },
        {
            cue: 'The whole log replays: the top row counts stations cut off, the map flickers, the right zone sums it up.',
            say: 'Every red ring is a station someone was told was step-free, that was not at that moment. Some of them are not even a broken lift: the station had no staff to run it.'
        }
    ],
    'the-fix': [
        {
            cue: "TfL's list of the next stations it will make step-free, ringed in white; on the left, what they would save.",
            say: 'So what would fix it? TfL has named the next stations it will make step-free. Run them through our model, counting buses and rail as well as the tube, and the average step-free journey gets about a minute shorter.'
        },
        {
            cue: 'Our plan for the same number of stations lights up in gold, and the neighbourhoods it helps turn green. Tablet B chooses who to put first and how many stations.',
            say: 'Now let the model choose. Same number of stations, chosen for the journeys people actually make: the saving almost doubles, and twice as many Londoners gain five minutes or more.'
        },
        {
            cue: 'The trade-off curve on the left: weighting the most deprived neighbourhoods; on the right, the overlap with TfL’s list and the caveat on cost.',
            say: 'And we can choose whom to help first. Put the most deprived neighbourhoods first and they gain over half as much again, for under a tenth less overall. That is a choice for people, not for a model; the model just makes it visible.'
        }
    ],
    'the-close': [
        {
            cue: 'One figure from each scene across the wall: what we found.',
            say: "To close. Only about a third of tube stations are step-free, and two in five journeys start at one that isn't. The steps add almost twenty minutes to the average tube journey, they fall on where you live rather than who you are, and even the step-free stations lose it when a lift fails. But the order in which we fix them matters: the same budget can do almost twice as much."
        },
        {
            cue: 'How we did it, every data source and its credit, and a QR code to the code and methods.',
            say: 'Everything here is open data and open code: the methods, the data and every number are in the repository behind that QR code. Thank you.'
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
