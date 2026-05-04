# 00 — Research Scope Decision

## Decision
**Path B: landscape survey first, then path A on the chosen slice.**

## Reason
User does not yet have a directional lean on:
- Runtime infrastructure vs design-time tooling
- Mobile F2P vs console/PC live-service vs MMO vs other shape

Going deep on a slice that has not been validated wastes the work if the slice turns out wrong. Landscape survey is the cheapest path to a defensible slice choice.

## Session 1 deliverable
`.bocek/vault/01-landscape-survey.md` — three sections:

1. **Competitor surface.** Every existing platform / tool a studio could buy or use today. Per entry: what it does, who pays, which tier (indie / AA / AAA) it targets, what it explicitly does *not* do.
2. **Economy shapes.** The four-to-five distinct economy architectures studios actually run. Per shape: primitives needed, defining math, scale.
3. **Who pays.** Customer ICP table (studio tier × layer). Where the paying middle sits, where the floor (free tiers) and ceiling (build-your-own) crush a startup out.

## Out of scope for session 1
- Math (Markov chains, Monte Carlo, retention curves, gacha PMF)
- Stack choices (languages, databases, ledger architecture, scale)
- Money projections beyond top-line market sizing
- Any wedge claim

## Format
1–2 pages of dense bullets, source-cited inline. Readable in ~10 minutes. Built to make the path-A slice decision possible — not to teach the field.

## Next decision after session 1
Pick slice for session 2 (path A): `runtime | design-time` × `economy-shape`.
