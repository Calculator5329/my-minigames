# 418 Linden — Switchboard Operator
Design doc — 2026-04-19

## Premise
Five nights as a 1920s telephone operator. Route calls by plugging jacks into
sockets. The calls tell a story. The story is wrong. By Night 5 the switchboard
is gone and you're walking through a house that doesn't exist on any map.

## Tone
Uncanny-calm. No jump scares. The horror is in the gap between how polite the
callers are and what they're actually saying.

## Core mechanics

### Switchboard (Nights 1–4)
- 10 lines on the board; each line has an incoming socket and an outgoing
  socket. A call lights an incoming socket.
- The operator has **4 patch cables**, each with two jacks. Click-drag a jack
  to a socket. Connect the incoming jack to an outgoing jack pointing to the
  caller's requested destination.
- A directory card shows `destination name → line number`. The directory
  changes each night. Some entries are new, some are missing. Some point to
  rooms inside the building.
- If a caller isn't connected in ~12 seconds, they hang up (minor penalty).
- Connecting the **wrong** outgoing line damages the player's *composure*
  (the failure meter). Running out = night restart.
- **Listen-in**: click a live call to hear it. Listening to some calls costs
  time (you can miss other callers). Some calls only reveal plot if listened
  to in full.

### Night 5 (walkthrough)
Top-down walk through 418 Linden. Five rooms, each an audio-frozen tableau.
Interact to progress. Final choice plays out in the kitchen.

## Narrative structure

### The 6 recurring voices
| # | Voice | Role |
|---|---|---|
| 1 | **Mrs. Halberd** | Mother waiting up. Polite, tired. Always wants 418 Linden. |
| 2 | **The Child** | No line. Speaks only on dead channels. 3 words max. |
| 3 | **Mr. Crane** | Glass salesman. Cheerful. Confirming delivery to 418. |
| 4 | **The Doctor** | Requesting the coroner. Different cause of death each night. Same patient. |
| 5 | **The Weatherman** | Reads forecast to no one. Forecast is always the next in-game night. |
| 6 | **YOU** | Starting Night 2, a call where the caller's voice is yours. |

### Night by night
**N1**: Normal-ish. Mundane callers (grocer, cab dispatcher, doctor's office).
One misrouting incident (Mrs. Halberd's daughter). Weatherman mentions fog.

**N2**: Mrs. Halberd calls twice. Mr. Crane mentions a delivery to an address
"Operator, you'd know best." First `YOU` call appears. Directory loses one
number between calls.

**N3**: Callers describe impossible details (the trellis with two shadows).
Mr. Crane asks about Tuesday's cases — he never hung up. Doctor asks for the
coroner for the third time. Player can listen for longer rewards.

**N4**: Lines connect themselves. Mrs. Halberd says "She called already.
Didn't you connect her?" The `YOU` call wants to be routed to 418 Linden.
Connecting vs. refusing is the ending fork.

**N5**: Walkthrough. No switchboard UI. Five rooms. Final kitchen line.

### Endings
- **Route** — grief loop breaks; reunion.
- **Deny** — loop perpetuates; role reverses (New Game+).
- **Hidden** — never eavesdropped on Mrs. Halberd once across all nights;
  sixth line in kitchen; player sees the empty present-day switchboard and
  chooses to leave or stay.

## Audio strategy

### Primary: baked MP3s via TTS
- `scripts/generate-voices.js` reads `games/switchboard/voices.json` (script
  with `{id, voice, text, pitch, rate}` entries) and writes MP3s to
  `assets/switchboard/voices/<id>.mp3`. Uses ElevenLabs by default; adapter
  layer supports swapping providers.
- Credentials via `TTS_API_KEY` env var + optional `TTS_PROVIDER`.

### Fallback: SpeechSynthesis
- At runtime, if the expected MP3 isn't loaded, play the same text through
  `window.speechSynthesis` with the voice's `pitch` + `rate`. This actually
  suits the tone — period-accurate robotic operator affect.

### Ambient
- Procedural hum (WebAudio oscillator bank) layered under all nights. Gets
  slower and lower as nights progress.

## File layout
```
games/switchboard/
  manifest.js       // card + asset preload list
  game.js           // BaseGame subclass, owns switchboard/walkthrough modes
  board.js          // switchboard rendering + jack drag logic
  nights.js         // night-by-night call script + escalation config
  voices.js         // runtime voice player (MP3 preferred, SS fallback)
  walkthrough.js    // Night 5 house module
  content.js        // all call dialogue text
docs/plans/2026-04-19-switchboard-design.md
scripts/generate-voices.js
assets/switchboard/voices/  (generated)
```

## Out of scope (v1)
- Full Night 5 room art polish (we start with strong vibes, iterate later)
- Music (ambient hum only)
- Multiple directories / language options
- Achievements beyond the three endings

## Success criteria
- Completes a full Night 1 in preview with audio (SS fallback acceptable)
- All 5 nights reachable in ~20 minutes total playtime
- At least two endings reachable
- No broken directory / soft-lock states
