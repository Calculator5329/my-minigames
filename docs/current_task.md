# Current task — Hotel Cascadia (live, in playtest)

**Plan:** `docs/plans/2026-04-19-cascadia.md`

The switchboard game ('418 Linden') has been rewritten ground-up into
**Hotel Cascadia** — same operator-board mechanic, fully new setting,
cast, dialogue, mechanics, and endings. Story prose is locked in the
plan file. Game `id` stays `switchboard` so saves and asset paths
don't break; the selector card title is "Hotel Cascadia."

## Status

| Step | State | Notes |
|---|---|---|
| Doc + manifest pass | done | |
| Content rewrite (`content.js`) | done | 8 voices, 4 nights, walkthrough, 3 endings. |
| Engine wiring | done | All M1–M10 from plan. |
| Audio re-bake | done | `scripts/rebake-cascadia.cmd` ran clean. |
| Pacing v2 (regen + cold open + cap) | done | See changelog for tuning numbers. |
| Visuals v1 (V1+V2+V3+V5+V6+V7) | done | Living lamps, cable physics, dust + vignette, paper-slip caller card, brass clock + corridor sliver, breathing camera. |
| Cable / state-leak bug across takeover restart | fixed | per-cable park timer instead of wall-clock setTimeout. |
| Jumpscare director + 7 procedural SFX (`scares.js`) | done | minor / moderate / major events. Phantom whispers, lamps, hands, header glitches, full-screen face flash. |
| Sampled SFX bank (Mixkit, 7 clips) | done | `voices.js` `playSample`/`hasSample`; scares director layers samples on top of procedurals when decoded; new `phantom_creature` + `phantom_radio_burst` events; architect 3:14 sweep cue with rising/falling-edge handle. |
| Polish + playtest | active | |

## Run this once when you're back

From the repo root, in PowerShell or `cmd`:

```
scripts\rebake-cascadia.cmd
```

This is the **only** command you need. It will, in order:

1. Dry-run the parser against `games/switchboard/content.js` to make
   sure the new content is well-formed (aborts before touching any
   files if not).
2. Back up the current `assets/switchboard/voices/` to
   `assets/switchboard/voices_pre_cascadia/` so you can roll back if
   anything looks wrong.
3. Wipe the live voices folder (the 418 Linden cast is fully retired).
4. Bake the new Hotel Cascadia cast. About 6–12 minutes for the full
   ~120 lines (4 nights of calls, whisper variants for dead-line bleed,
   5 walkthrough rooms, 3 endings). Streams progress to `scripts/bake.log`.

The script embeds the same `OPENROUTER_API_KEY` that `rebake.cmd` was
already using, so no env setup is needed. If the parser dry-run finds
a problem, the run aborts with a non-zero exit code before any files
are deleted.

## Locked decisions
1. **Title** in selector: `Hotel Cascadia`. Game `id` unchanged.
2. **Setting:** an impossibly tall hotel that resets its guests, with
   a single night-shift operator on Floor Zero. Architect grievance
   is the source of the loop.
3. **Cast:** eight voices — Mrs. Kestral, Mr. Ashworth, Dr. Pryce,
   The Bellhop, The Houseman, The Child in 312, The Replacement, The
   Architect (Auber Quint).
4. **Endings:** **CHECK OUT** (default loop — operator walks out into
   2026, falls asleep on a bench, wakes back at the desk with 4,200
   floors), **UNDERSTUDY** (you become the next operator's hallway),
   **DEMOLITION** (you lay the architect to rest; only real out).
5. **3:14 AM** is a recurring nightly window where the architect calls.
   Routing him to line 3 (third floor) across N1–N4 enables
   DEMOLITION eligibility.
6. **Replacement** calls in from your own office on Night 4 at 3:14;
   her route binds the ending.
7. **Failure** restarts the night with the player having become the
   Replacement (no save advancement, polite tutorial overlay reads
   "Welcome to your first shift at Hotel Cascadia").
8. **Audio** is a complete re-bake using a new `direction:` set on
   the new 8-voice profile.

## Previous task — Site quality pass (still paused)
The selector / loader / PWA pass
(`docs/plans/2026-04-19-selector-loader-pwa.md`) was awaiting Phase 2
go-ahead before the switchboard redesign came in. Phase 1 shipped.
Phases 2–4 remain. Resume after Hotel Cascadia lands.
