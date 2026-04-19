# Franchise Frenzy — Multi-City Campaign Expansion

**Date:** 2026-04-19
**Trigger:** User feedback — "Franchise frenzy only has one 60s level, lets improve it."
**Sibling pattern:** `docs/plans/2026-04-19-reactor-expansion.md` — Reactor's
1-shift tycoon was upgraded to a 10-day campaign with persistent meta-progression.
Franchise gets the same treatment, scoped tighter.

## Pillars

1. **Multi-city campaign.** A run is no longer one 60-second shift; it's a
   sequence of 5 cities. Each city is a 60-second shift with a target net
   worth. Hit the target → next city, with a brief animated transition.
   Miss it → campaign over. Cash and owned businesses persist across cities.
2. **Persistent meta progression.** A new currency, **Stardollars**, is earned
   every campaign and spent in a pre-run shop on permanent buffs (start cash,
   click power, global rate, longer shifts, free managers).
3. **In-run depth.** Random events, manager auto-buyers, synergy bonuses for
   stacking the same tier — the run-to-run loop has reasons to play
   differently each time.
4. **New tier content.** 3 new business tiers (Casino, Movie Studio,
   Spaceport) gated behind later cities, so the ladder grows from 7 → 10.

## City list

Each city is a 60-second shift. Cash and businesses persist between cities.

| # | Name        | Net-worth target | Unlocks                               | Notes                              |
|---|-------------|------------------|---------------------------------------|------------------------------------|
| 1 | Smalltown   | $5,000           | Tutorial — 7 base tiers                | No events.                         |
| 2 | Midtown     | $50,000          | **Manager** mechanic                   | First random event during shift.   |
| 3 | Boomburg    | $400,000         | **Casino** (tier 8)                    | 2 events per shift.                |
| 4 | Megapolis   | $4,000,000       | **Movie Studio** (tier 9), Synergies live | 3 events per shift.             |
| 5 | Skyport     | $40,000,000      | **Spaceport** (tier 10), Boss event    | Hostile takeover bid mid-shift.   |

Targets escalate ~10× per city, matching the natural exponential of the
incremental loop. Designer note: the player should be able to clear city N
within ~50 of the 60 seconds with reasonable play, leaving headroom for
reinvestment.

## Persistence model

```js
Storage.getGameData('franchise') = {
  bestNetWorth:    Number,    // peak across all campaigns
  citiesCleared:   Number,    // best campaign progress (0..5)
  stardollars:     Number,    // unspent meta currency
  meta: { seed: 0..3, click: 0..3, rate: 0..3, time: 0..3, mgrs: 0..3 },
  campaignsWon:    Number,
  totalEarned:     Number     // lifetime $
}
```

Stardollar formula: `floor(peakNetWorth_thisCampaign / 25_000)`. Calibrated
so a city-3 finish gives ~16, a full city-5 win gives ~1.5K (with synergies +
all upgrades, end-state net worth lands around $40M+).

## Meta shop (5 upgrades × 4 levels)

| ID    | Label              | Effect per tier                        | Costs (Stardollars) |
|-------|--------------------|----------------------------------------|---------------------|
| seed  | Seed Capital       | Start campaign with +$50 / +$200 / +$1K / +$10K cash | 5 / 25 / 100 / 400 |
| click | Click Force        | Flagship click power x2 per tier       | 10 / 40 / 150 / 600 |
| rate  | Industry Boost     | +10% / +25% / +50% / +100% global rate | 15 / 60 / 250 / 1000|
| time  | Tycoon Time        | +5s / +10s / +15s / +20s per city      | 20 / 80 / 300 / 1200|
| mgrs  | Headhunter         | Start with 1 / 2 / 3 / 4 free managers | 30 / 120 / 500 / 2000|

## Managers

Unlocked at city 2 (or pre-bought via Headhunter). Each manager is hired to a
specific tier (one click on the tier card while the manager is unassigned).
Once assigned, the manager auto-purchases that tier whenever cash is available
(cooldown 0.6s between buys). Player can hire one manager per city by default;
Headhunter starts the run with extras.

Manager cost: $500, doubling per hire. Max 5 active managers per run.

## Random events

Every ~12 seconds (city 2+) a random event fires. Earlier cities skip events
or limit to one. Probability weights tuned so all 5 events are seen in a full
campaign on average.

| Event           | Effect                                          | Duration |
|-----------------|-------------------------------------------------|----------|
| Rush Hour       | Global rate ×2                                  | 8s        |
| Viral Moment    | Next 5 clicks × 10 (player still clicks flagship) | until used |
| Tax Audit       | Lose 15% of current cash, one-time              | instant   |
| Investor Knock  | A floating gold envelope — click within 5s for +20× current rate | 5s window |
| Power Outage    | Global rate ×0.5                                | 6s        |

UI: each event shows a banner with countdown. Visual flair (colored vignette
overlay during Rush Hour / Power Outage; floating envelope sprite for Investor).

## Synergies

Stacking same-tier multiplier:

- 10 of any tier → that tier's rate ×1.25
- 25 of any tier → that tier's rate ×2 (replaces the 1.25 — not stacking)
- 50 of any tier → that tier's rate ×4

Visualized as a small chevron/star ring on the tier card.

## Boss event (city 5)

At t=30s in city 5, a "Hostile Takeover" overlay appears. An AI bidder
auto-bids $X every 1.5s, starting at half your current cash. A big OUTBID
button is visible. Each click of OUTBID raises your bid by 10% of your
current cash. If your bid exceeds the AI's after 15 seconds, you keep your
network intact (no penalty). If not, the AI wins: lose 25% cash but the city
continues — you can still hit the target.

This is a deliberate "split your attention" mechanic: keep clicking the
flagship to make money? Or hammer OUTBID to defend it?

## File split

Following the Reactor pattern (small data file, single game file — Franchise
isn't complex enough to warrant five files):

```
games/franchise/
  manifest.js   (existing — bump description)
  data.js       (NEW — TIERS [10], CITIES [5], EVENTS [5], META_UPGRADES [5])
  game.js       (rewritten — owns shop / play / debrief phases)
```

`data.js` exposes its catalogs on `NDP.Franchise = { TIERS, CITIES, EVENTS, META }`
following the Reactor namespace convention.

`index.html` adds:
```html
<script src="games/franchise/data.js"></script>
```
**before** the existing `game.js` script tag.

## Phase / state machine

```
phase: 'shop' | 'transition' | 'play' | 'debrief' | 'campaignDone'

shop ──[DESCEND]──▶ play(city=1)
                       │
                       ├─target hit at any time? → keep playing until timer ends
                       │                                         │
                       └────────── timer ends ────────────────────┤
                                                                  ▼
                                                              debrief
                                                                  │
                              ┌──────── target hit? ─────────────┤
                              │                                   │
                              ▼                                   ▼
                       transition (1.5s anim)            campaignDone (lose)
                              │                                   │
                              ▼                                   ▼
                       play(city+1) or                   award Stardollars
                       campaignDone (won 5)              return to shop
```

`transition` shows: city N cleared banner, net-worth carryover summary,
tier unlock fanfare if applicable.

`debrief`/`campaignDone` show: campaign summary, Stardollars earned, BACK TO
SHOP button.

## Acceptance criteria (Phase 1 = this PR)

- [ ] Booting Franchise lands on the **shop** (not directly into a 60s shift).
- [ ] Shop shows: 5 meta upgrades, current Stardollars, "BEGIN CAMPAIGN"
      button, best campaign progress (e.g., "Best: Megapolis cleared").
- [ ] Pressing BEGIN starts city 1 with `seed` starting cash applied.
- [ ] On-screen HUD shows: time left, current city N/5, target $X, current
      $/s, current cash.
- [ ] Hitting the target at any time during the city flashes a "TARGET HIT —
      finish strong!" banner. Timer keeps running.
- [ ] When the city's 60s ends, if target met → transition to next city with
      cash + autos preserved. Else → campaign over screen.
- [ ] Cities 2+ fire at least one random event.
- [ ] Cities 2+ allow hiring a manager from any owned tier.
- [ ] City 5 triggers the Hostile Takeover at t=30.
- [ ] On campaign end (won or lost), the persistent shop is shown again with
      updated Stardollars and progress recorded.
- [ ] Saved data uses `Storage.getGameData('franchise') / setGameData`.

## Out of scope (future phases)

- Endless mode beyond city 5
- Daily challenge with fixed seed
- Achievements
- Per-city visual themes (the cities currently differ in palette only by
  background tint; full unique skylines are nice-to-have)
- Mobile touch tuning

## Risk register

| Risk | Mitigation |
|------|------------|
| Difficulty curve is wrong → city 2 wall or city 5 trivial | Tune `target` after a few playtests; numbers are isolated in `CITIES` array. |
| Click-spamming becomes RSI-y across 5 minutes | Managers + auto-buyers carry runs once unlocked. |
| Stardollar formula imbalance | First-pass calibration in `coinsEarned` + meta costs; iterate after first run. |
| File regression — code already worked | Keep file count tiny (1 new + 1 rewrite). All catalogs in `data.js` so tweaks are localized. |

## Effort estimate

~600-800 lines net new code (largely the campaign / shop / event subsystems
and a 200-line `data.js`). One session.
