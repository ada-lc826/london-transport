# Method: which stations to make step-free next (S7)

RQ4 asks what would reduce the penalty most. S7 compares TfL's own list of the next stations to be made step-free with lists our network model chooses for the same number of stations, under three ways of weighting London's neighbourhoods.

## Method

`pipeline/src/mind_the_step/upgrades.py`, on the same inputs as S4 ([equity.md](equity.md)):

1. **An upgrade** makes a station fully step-free: every line's platforms reachable from the street, and every change between its lines step-free, at the calibrated step-free times. In the model this switches on the station's step-free entry, exit and change edges; the network model labels every edge by the station it belongs to, so a plan is a mask on one graph, not a rebuild.
2. **Candidates**: the 177 tube stations not fully step-free today.
3. **Value of a plan**: how much it lowers S4's penalty (the weighted mean extra minutes of each neighbourhood's tube journeys, censored at 120), summed over the 619 neighbourhoods in reach of the tube with a weight per neighbourhood, after plan §5.7's residents × (1 + α·disability + β·deprivation), where disability and deprivation are each neighbourhood's percentile of disability share and of IMD score:
    - **people**: α = β = 0;
    - **disability**: α = 2;
    - **deprivation**: β = 2.
4. **Greedy choice** for k = 1..20, with lazy evaluation: candidates' gains are kept as upper bounds and a station is taken only once its gain has been re-evaluated exactly with the model given the stations already chosen. Upgrades interact (two stations can serve the same neighbourhood), so the exact re-evaluation matters.
5. **Check**: on a reduced instance (the 12 best single upgrades, k = 3) the greedy set equals the exhaustive optimum.
6. **TfL's list**: the 12 stations TfL named in 2024 (Alperton, Arnos Grove, Colliers Wood, Croxley, Eastcote, East Finchley, Neasden, North Acton, Northwood, Tooting Broadway, Turnham Green, West Hampstead), evaluated the same way, plus South Kensington (due 2031).
7. **Sweeps**: k = 10 for α and β from 0 to 16, tracing the trade-off between minutes for everyone and for disabled residents, or for the most deprived fifth of neighbourhoods.

Reported for each plan: minutes off the average resident's penalty (everyone, disabled residents, the most deprived fifth) and the residents whose penalty falls by 5 minutes or more.

## Results

Today the average step-free tube journey takes 18.9 minutes longer than the standard one (S4).

| 12 stations                    | Minutes saved: everyone | disabled | most deprived fifth | Residents gaining 5+ min |
| ------------------------------ | ----------------------: | -------: | ------------------: | -----------------------: |
| TfL's list                     |                     3.2 |      3.1 |                 2.4 |                  581,000 |
| TfL's list + South Kensington  |                     3.3 |      3.3 |                 2.5 |                  612,000 |
| Ours, people first             |                     5.2 |      5.2 |                 5.0 |                  753,000 |
| Ours, disabled residents first |                     5.2 |      5.2 |                 5.2 |                  802,000 |
| Ours, most deprived first      |                     5.2 |      5.2 |                 6.1 |                  894,000 |

- **Same budget, another order.** Twelve stations chosen for the journeys Londoners make save 66% more minutes than TfL's twelve, and 171,000 more residents gain five minutes or more. Our first picks are Wood Green, Tooting Bec, Walthamstow Central, Chalk Farm, Baker Street and Leyton: busy stations in zones 1–3. TfL's list reaches out to zone 7, and only East Finchley is in both first twelves.
- **Whom to put first.** Weighting disability barely changes the choice: S4 found the penalty does not follow disability share, so there is little to trade. Weighting deprivation does: at k = 10, deprivation-first raises the most deprived fifth's saving from 4.6 to 5.8 minutes (+25%) for 4% less overall (4.8 to 4.6).

## Limitations

- **A station counts as one.** Costs differ by an order of magnitude (a deep interchange such as Baker Street against a surface station), and TfL also weighs what can be built, funding and disruption. The comparison is of benefit per station, not per pound.
- **Tube only, as S4**: a station's value here is its value to tube journeys; buses, Overground and Elizabeth line are not in the model. The bus fallback model ([bus-fallback.md](bus-fallback.md)) finds four of the first seven picks (Wood Green, Walthamstow Central, Leyton, East Finchley) in the top 3% of stations where the wider network already makes up for the tube, so their whole-network value is smaller than shown here.
- **A full upgrade** is assumed (every line, every change); real schemes are sometimes partial.
- **Greedy** is checked on one reduced instance only; the full problem is not solved to proven optimality.
