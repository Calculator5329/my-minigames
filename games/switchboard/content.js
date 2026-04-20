/* Hotel Cascadia — all call dialogue.
   Each entry: { at, voice, request, text,
                 [critical], [flag], [onDeadLine],
                 [bellhopDead] (lit lamp, no caller name, no voice — recognising
                                it and letting it ring out is the right play),
                 [architect]   (the 3:14 AM single-lit-lamp event; routing to
                                the architect's home line ('Floor 3') counts
                                as 'let him rest' for that night),
                 [leakWords]   (number[] — indices of words that leak through
                                the scramble when the player isn't holding L)
               }.
   Voice keys map 1:1 to TTS voice ids in scripts/generate-voices.js AND to
   SpeechSynthesis voice selection rules in voices.js.

   Story is locked in docs/plans/2026-04-19-cascadia.md. Do not rewrite the
   prose without updating that doc. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  /* Eight-voice cast bible. Each profile carries:
     - name        : shown on the caller card
     - room        : optional room label badge under the name
     - ssPitch / ssRate : SpeechSynthesis fallback parameters
     - voice       : OpenAI gpt-audio voice id (passed by scripts/generate-voices.js)
     - ttsHint     : short character description sent to the TTS model
     - direction   : per-take acting note appended to every TTS request
     - filter      : { lo, hi } telephone bandpass; lower hi = more "tinny far"
     - reverb / hiss : 0..1 effect mix
     - rate        : HTMLAudio playbackRate. <1 = slower & lower
     - detune      : extra cents detune on playback
     - whisperPitch: SS pitch when this voice is whispering on a dead line
     The masculine TTS slot lands on `child312` deliberately — a sixty-year-old
     woman whose reset rolled her body back further than her mind, and whose
     voice never matched her current age. The mismatched voice is the lore. */
  SB.VOICES = {
    kestral: {
      name: 'Mrs. Kestral',
      room: 'room 412',
      ssPitch: 0.88, ssRate: 0.82,
      voice: 'shimmer',
      ttsHint: 'A kindly elderly woman in her seventies, calling the front desk about a dripping faucet she has been calling about every night since 1962. Her room is upside-down and she has been standing on the ceiling for forty years and only just realised.',
      direction: 'Speak softly and patiently into the receiver. Slow. A little tired. Pause briefly between phrases. By later nights sound politely puzzled — as if remembering a word you used to know. Do not raise your voice. Do not be afraid on tape. The fear is in the building, not in your delivery.',
      filter: { lo: 360, hi: 2600 }, reverb: 0.16, hiss: 0.10,
      rate: 0.97, detune: -8, whisperPitch: 0.7
    },
    ashworth: {
      name: 'Mr. Ashworth',
      room: 'room 88',
      ssPitch: 1.0, ssRate: 1.0,
      voice: 'onyx',
      ttsHint: 'A polite middle-aged businessman in for a sales conference. He has been at the conference for eleven years. By Night 3 there are six other men in his room who are also him.',
      direction: 'Begin friendly and professional, the way a salesman is on the first day of a conference. Each night the friendliness should thin slightly and the words should be chosen more carefully. Never raise your voice. Never panic on tape. By Night 4, when you introduce yourself as the second Ashworth, deliver it as if reading a polite name tag.',
      filter: { lo: 320, hi: 2900 }, reverb: 0.12, hiss: 0.08,
      rate: 0.99, detune: 0, whisperPitch: 0.85
    },
    pryce: {
      name: 'Dr. Pryce',
      room: 'room 1102',
      ssPitch: 0.84, ssRate: 0.92,
      voice: 'echo',
      ttsHint: 'A clinical older man, calm. He noticed the mirror in his bathroom stopped reflecting him three nights ago. He has begun calling the operator to ask, very politely, whether she has noticed yet what is happening to her.',
      direction: 'Flat clinical affect. Articulate every syllable as if dictating to a stenographer. Long pauses where another man would breathe. Read the disturbing lines the same cadence as the boring ones. Do not perform fear. Do not perform pity. Read the question "do you know what year it is" the same way you would read a vital sign.',
      filter: { lo: 300, hi: 2500 }, reverb: 0.14, hiss: 0.07,
      rate: 0.96, detune: -8, whisperPitch: 0.6
    },
    bellhop: {
      name: 'The Bellhop',
      room: 'elevator phone',
      ssPitch: 0.92, ssRate: 1.0,
      voice: 'fable',
      ttsHint: 'A polite uniformed bellhop calling from the elevator emergency phone, always between floors. After Night 3 he is the breathing in the shaft itself.',
      direction: 'On Nights 1 and 2: a calm professional voice in a metal box, slightly muffled. On Night 3: stop speaking mid-sentence. Inhale. Long, slow inhale. Do not exhale on tape. On Night 4: only the inhale.',
      filter: { lo: 280, hi: 2300 }, reverb: 0.30, hiss: 0.20,
      rate: 0.95, detune: -6, whisperPitch: 0.8
    },
    houseman: {
      name: 'The Houseman',
      room: 'all lines',
      ssPitch: 0.95, ssRate: 0.95,
      voice: 'echo',
      ttsHint: 'A flat-voiced man reading inventory lists across all lines as the bleed channel. Never the focused caller, only ever the background.',
      direction: 'Read like a forklift driver counting pallets at end of shift. No emotion. No pauses for meaning. By Night 4 you are reading inventory of things that cannot be inventoried. Read those exactly the same way you would read carpet samples.',
      filter: { lo: 280, hi: 2200 }, reverb: 0.20, hiss: 0.16,
      rate: 0.96, detune: -10, whisperPitch: 0.85
    },
    child312: {
      name: 'The Child in 312',
      room: 'room 312',
      ssPitch: 1.45, ssRate: 0.72,
      voice: 'onyx',
      ttsHint: 'A nine-year-old girl with the voice of a grown adult man. Her reset rolled her body back further than her mind, and her voice never came along. She does not realise her voice has changed. She thinks she is calling her grandmother in 1957.',
      direction: 'Say child things in an adult man\'s voice and do not perform a child voice. Speak slowly, kindly, content. Long pause before the word "Mama". Sound polite, as if calling a grandmother who is hard of hearing. Do not whisper. Do not perform horror. The horror is the voice itself, not the delivery.',
      filter: { lo: 240, hi: 2400 }, reverb: 0.45, hiss: 0.15,
      rate: 0.92, detune: +20, whisperPitch: 1.6
    },
    replacement: {
      name: 'The Replacement',
      room: 'FLOOR ZERO',
      ssPitch: 1.05, ssRate: 1.0,
      voice: 'alloy',
      ttsHint: 'A twenty-two-year-old woman calling in for her first night shift as the operator at Hotel Cascadia. Polite, slightly nervous. She is calling from the operator\'s own office. She does not yet know that.',
      direction: 'Polite. Slightly nervous the way someone is on a first day. Apologise small. Do not act spooky. Do not know yet. By the end of Night 4 sound a little surer of the room. Speak as if to a friendly colleague who has been doing this job a long time.',
      filter: { lo: 380, hi: 3100 }, reverb: 0.18, hiss: 0.10,
      rate: 0.99, detune: -2, whisperPitch: 1.0
    },
    architect: {
      name: 'Auber Quint',
      room: 'Floor 3',
      ssPitch: 0.7, ssRate: 0.78,
      voice: 'echo',
      ttsHint: 'The dead architect of Hotel Cascadia. Died of a stroke on the third floor in 1934 mid-billing-dispute with the contractor. Calls only between 3:14 and 3:17 AM. Almost never speaks; mostly the inhale.',
      direction: 'Take a long, slow inhale before any word, then deliver the line flat as if reading a clause from a contract you wrote ninety years ago. Do not raise your voice. Do not be angry on tape — the anger has gone into the building. Words are an interruption to the breathing, not the other way round.',
      filter: { lo: 220, hi: 1900 }, reverb: 0.55, hiss: 0.22,
      rate: 0.92, detune: -22, whisperPitch: 0.55
    }
  };

  /* Per-night directories. Board grows by night:
       N1: 6 lines (1..6)
       N2: 8 lines (1..8)
       N3: 10 lines (1..10)
       N4: 12 lines (1..12)
     Each new line that appears on a later night is announced with the
     "NEW LINE INSTALLED" stamp on the directory entry — see board.js.
     Directory keys here MUST match the `request:` field on calls below. */
  SB.DIRECTORIES = {
    n1: {
      'Front Desk':         1,
      'Maintenance':        2,
      'Floor 3':            3,
      'Restaurant':         4,
      'Housekeeping':       5,
      'Conference Suite':   6
    },
    n2: {
      'Front Desk':         1,
      'Maintenance':        2,
      'Floor 3':            3,
      'Restaurant':         4,
      'Housekeeping':       5,
      'Conference Suite':   6,
      'Bell Stand':         7,
      'Floor 88':           8
    },
    n3: {
      'Front Desk':         1,
      'Maintenance':        2,
      'Floor 3':            3,
      'Restaurant':         4,
      'Housekeeping':       5,
      'Conference Suite':   6,
      'Bell Stand':         7,
      'Floor 88':           8,
      'Floor 412':          9,
      'Floor 1102':         10
    },
    n4: {
      'Front Desk':         1,
      'Maintenance':        2,
      'Floor 3':            3,
      'Restaurant':         4,
      'Housekeeping':       5,
      'Conference Suite':   6,
      'Bell Stand':         7,
      'Floor 88':           8,
      'Floor 412':          9,
      'Floor 1102':         10,
      'Penthouse':          11,
      'Roof Access':        12
    }
  };

  /* Per-night entry that gets briefly stamped ARCHIVED in red on the
     directory once during the night. Pure dread tell — no mechanical
     effect; the call to that guest still routes correctly. The hotel has
     already reset that guest at least once. */
  SB.ARCHIVED_BY_NIGHT = {
    1: null,
    2: 'Floor 412',
    3: 'Floor 88',
    4: 'Floor 1102'
  };

  /* Inter-night ledger card. Shown between nights as the hotel's own
     inventory log — short lines, deadpan, no exposition. Pulls the
     player a half-step deeper into the building each time. Selected by
     game.js after the player survives a night. */
  SB.LEDGER_BY_NIGHT = {
    1: [
      'INTER-NIGHT LEDGER — HOTEL CASCADIA',
      '> 1 (one) operator: present, oriented, breathing.',
      '> 1 (one) faucet: dripping, room 412, since 1962.',
      '> 0 (zero) deaths recorded. Architect remains on third floor.',
      '> Bell stand and floor 88 to be added overnight.'
    ],
    2: [
      'INTER-NIGHT LEDGER — HOTEL CASCADIA',
      '> 1 (one) operator: present, slightly tired.',
      '> 7 (seven) Mr. Ashworths in conference suite. Ceiling holding.',
      '> 1 (one) Mrs. Kestral: now standing on ceiling. No action required.',
      '> 0 (zero) windows opened. Painter not returning calls.',
      '> Floor 412 and floor 1102 to be added overnight.'
    ],
    3: [
      'INTER-NIGHT LEDGER — HOTEL CASCADIA',
      '> 1 (one) operator: present, blinking less.',
      '> 1 (one) bellhop: no longer breathing on tape, breathing in shaft.',
      '> 1 (one) child: in 312, age listed as 9, voice listed as adult male.',
      '> 1 (one) Dr. Pryce: scheduled for housekeeping reset, request honored.',
      '> Penthouse and roof access to be added overnight.'
    ],
    4: [
      'INTER-NIGHT LEDGER — HOTEL CASCADIA',
      '> 1 (one) operator: in office, has not stood up in thirty (30) years.',
      '> 1 (one) Replacement: en route, expected on Floor Zero this shift.',
      '> 1 (one) door behind operator desk, marked SUPPLY, never opened.',
      '> 4,200 (four-thousand-two-hundred) floors built, last counted Tuesday.',
      '> Architect: Auber Quint, deceased 1934, still on Floor Three.'
    ]
  };

  /* All callable lines per night. Times are in seconds since night start.
     Pacing target (per docs/plans/2026-04-19-cascadia.md § Pacing):
       N1: 180s, ~7–8s gap, TTL 14
       N2: 200s, ~6–7s gap, TTL 11, 1 four-lamp moment
       N3: 220s, ~5–6s gap, TTL 9, dead-bellhop arrives
       N4: 220s, ~5s gap, TTL 8, lines connect themselves, Replacement+Architect overlap at 3:14 */
  SB.NIGHTS = [
    {
      id: 1,
      durationSec: 180,
      ambientPitch: 1.0,
      directory: 'n1',
      lineCount: 6,
      architectAt: 118,            // 3:14 AM window, single dim lamp
      intro: 'NIGHT ONE\n\nYou are the night switchboard operator at Hotel Cascadia, Floor Zero.\nThe lobby is quiet. The elevator hums.\nLines light up on the board. You answer them. You connect them.\n\nClick a glowing lamp to pick up.\nHold [L] to lean into the receiver and hear what they want.\nDrag a cable from their INCOMING socket down to the OUTGOING socket\nthat matches the name in the directory on your right.\n\nThe hotel does not like to be kept waiting.',
      calls: [
        { at: 4,   voice: 'kestral',   request: 'Maintenance',
          text: 'Front desk, dear. The faucet in 412 is dripping again. You\'ll send someone, won\'t you.',
          leakWords: [0, 4, 5, 6] },
        { at: 16,  voice: 'ashworth',  request: 'Front Desk',
          text: 'Hello, front desk. Mr. Ashworth, room 88. Just confirming the wake-up call for the conference tomorrow.',
          leakWords: [3, 4, 6, 9, 11] },
        { at: 28,  voice: 'bellhop',   request: 'Housekeeping',
          text: 'Bellhop here on the elevator phone. Need a maid sent to the third floor. Spilled tray.',
          leakWords: [1, 4, 8, 10] },
        { at: 40,  voice: 'kestral',   request: 'Maintenance',
          text: 'Hello, dear. Same drip. Same room. I\'m sorry to keep calling.',
          leakWords: [3, 5] },
        { at: 52,  voice: 'pryce',     request: 'Front Desk',
          text: 'Dr. Pryce, eleven-oh-two. Quick question for the front desk — is the water in this hotel always this hard.',
          leakWords: [0, 6, 12] },
        { at: 65,  voice: 'ashworth',  request: 'Conference Suite',
          text: 'Mr. Ashworth again. Could you patch me through to the conference suite. I think I left my notes there.',
          leakWords: [2, 6, 11] },
        { at: 78,  voice: 'kestral',   request: 'Maintenance',
          text: 'Operator. The faucet is louder tonight. Maintenance, please. Take your time.',
          leakWords: [3, 4, 5] },
        { at: 90,  voice: 'bellhop',   request: 'Front Desk',
          text: 'Bellhop. There\'s a guest in the lobby asking what year it is. Front desk, please.',
          leakWords: [4, 7, 8, 9] },
        { at: 102, voice: 'pryce',     request: 'Restaurant',
          text: 'Pryce, eleven-oh-two. Room service for the restaurant. One pot of tea, no milk. Thank you.',
          leakWords: [3, 6, 10] },
        // 3:14 AM — architect window. Single lit lamp during the silence.
        { at: 118, voice: 'architect', request: 'Floor 3',
          text: 'Floor three. Floor three. Floor three.',
          architect: true, leakWords: [0, 1] },
        { at: 138, voice: 'kestral',   request: 'Maintenance',
          text: 'Operator, dear. The drip stopped. Then it started again from the ceiling. Maintenance, please.',
          leakWords: [3, 7, 8, 9] },
        { at: 150, voice: 'ashworth',  request: 'Front Desk',
          text: 'Front desk. Mr. Ashworth. The door of room 88 just opened by itself. Could you note that down.',
          leakWords: [3, 6, 9, 14] },
        { at: 162, voice: 'bellhop',   request: 'Housekeeping',
          text: 'Bellhop. The third-floor guest never came down for the maid. Probably nothing.',
          leakWords: [1, 3, 4, 9] }
      ],
      deadlineNote: 'Sunrise. The hotel does not produce one.'
    },

    {
      id: 2,
      durationSec: 200,
      ambientPitch: 0.94,
      directory: 'n2',
      lineCount: 8,
      architectAt: 132,
      newLines: ['Bell Stand', 'Floor 88'],
      intro: 'NIGHT TWO\n\nTwo new lines have been installed on your board overnight.\nA bell stand on Line 7. Floor 88 on Line 8.\nYou do not remember signing for the work.\n\nMrs. Kestral in 412 reports the faucet is now dripping from the ceiling.',
      calls: [
        { at: 3,   voice: 'kestral',   request: 'Maintenance',
          text: 'Hello, dear. The drip is on the ceiling now. I\'m looking up at it. It\'s above my head.',
          leakWords: [3, 5, 6, 12] },
        { at: 14,  voice: 'ashworth',  request: 'Floor 88',
          text: 'Front desk. Mr. Ashworth. Could you ring my own room, please. I want to know if anyone picks up.',
          leakWords: [3, 8, 9, 14, 15, 16] },
        { at: 24,  voice: 'pryce',     request: 'Front Desk',
          text: 'Dr. Pryce, eleven-oh-two. Forgive me — could the operator tell me what year it is. I\'ve lost track.',
          leakWords: [0, 7, 9, 10, 11] },
        { at: 35,  voice: 'bellhop',   request: 'Bell Stand',
          text: 'Bellhop. Patch me through to the bell stand, please. I\'m on the elevator phone again.',
          leakWords: [2, 5, 6, 10] },
        { at: 46,  voice: 'kestral',   request: 'Maintenance',
          text: 'Maintenance, please. The faucet is dripping upward now. I think the room is upside-down.',
          leakWords: [3, 5, 9, 11] },
        { at: 57,  voice: 'ashworth',  request: 'Conference Suite',
          text: 'Mr. Ashworth. Conference suite. There\'s another man in here. He says he\'s also Mr. Ashworth.',
          leakWords: [3, 6, 7, 12] },
        { at: 68,  voice: 'child312',  request: 'Front Desk',
          text: 'Hello? Is this Grandma\'s house? It\'s me, sweetie. From three-twelve.',
          leakWords: [3, 7, 9] },
        { at: 80,  voice: 'pryce',     request: 'Housekeeping',
          text: 'Pryce again. Could you send someone to look in the mirror in eleven-oh-two. Tell me if you see me.',
          leakWords: [4, 8, 9, 13, 14] },
        { at: 92,  voice: 'bellhop',   request: 'Front Desk',
          text: 'Bellhop. The elevator stopped between floors and the call button is glowing on its own. Front desk.',
          leakWords: [1, 4, 6, 10, 13] },
        { at: 104, voice: 'kestral',   request: 'Maintenance',
          text: 'Operator. I\'ve been standing on the ceiling for some time now. Maintenance. Take your time.',
          leakWords: [3, 4, 5, 9] },
        { at: 116, voice: 'ashworth',  request: 'Floor 88',
          text: 'Front desk. Mr. Ashworth. I wanted to ring my room again. There are three of us now.',
          leakWords: [3, 7, 12, 13, 14] },
        // 3:14 AM
        { at: 132, voice: 'architect', request: 'Floor 3',
          text: 'Floor three. Bring the boy down to floor three.',
          architect: true, leakWords: [0, 1, 6] },
        { at: 150, voice: 'pryce',     request: 'Restaurant',
          text: 'Pryce, eleven-oh-two. Tea, again. The pot from yesterday is still warm. Send another.',
          leakWords: [4, 7, 9, 12] },
        { at: 162, voice: 'kestral',   request: 'Maintenance',
          text: 'Hello, dear. I just realised I\'ve been standing on the ceiling for forty years.',
          leakWords: [4, 7, 11, 13] },
        { at: 174, voice: 'bellhop',   request: 'Bell Stand',
          text: 'Bellhop. There is a guest from 1968 in the lobby. He says he has no luggage.',
          leakWords: [4, 6, 11] },
        { at: 186, voice: 'ashworth',  request: 'Front Desk',
          text: 'Front desk. Ashworth. The other Ashworth answered the wake-up call before me.',
          leakWords: [2, 5, 8, 11] }
      ],
      deadlineNote: 'Sunrise. The hotel will not produce one.'
    },

    {
      id: 3,
      durationSec: 220,
      ambientPitch: 0.88,
      directory: 'n3',
      lineCount: 10,
      architectAt: 144,
      newLines: ['Floor 412', 'Floor 1102'],
      intro: 'NIGHT THREE\n\nTwo more lines on the board: Floor 412, Floor 1102.\nThe board is wider now. The desk is the same desk.\n\nDr. Pryce in 1102 has begun calling you directly.\nThe Bellhop has stopped speaking.',
      calls: [
        { at: 2,   voice: 'kestral',   request: 'Maintenance',
          text: 'Operator, dear. The faucet is dripping all four directions at once. Maintenance, please.',
          leakWords: [3, 5, 6, 7, 8] },
        { at: 12,  voice: 'pryce',     request: 'Front Desk',
          text: 'Pryce. The mirror in eleven-oh-two stopped showing me three nights ago. Have you noticed yet what\'s happening to you.',
          leakWords: [0, 3, 8, 9, 14, 17] },
        { at: 22,  voice: 'ashworth',  request: 'Floor 88',
          text: 'Front desk. There are six other men in eighty-eight now. We are all having the same conference.',
          leakWords: [3, 4, 7, 12, 14] },
        { at: 32,  voice: 'bellhop',   request: 'Bell Stand',
          text: '...',
          bellhopDead: true, leakWords: [] },
        { at: 42,  voice: 'kestral',   request: 'Floor 412',
          text: 'Hello. The faucet has stopped. The water is still falling but the faucet has stopped.',
          leakWords: [2, 3, 4, 9, 10] },
        { at: 52,  voice: 'child312', request: 'Front Desk',
          text: 'Hello? Mama. Is this where Grandma lives now? The lady downstairs has the wrong voice.',
          leakWords: [2, 5, 8, 13] },
        { at: 62,  voice: 'houseman',  request: 'Front Desk',
          text: 'Inventory check. Floor four, the restaurant. Floor seven, ice. Floor nine, no bed, no window, no door.',
          leakWords: [0, 3, 6, 9, 12, 13, 14] },
        { at: 74,  voice: 'pryce',     request: 'Floor 1102',
          text: 'Pryce, eleven-oh-two. I wanted to read you the chart for the operator on duty tonight. May I.',
          leakWords: [4, 7, 9, 11, 14] },
        { at: 86,  voice: 'kestral',   request: 'Maintenance',
          text: 'Operator. The drip is coming from inside my own throat now. Maintenance, please. Sorry.',
          leakWords: [3, 6, 9, 11] },
        { at: 98,  voice: 'ashworth',  request: 'Conference Suite',
          text: 'Front desk. Mr. Ashworth. Could you cancel my flight on the seventh. The seventh has not arrived in eleven years.',
          leakWords: [3, 6, 11, 13, 16] },
        { at: 112, voice: 'bellhop',   request: 'Front Desk',
          text: '...',
          bellhopDead: true, leakWords: [] },
        { at: 124, voice: 'pryce',     request: 'Front Desk',
          text: 'Pryce. Listen carefully — the brass plate above the door behind your desk has changed once tonight. Have you looked.',
          leakWords: [0, 4, 7, 8, 14, 17] },
        // 3:14 AM
        { at: 144, voice: 'architect', request: 'Floor 3',
          text: 'Floor three. The contractor still owes me a clock.',
          architect: true, leakWords: [0, 1, 4] },
        { at: 164, voice: 'kestral',   request: 'Floor 412',
          text: 'Operator, dear. I think 412 is no longer in this building.',
          leakWords: [3, 4, 5, 9, 10] },
        { at: 176, voice: 'child312',  request: null,
          text: 'Mama, my hair is the wrong colour now.', onDeadLine: true,
          leakWords: [0, 2, 5] },
        { at: 188, voice: 'ashworth',  request: 'Floor 88',
          text: 'Front desk. We voted in eighty-eight. We agreed to keep being Ashworth.',
          leakWords: [4, 7, 9] },
        { at: 200, voice: 'pryce',     request: 'Floor 1102',
          text: 'Pryce. I would like to be reset tomorrow. Please mark me on the housekeeping list.',
          leakWords: [4, 7, 12] }
      ],
      deadlineNote: 'Sunrise. The hotel will produce one. It will not be the right colour.'
    },

    {
      id: 4,
      durationSec: 220,
      ambientPitch: 0.80,
      directory: 'n4',
      lineCount: 12,
      architectAt: 148,
      newLines: ['Penthouse', 'Roof Access'],
      intro: 'NIGHT FOUR\n\nTwo more lines: Penthouse, Roof Access.\nThe board is twelve wide now. Your desk is the same desk.\n\nA call will come in tonight from inside your own office.\nWhat you do with it decides how this ends.',
      calls: [
        { at: 4,   voice: 'kestral',   request: 'Maintenance',
          text: 'Operator. I no longer believe the room is upside-down. I think I am.',
          leakWords: [4, 9, 11] },
        { at: 14,  voice: 'pryce',     request: 'Front Desk',
          text: 'Pryce. Quick chart note. The clock above your board stopped at three-fourteen at some point tonight.',
          leakWords: [0, 5, 7, 13] },
        { at: 24,  voice: 'ashworth',  request: 'Floor 88',
          text: 'Front desk. This is the second Ashworth. The first Ashworth has agreed to stop answering.',
          leakWords: [3, 5, 6, 11] },
        { at: 34,  voice: 'houseman',  request: 'Front Desk',
          text: 'Inventory. Floor seven-one-two, ice. Floor four, the restaurant. Floor eight-two-two, no bed, no window, no door. Floor zero, the operator.',
          leakWords: [0, 2, 5, 9, 11, 12, 14] },
        { at: 44,  voice: 'bellhop',   request: 'Bell Stand',
          text: '...',
          bellhopDead: true, leakWords: [] },
        { at: 54,  voice: 'kestral',   request: 'Floor 412',
          text: 'Operator. There is a young woman at the front desk who looks the way I used to look.',
          leakWords: [4, 7, 9, 14, 16] },
        { at: 64,  voice: 'pryce',     request: 'Floor 1102',
          text: 'Pryce. Please do not check on me in the morning. The mirror is finally agreeing with me.',
          leakWords: [3, 8, 12, 14] },
        { at: 76,  voice: 'child312',  request: 'Front Desk',
          text: 'Mama? I remember the seventies now. I am still nine. Both can be true.',
          leakWords: [0, 4, 8, 11] },
        { at: 88,  voice: 'ashworth',  request: 'Conference Suite',
          text: 'Front desk. Seven of us in the conference suite are voting to be the last Ashworth. Two abstain.',
          leakWords: [3, 5, 12, 14, 15] },
        { at: 100, voice: 'bellhop',   request: 'Front Desk',
          text: '...',
          bellhopDead: true, leakWords: [] },
        { at: 110, voice: 'kestral',   request: 'Maintenance',
          text: 'Operator, dear. I have figured out what is happening to me. The hotel will reset me by morning. Goodbye.',
          leakWords: [3, 6, 11, 14, 16] },
        { at: 124, voice: 'pryce',     request: 'Front Desk',
          text: 'Pryce. There is a door behind your desk you have not opened in thirty years. The plate says SUPPLY. Open it on Night Five.',
          leakWords: [3, 7, 11, 17, 19, 21, 23] },
        { at: 138, voice: 'houseman',  request: 'Front Desk',
          text: 'Inventory addendum. One operator. One office. One door marked SUPPLY. One year not yet on the calendar.',
          leakWords: [0, 3, 5, 7, 10, 14] },
        // 3:14 AM — architect window AND the Replacement call. They overlap.
        { at: 148, voice: 'architect', request: 'Floor 3',
          text: 'Floor three. Bring the new operator down. I will sit with her.',
          architect: true, leakWords: [0, 1, 5, 9] },
        { at: 152, voice: 'replacement', request: 'Front Desk',
          text: 'Hello, hello — sorry, this is the new operator. I think I\'m supposed to start tonight on Floor Zero. Could you ring me through to the front desk so I know which line is mine.',
          critical: true, flag: 'replacement_call_seen',
          leakWords: [4, 8, 11, 14, 16, 22, 25] },
        { at: 178, voice: 'kestral',   request: null,
          text: 'There. Tomorrow I will be ten years old and I will not remember the faucet.', onDeadLine: true,
          leakWords: [2, 4, 5, 13] },
        { at: 190, voice: 'pryce',     request: 'Floor 1102',
          text: 'Pryce. The mirror is the room now. I am the reflection. Send no one.',
          leakWords: [3, 6, 8, 12] },
        { at: 204, voice: 'child312',  request: null,
          text: 'Goodnight, Mama. Tomorrow I will be eight.', onDeadLine: true,
          leakWords: [0, 5, 7] }
      ],
      deadlineNote: 'Sunrise. The hotel will not produce one.'
    }
  ];

  /* Night 5 — operator-office walkthrough. The same top-down framing as the
     prior plan's house walkthrough, but the rooms are now sub-rooms of the
     operator's own office (desk corner, mop closet/SUPPLY, painted-over
     window, sagging wallpaper, kitchenette under the floorboards where Mrs.
     Kestral's feet are visible standing on the ceiling). The bellhop stands
     in the hall doorway, breathing. The Replacement may or may not be sitting
     at the desk depending on what the player did on Night 4. */
  SB.NIGHT5 = {
    id: 5,
    ambientPitch: 0.70,
    intro: 'NIGHT FIVE\n\nYou stood up from the board for the first time in thirty years.\nThe office is small. Smaller than you remembered.',
    rooms: [
      {
        name: 'Wallpaper',
        description: 'The seam by the baseboard sags. Something dark behind it.',
        figure: 'A panel',
        voice: 'houseman',
        lines: [
          'Behind the wallpaper a guest has written something in dried red.',
          'It says: the stairs go down forever.',
          'Underneath, in a different hand: I tried the stairs.',
          'The wall is breathing. Every wall in the building is breathing.',
          'The houseman is reading inventory through this seam.'
        ]
      },
      {
        name: 'Window',
        description: 'A window painted black on the outside. The paint is flaking.',
        figure: 'The Sliver',
        voice: 'pryce',
        lines: [
          'The flake reveals a sliver of corridor that is not in this hotel.',
          'You can see a coat folded on the back of a chair.',
          'You can see a clock that has stopped at three-fourteen.',
          'You have seen this corridor in a dream you do not remember.',
          'The painter never came back to finish.'
        ]
      },
      {
        name: 'Floorboards',
        description: 'A gap in the floorboards. A pair of feet standing on the ceiling below.',
        figure: 'Mrs. Kestral, 412',
        voice: 'kestral',
        lines: [
          'Hello, dear. I have been on the ceiling for forty years.',
          'I have figured out the room is upside-down. I have decided not to mind.',
          'When you check out, will you write down how long it took me.',
          'Forty years for a faucet. Some things are slow.',
          'Tell the new operator the drip is fine now. The drip is me.'
        ]
      },
      {
        name: 'Bellhop',
        description: 'The bellhop in the doorway, perfectly still. Breathing.',
        figure: 'The Bellhop',
        voice: 'bellhop',
        lines: [
          'You have not exhaled in thirty years.',
          'You have only inhaled. The hotel has been exhaling for you.',
          'You are the third elevator phone. The shaft is your throat.',
          'If you check out, the breathing stops with you.',
          'If you stay, the breathing keeps the building up.'
        ]
      },
      {
        name: 'Desk',
        description: 'Your desk. The board. The brass door behind it marked SUPPLY.',
        figure: 'The Replacement',
        voice: 'replacement',
        lines: [
          'Oh — hello. I think I\'m the operator now.',
          'I logged in at three-fourteen. Have you been doing this long.',
          'The door behind us says SUPPLY. I haven\'t opened it.',
          'There is no name in the ledger for the previous shift.',
          'Are you going to sit down with me, or are you going through that door.'
        ]
      }
    ],
    /* Endings — keys are CHECK_OUT (default loop), UNDERSTUDY (you become
       the next operator's hallway), DEMOLITION (you let the architect
       rest). Selected by walkthrough.js using flags from N1–N4.

       The keys must be lower_snake_case to match the bake script's id
       generator (ending_<key>_<i>.wav). Order matters; the bake script
       walks them in declaration order. */
    endings: {
      check_out: [
        'The door opens onto a hallway you have not noticed in thirty years of looking.',
        'You walk to the end. There is a second door.',
        'Sunlight on the other side.',
        'You step out onto a sidewalk. The street is loud.',
        'A man walks past you with a small black device pressed to his ear, talking to no one.',
        'A child crosses the street saying, Mama, I will be home in an hour. The child\'s voice is your voice.',
        'You sit down on a bench. The bench is cold.',
        'The year above the bank across the street says two thousand twenty-six.',
        'You did not lose thirty years. You lost seventy.',
        'Your eyes are heavy. The sun is warm. You close them for one moment.',
        'A lamp is lit on line one.',
        'The clock above the board says nine-oh-two.',
        'The brass plate on the door behind your desk says SUPPLY. The closet is a closet.',
        'The board has four thousand two hundred lines now.',
        'A new lamp on the top row is lit. The brass plate above it says ROOFTOP.',
        'A polite young woman: Welcome to your first shift at Hotel Cascadia.',
        'You checked out.'
      ],
      understudy: [
        'The door opens onto a hallway you have not noticed in thirty years of looking.',
        'You walk to the end. The hallway has not ended.',
        'You walk further. The hallway has still not ended.',
        'You walk for what feels like a year.',
        'The lights dim. The wallpaper changes pattern.',
        'You become aware that you have not breathed in some time and that something else is breathing for you.',
        'At the end of the hallway is a switchboard you have never seen before.',
        'A lamp is lit. You sit down.',
        'You took the next shift.'
      ],
      demolition: [
        'The door opens onto the third floor.',
        'The mezzanine is empty. A coat is folded on the back of a chair. The coat is pinstriped.',
        'The pocket watch on the chair has stopped at three-fourteen.',
        'The drafting table is set with an unbuilt floor plan for the second floor.',
        'Behind the wallpaper the bones of a man are visible in the framing.',
        'You unwind the wallpaper. You take the bones out of the wall.',
        'You lay him on the drafting table. You fold his hands.',
        'You take the coat off the chair and lay it over him.',
        'The breathing in the shaft stops.',
        'The bellhop opens his eyes for the first time in ninety-two years and walks out of the building.',
        'The hotel folds in on itself. Floor four-thousand-two-hundred-and-one falls into floor four-thousand-two-hundred. It takes three minutes.',
        'You walk out the front door. The street is the street again. The sky is the sky again.',
        'Behind you there is a parking lot, with a chain-link fence around it.',
        'The year on the bank across the street says nineteen seventy-one.',
        'You have lost fifteen years. You will get the rest of your life back.',
        'You let him rest.'
      ]
    }
  };
})();
