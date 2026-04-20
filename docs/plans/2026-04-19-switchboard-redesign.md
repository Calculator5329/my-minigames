# 418 Linden — redesign pass *(ARCHIVED)*

Plan — 2026-04-19
**Status:** superseded on 2026-04-19 by
`docs/plans/2026-04-19-cascadia.md` (Hotel Cascadia rewrite). The
playtest-feedback diagnosis below is still accurate; the proposed
"dissociative house" story, cast, and endings here were dropped in
favor of the Hotel Cascadia setting. Pacing tuning, leaky scramble,
voice bleed, persistent [L] reminder, and inter-night Operator's Log
mechanics from this doc were carried forward into the Cascadia plan.

Kept on disk for context on the design rationale (why the original
'418 Linden' story didn't land in playtest). Do not implement from
this file.

---

Companion to `docs/plans/2026-04-19-switchboard-design.md`. That doc
defined the original game; this one rewrites the story, the pacing, and
the fiction layer on top of the same engine.

## Why

Live playtest feedback (mid-Night-2):

1. Pacing feels sleepy. Calls every 16–22s with a 24s TTL means most of
  the night is sitting still.
2. Story isn't landing. Caller text is dot-scrambled unless [L] is held
  (`board.js` `drawCallerCard`), so a player who isn't religiously
   leaning in learns *nothing* across two full nights.
3. The Child voice is the masculine TTS slot — current "Mama?" /
  "Mama, hurry." writing is a syrupy ghost-kid trope that the audio
   actively undercuts.

## Approved direction (from playtest convo)

- Keep the [L]-to-listen mechanic exactly as is. Reward leaning in,
don't lower the bar.
- Tone target: **Lynch / dissociative** — "you don't know who you are.
Time isn't moving. Every voice is some version of you. No external
monster — the horror is identity."
- Pacing aggression: **frantic** — Night 1 baseline, scaling to
punishing by Night 4.
- Lean *into* the wrong-sounding Child voice — write to it, don't fight
it.
- Replace the three endings with newly written endings; full creative
control approved.
- Mechanics added: phantom lamp, leaky scramble, voice bleed.
- Re-bake all voice audio with rewritten `direction:` notes.

---

## The Story (canonical)

### Premise

Linden Hill Exchange, 1923. The exchange building stands at **418
Linden Street.** You sit down for the night shift. Fog on the river.
Lines start lighting up. Voices ask to be connected.

You will not stand up again.

### What is actually happening

There is one person, in one chair, in one room, in 418 Linden Street.
They came in for a night shift on a foggy evening, sat down, and never
got up. Sixty-five years have passed. The kettle in the kitchen is
still whistling.

The voices that ring in are **not other people.** They are the parts
of the operator that did the things the operator did not do — sold
glass, raised a daughter, certified deaths, predicted weather, came
home for tea. Each part has rerouted itself away from the chair and is
now phoning in, asking to be reconnected. The Operator (you) is the
only thing keeping the parts apart.

Every "address" on the directory is somewhere inside 418 Linden. By
Night 4 the directory has *only* rooms inside the house. By Night 5
there is no board because there has never been a board — only the
kitchen, the parlor, the nursery, the hall, and the study, all in one
body in one chair.

### Cast (all the same person)


| Voice (id)                                                   | Role on the line                                                | What they actually are                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `halberd` Mrs. Halberd                                       | Mother waiting up. Asks for 418 Linden.                         | The part of you that became a parent. She is calling 418 Linden from inside 418 Linden. She is waiting for "her daughter" to come down for tea.                                                                                                                                                                                          |
| `longshift` The Long Shift *(replaces `child`)*              | Whispers on dead lines. Says "Mama."                            | **The first night operator at this exchange.** Sat down sixty-five years ago on a fog night much like this. He is still in the chair (your chair). His voice has aged into a man's voice but he doesn't know that — he still mouths "Mama" because that's what he was thinking when he sat down. He **is the chair you are sitting in.** |
| `crane` Mr. Crane                                            | Glass salesman. Confirming windows.                             | The part of you that made things for people. He installed every window in the house. He is still installing them. He doesn't remember finishing.                                                                                                                                                                                         |
| `doctor` Dr. Whalen                                          | Coroner-adjacent. Revising cause of death.                      | The part of you that pronounced people. He cannot finish the death certificate for the occupant of 418 Linden because he can't fill in the name.                                                                                                                                                                                         |
| `weatherman` The Weatherman                                  | Reads forecast.                                                 | The part of you that predicted things. He has been forecasting tomorrow's sunrise for ninety years. Tomorrow does not come.                                                                                                                                                                                                              |
| `you` The Operator                                           | Calls in starting Night 2. Wants to be connected to 418 Linden. | The part of you that just sat down. Trying to reach the chair to start the shift, not realizing the shift never ended.                                                                                                                                                                                                                   |
| `grocer` `cabbie` `ma` `receptionist` `operator2` `stranger` | Mundane callers.                                                | Other parts of you. The receptionist calls about a doctor who never came in this morning — she is calling about herself. Mrs. Kilgore the neighbor is the wall. Crane Glass is the windows. The Sister Exchange is the version of you that almost left the chair.                                                                        |


### The two confessions

- **The 418 Linden name reveal.** The board's brass header says
`LINDEN EXCHANGE — 418 LINDEN`. From line 1 the player can see that
the exchange and the address share the same number. They will not
notice on Night 1. They will start to notice on Night 2 when they
realize the *callers' addresses* are also 418 Linden. By Night 3,
half the directory is rooms inside 418 Linden.
- **What the operator did.** One foggy night, the operator sat down at
the board because someone needed to be the operator. They took the
first call. The kettle in the kitchen had just started whistling.
They never stood up to turn it off. They have been routing every
thought they have ever had into other lines so they don't have to
walk to the kitchen.

### Endings (REPLACES old Route / Deny / Hidden)

The walkthrough on Night 5 ends in the kitchen. Three endings, earned
by what the player did across Nights 1–4.

#### 1. CONNECT *(default "good" ending — and it is the loop)*

**How earned:** On Night 4, the player connects the `you`-voice
self-call (`critical: true`) to **418 Linden**. On Night 5 in the
kitchen, the player picks up the sixth jack and plugs it in.

**Plays out:**

> The line clicks open.
> A young voice on the wire — your own — says, "Mama, I got caught in the fog. I'm coming home."
> Mrs. Halberd: "There you are. There you are. There you are."
> The kettle stops whistling. The kitchen warms.
> Sunrise glows through the kitchen window for the first time in sixty-five years.
> *…*
> A lamp lights for Night One.
> You are still in the chair.
> You have agreed to be the operator forever.

**Score:** 300. Score reflects how cathartic *not* the loop is. The
end-screen recap will read **"YOU CAME HOME."**

#### 2. DENY *(refusing yourself)*

**How earned:** On Night 4, the player either misroutes the `you`
self-call OR denies it (D key). On Night 5 in the kitchen, the player
walks past the sixth jack and leaves through the doorway that wasn't
there before.

**Plays out:**

> The jack will not fit.
> Mrs. Halberd, very softly: "I'll wait up for you, dear. Every night, I'll wait up."
> The kitchen empties. The board empties.
> The hallway extends.
> You walk for a long time.
> At the end of the hallway is a switchboard you have never seen before.
> A lamp is lit.
> You sit down.

(You become someone else's Long Shift.) **Score:** 120.
End-screen recap: **"YOU TOOK THE NEXT SHIFT."**

#### 3. DISCONNECT *(replaces "Hidden" — the only real out)*

**How earned:** On any of Nights 1–4, the player **answered Mrs.
Halberd's call at least once but never connected her to 418 Linden** —
either let her ring out (missed) or routed her to the wrong line on
purpose (wrong). The flag is set the first night this is true and
persists. Listening to Halberd doesn't matter for this ending — what
matters is *refusing to be the line between her and the house.*

On Night 5, the kitchen still has the switchboard, but **there are no
cables.** Pressing space in front of Mrs. Halberd:

> She is not on the line. She has never been on the line.
> You walk to the wall.
> You bend down.
> You put your fingers around the cord that runs into the floor.
> You unplug the switchboard from the wall.

> The board goes dark.
> The kettle stops.
> The kitchen stays warm.
> Mrs. Halberd, very softly: "There. We can rest now."

(The only ending that lets the operator actually leave.)
**Score:** 500. End-screen recap: **"YOU UNPLUGGED THE BOARD."**

### Failure ("broken" composure) — recolored

Currently `gameOver()` with no narration. New text on broken composure:

> The lamps are too loud now.
> You stop hearing them. You stop hearing yourself.
> The board rings, and rings, and rings.
> Sunrise does not come.
> Restart at start of failed night. No save advancement.

### What the player might miss on a single playthrough

- That `LINDEN EXCHANGE` and `418 LINDEN` share an address. (Header.
Subtle until N3.)
- That every "neighbor" / "shop" the directory adds is actually inside
the house.
- That the Doctor's "occupant of 418 Linden" is the operator
themselves.
- That the Long Shift's whispers are a man's voice saying child things,
not a child's voice saying adult things.

These are intentional. Replays should make the dread retroactive.

---

## Pacing redesign

Currently `nights.js` `nightTuning` does:

- TTL: 24 → 22 → 20 → 18
- Miss penalty: 8 → 11 → 14 → 17
- Wrong penalty: 16 → 20 → 24 → 28
- Ringing drain: 0.15 / +0.10 per night, only when ≥2 ringing

New tuning (frantic baseline):


| Night | Duration | Avg call gap | Forced overlaps             | TTL | Miss pen | Wrong pen | Ring-drain (per ≥2 lit) |
| ----- | -------- | ------------ | --------------------------- | --- | -------- | --------- | ----------------------- |
| 1     | 180s     | ~7–8s        | 2× three-lamp moments       | 14  | 10       | 18        | 0.30                    |
| 2     | 200s     | ~6–7s        | 3× three-lamp, 1× four-lamp | 11  | 14       | 24        | 0.55                    |
| 3     | 220s     | ~5–6s        | constant ≥2, 2× four-lamp   | 9   | 18       | 30        | 0.85                    |
| 4     | 220s     | ~5s          | lines connect themselves    | 8   | 22       | 36        | 1.10                    |


Total runtime collapses from ~28 minutes (current) to ~14 minutes
across N1–N4 — closer to a single sitting.

### Why this works

- 4 cables × 8s TTL with calls every 5s on N4 = the player must commit
to routes in <2s per call or composure bleeds. Forces decision-making
under uncertainty, which is where the dissociation lands.
- Ring-drain ≥0.3 even on N1 means *ignoring* the second lamp costs
composure too — there is no safe state.

### Composure max ramp

Stays at 100. We rebalance penalties instead of increasing the bar.

---

## Mechanics changes

### A) Phantom lamp (Q7a, approved)

On Night 2+, occasionally a lamp lights on **line 11** — a socket that
does not exist on the board, painted into the wood between line 10 and
the right frame. It pulses for 10s and dims.

- Click it → -10 composure, the cable returns parked but darker (a
cosmetic taint that lasts the rest of the night).
- Ignore it → no penalty, but it lights again later in the night, and
starting Night 3 it whispers a single line of `longshift` audio while
lit.

Implementation: `board.js` adds an 11th `side: 'in', line: 11, ghost: true` socket; rendering paints it as embossed wood with a faint glow;
`pickSocket` excludes ghost; click handling adds a separate ghost-lamp
hit test in `_mouseDown`.

### B) Leaky scramble (Q7b, approved)

Currently `drawCallerCard` shows pure dots (`·`) when `!listening`.
New behavior: keep the scramble, but for each call mark which words
"leak" through legible. Specifically:

- Always leak: the requested address ("418 Linden", "418 Linden
(kitchen)").
- Often leak (per-call seeded): emotional anchor words ("daughter",
"Mama", "fog", "windows", "alive", "occupant", "sit down").
- Never leak: the verb-glue around them.

A player who routes without ever holding [L] sees something like
`"··· she's ··· not ··· coming home ··· 418 Linden ···"`. They get
enough to feel the dread but still have to lean in for the full
sentence.

Implementation: `content.js` `text` field stays prose; a new optional
`leakWords` array per call lists indices to expose. Helper
`scrambleWith(text, leakIdx)` lives in `board.js`. If `leakWords` is
omitted we deterministically pick every Nth word (default N=4) plus
any word matching a built-in leak set.

### C) Voice bleed (Q7c, approved)

On Night 2+, while the player is leaning into a focused call,
*other* currently-ringing lines whisper 1–2 words of their line in
their own voice through `SB.Voices.whisper`, at low gain.

Implementation: `voices.js` already has `whisper()`. New
`bleed(callId, text)` that picks a substring of `text` (first 1–3
words) and plays once via the whisper chain. `_tickBoard` triggers a
bleed for each ringing-but-not-focused call once per ~3s while
`this.listening`.

---

## Caller-card defaults

Current dialogue is *invisible* without [L]. New defaults:

1. Replace pure dots with leaky scramble (see Mechanics B).
2. Add a persistent corner reminder while any call is active or
  ringing: `[L] hold to lean in — story unfolds in the calls.` Pulses
   yellow, tucked in the bottom-left corner.
3. Add a small "voice tag" badge under the caller name on the card
  (`MRS. HALBERD — line 7`) so the player knows who is speaking even
   without leaning.

---

## Inter-night Operator's Log

After a night ends successfully and before the next intro, a card
fades in. Player presses Enter to continue.

Mock for after Night 1:

```
NIGHT ONE LOGGED.

Calls connected:    11 / 16
Calls missed:        3
Calls misrouted:     2

Mrs. Halberd called four times tonight, asking for 418 Linden.
Dr. Whalen revised one cause of death.
The County Weather Desk forecast fog. The fog is here.

You may rest. The board will ring again at sundown.

[ENTER] to continue
```

Tone: a logbook the operator is writing about themselves. Each night's
log surfaces 2–3 specific story beats from the night just played
(scripted per night, not generated). The N4 log includes:

> "A call came in tonight in your own voice, asking to be connected to
>  the address you are already at. You [routed it / refused it]."

This is the explicit story-clarity backstop. A player who never
holds [L] still gets the spine of the story through these cards.

---

## Walkthrough (Night 5) rewrites

### Room renames + figures

Same five rooms (Parlor, Study, Hall, Nursery, Kitchen), same five
figures, but rewritten lines + the Nursery figure changes role.

Nursery figure: replace "small figure facing the wall" with **"a grown
man hunched at a children's tin telephone, the headset cord wrapped
around the legs of his chair."** When the player approaches he does
not turn. He keeps mouthing into the toy phone.

Sample new lines (full set in implementation):

- **Parlor / Mr. Crane:**
  - "I came in to measure the windows. The order keeps growing."
  - "Every pane in this house is a Crane pane. I'd know them by the seam."
  - "I never did learn whose name to send the bill to."
- **Study / Dr. Whalen:**
  - "I write the same certificate every night. The name will not come."
  - "The occupant is breathing. The occupant is at the board."
  - "Look inside your headset. There is a name written there."
- **Hall / The Weatherman:**
  - "Tomorrow's forecast is the same as yesterday's."
  - "My broadcasts only ever went to one address."
  - "If the radio stops, please do not turn it on again."
- **Nursery / The Long Shift (formerly The Child):**
  - "Mama."
  - "I learned this word from the phone."
  - "I sat down to take one call."
  - "Have you been to the kitchen yet?"
  - "Don't put on the headset."
- **Kitchen / Mrs. Halberd:**
  - "There you are."
  - "I set out two cups of tea sixty-five years ago."
  - "She rang in once tonight. Will you connect her, or will you sit?"
  - (DISCONNECT path:) "There. We can rest now."

### Final interaction

- SPACE near Mrs. Halberd:
  - If self-call connected on N4 → CONNECT ending plays.
  - If self-call denied/misrouted on N4 → DENY ending plays.
  - If Halberd-was-never-connected flag set → DISCONNECT ending plays
  instead of CONNECT/DENY (overrides).

---

## Audio rebake (Q8, approved)

Rewrite `direction:` strings in `SB.VOICES` (in `content.js`) for every
voice. New direction notes target *uncanny calm:* longer pauses, more
deadpan, more articulation, less performance.

Per-voice direction rewrites:

- **halberd** — "Read with practiced tenderness, like reciting a prayer
out loud to no one. Pauses between phrases that are slightly too
long. Never raise your voice. Trail off sometimes mid-sentence as if
you forgot what you were saying. Do not cry."
- **longshift** *(new id, replaces `child`)* — "Adult man's voice. Slow.
Half-asleep. Speak as if you are a small child without realizing your
voice is not small anymore. Mouth the words like you are tasting
them. Long pause before the word 'Mama.' Sound content."
- **crane** — "Cheerful at first, then *too* cheerful. Linger on the
consonants. By Night 3 read the lines as if you are reading them off
a card someone else wrote about your own job. Smile through it."
- **doctor** — "Read every line as if it were the weather. No emotion.
Articulate the medical terms. Pause between phrases as if you are
reviewing a chart. Sound bored of dying."
- **weatherman** — "Mid-Atlantic radio cadence. Smooth, practiced.
Stretch the vowels. Long pauses where music would be. The forecast
is wrong but you do not know that."
- **you** — "Identical cadence to the operator. Sound as if you are
speaking from inside the listener's own head. Even, factual, faintly
tired. Add a soft echo on every other word, like a leaking patch
line. Never sound surprised by what you are saying."
- **grocer / cabbie / receptionist / operator2 / stranger / ma** —
Tighten existing notes; same characters, more deadpan. Stranger gets
longer drop-outs.

The bake script (`scripts/generate-voices.js`) already reads
`direction` from each voice profile and the new lines from `nights.js`

- `walkthrough.js`. We re-run a full bake after the script rewrite
lands. Old WAVs in `assets/switchboard/voices/` are fine to overwrite
in-place.

---

## File-by-file change list


| File                               | Change                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `games/switchboard/content.js`     | Rewrite all voice `direction:` notes. Rename `child` voice profile → `longshift`. Replace ALL Night 1–4 call scripts (new pacing + new dialogue). Replace `SB.NIGHT5.rooms` lines and Nursery figure description. Replace `SB.NIGHT5.endings` with new CONNECT / DENY / DISCONNECT text. Per-call `leakWords?: number[]` optional field added where we want to script which words leak through the scramble. |
| `games/switchboard/nights.js`      | New `nightTuning` numbers. `startNight` adds `flags.halberd_routed: false` and `flags.halberd_refused_once: false` for the DISCONNECT ending. `commitRoute` and the missed/wrong pathways set those flags appropriately when the call's `voice === 'halberd' && request === '418 Linden'`.                                                                                                                   |
| `games/switchboard/board.js`       | Add `phantom` 11th socket painted into the wood (no `pickSocket` hit). New `drawCallerCard` scramble using `leakWords` instead of pure dots. Persistent `[L] hold to lean in` corner reminder. New header text `LINDEN EXCHANGE — 418 LINDEN`.                                                                                                                                                               |
| `games/switchboard/game.js`        | Add inter-night Operator's Log card phase (`'log'` between board nights). Wire phantom-lamp click → composure penalty + cable taint. Wire voice bleed in `_tickBoard`. Wire DISCONNECT ending detection. Replace failure flash + `gameOver()` with the new "the lamps are too loud" copy and a 4s wait.                                                                                                      |
| `games/switchboard/voices.js`      | Add `bleed(callId, text)` (one-shot quiet whisper of first 1–3 words). No other behavioral change.                                                                                                                                                                                                                                                                                                           |
| `games/switchboard/walkthrough.js` | Update Nursery figure draw (grown man + tin phone + cord wrap). Endings logic: pick CONNECT vs DENY vs DISCONNECT per the new flags above. New room name plates if any (none expected).                                                                                                                                                                                                                      |
| `games/switchboard/manifest.js`    | No change unless preload list grows.                                                                                                                                                                                                                                                                                                                                                                         |
| `scripts/generate-voices.js`       | No code change; consumes the new `direction` notes + the new lines automatically.                                                                                                                                                                                                                                                                                                                            |
| `assets/switchboard/voices/`       | Full rebake after rewrite. Old `n*_c*.{wav,txt}` will be overwritten where the lines change; new line ids will be added; orphans (calls removed in the rewrite) deleted before bake.                                                                                                                                                                                                                         |
| `docs/changelog.md`                | Append a redesign entry citing this plan once shipped.                                                                                                                                                                                                                                                                                                                                                       |
| `docs/roadmap.md`                  | Add a follow-up entry under cross-cutting goals: **"418 Linden — dissociative redesign + frantic pacing (date)"**.                                                                                                                                                                                                                                                                                           |


---

## Open questions for the user (last round before code)

1. **Exchange name & address** — keep header as `LINDEN EXCHANGE — 418
  LINDEN`(the dual-identity reveal is in the header from line 1, but  silent), or push it harder by naming the exchange the same as the  address:`418 LINDEN EXCHANGE — 418 LINDEN STREET` (impossible to
   miss)?
2. **Save / progression on existing playthrough** — you're already
  mid-Night-2. After this lands, do you want me to (a) wipe your
   switchboard save so the rewrite is experienced from Night 1, or
   (b) leave it so you keep going from Night 2 with the new content?
3. **Tone ceiling** — am I free to write *quietly upsetting* (the
  kettle has been whistling for sixty-five years; the operator did
   not stand up to answer the door; the implication that staying in
   the chair has cost a life), or pull back to abstract / cosmic
   only? The plan above assumes "quietly upsetting" is okay.
4. **Audio rebake size** — full re-bake of all voices is ~108 lines.
  The wav set committed today is ~38MB. The rewrite changes ~80% of
   lines, so the rebake roughly replaces that 38MB. Okay to land that
   diff in one commit, or stage in two (script first, audio second)?

