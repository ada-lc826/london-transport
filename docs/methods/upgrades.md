# Method: which stations to make step-free next (S7)

RQ4 asks what would reduce the penalty most. S7 compares TfL's own list of the next stations to be made step-free with lists our network model chooses for the same number of stations, under three ways of weighting London's neighbourhoods.

## Method

`pipeline/src/mind_the_step/upgrades.py`, on the same inputs as S4 ([equity.md](equity.md)):

1. **An upgrade** makes a station fully step-free: every line's platforms reachable from the street, and every change between its lines step-free, at the calibrated step-free times. In the model this switches on the station's step-free entry, exit and change edges; the network model labels every edge by the station it belongs to, so a plan is a mask on one graph, not a rebuild.
2. **Candidates**: the 177 tube stations not fully step-free today.
3. **The whole network.** Buses, the Overground, the Elizabeth line and rail already carry many step-free journeys the tube cannot ([bus-fallback.md](bus-fallback.md)). The bus fallback model gives an estimate of today's whole-network step-free time between every pair of stations. After an upgrade, a step-free traveller takes the faster of the new tube route and that estimate, so an upgrade is credited only where it beats what the rest of the network already offers. This needs one prediction for today's network, not predictions for hypothetical ones, and it is conservative: it ignores trips that would combine a new step-free station with a bus.
4. **Value of a plan**: how much it lowers the penalty (each neighbourhood's weighted mean extra minutes, step-free over standard, censored at 120, as in S4 but with step 3's whole network), summed over the 619 neighbourhoods in reach of the tube with a weight per neighbourhood, after plan §5.7's residents × (1 + α·disability + β·deprivation), where disability and deprivation are each neighbourhood's percentile of disability share and of IMD score:
    - **people**: α = β = 0;
    - **disability**: α = 2;
    - **deprivation**: β = 2.
5. **Greedy choice** for k = 1..20, with lazy evaluation: candidates' gains are kept as upper bounds and a station is taken only once its gain has been re-evaluated exactly with the model given the stations already chosen. Upgrades interact (two stations can serve the same neighbourhood), so the exact re-evaluation matters.
6. **Check**: on a reduced instance (the 12 best single upgrades, k = 3) the greedy set equals the exhaustive optimum.
7. **TfL's list**: the 12 stations TfL named in 2024 (Alperton, Arnos Grove, Colliers Wood, Croxley, Eastcote, East Finchley, Neasden, North Acton, Northwood, Tooting Broadway, Turnham Green, West Hampstead), evaluated the same way, plus South Kensington (due 2031).
8. **Sweeps**: k = 10 for α and β from 0 to 16, tracing the trade-off between minutes for everyone and for disabled residents, or for the most deprived fifth of neighbourhoods.

Reported for each plan: minutes off the average resident's penalty (everyone, disabled residents, the most deprived fifth) and the residents whose penalty falls by 5 minutes or more.

## Results

Counting buses and rail, the average step-free journey from a neighbourhood near the tube takes 11.4 minutes longer than the standard one; the tube alone would make it 18.9 (S4).

| 12 stations                    | Minutes saved: everyone | disabled | most deprived fifth | Residents gaining 5+ min |
| ------------------------------ | ----------------------: | -------: | ------------------: | -----------------------: |
| TfL's list                     |                     1.0 |      1.0 |                 0.7 |                  302,000 |
| TfL's list + South Kensington  |                     1.1 |      1.1 |                 0.8 |                  326,000 |
| Ours, people first             |                     1.9 |      1.9 |                 1.5 |                  595,000 |
| Ours, disabled residents first |                     1.8 |      1.8 |                 1.7 |                  613,000 |
| Ours, most deprived first      |                     1.7 |      1.8 |                 2.2 |                  630,000 |

- **Same budget, another order.** Twelve stations chosen for the journeys Londoners make save 87% more minutes than TfL's twelve, and almost twice as many residents (595,000 against 302,000) gain five minutes or more. Our first picks are Balham, Wood Green, Walthamstow Central, Tooting Broadway, Baker Street and Leyton. TfL's list reaches out to zone 7, and only Tooting Broadway is in both first twelves.
- **Counting the whole network changes the picks and widens the gap.** On the tube alone, ours saved 5.2 minutes against TfL's 3.2 (+66%). Every saving shrinks by about two thirds once buses and rail are counted (ours from 5.2 to 1.9 minutes, TfL's from 3.2 to 1.0, slightly more), because many step-free trips already have another way round. The choice shifts towards stations whose trips nothing else rescues: Balham and Tooting Broadway enter our first four, while Chalk Farm, East Finchley and Euston drop out of our first twelve.
- **Whom to put first.** Weighting disability barely changes the outcome: S4 found the penalty does not follow disability share. Weighting deprivation does. At k = 10, deprivation-first raises the most deprived fifth's saving from 1.3 to 2.0 minutes (+59%) for 8% less overall (1.66 to 1.53).

## Limitations

- **A station counts as one.** Costs differ by an order of magnitude (a deep interchange such as Baker Street against a surface station), and TfL also weighs what can be built, funding and disruption. The comparison is of benefit per station, not per pound.
- **The whole network is estimated**, not routed: the bus fallback model's error (about 6 minutes per trip, out of fold) carries into these savings. The tube-only results are kept in `upgrades.json` (`tubeOnly`) for comparison.
- **A full upgrade** is assumed (every line, every change); real schemes are sometimes partial.
- **Greedy** is checked on one reduced instance only; the full problem is not solved to proven optimality.
