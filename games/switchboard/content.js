/* 418 Linden — all call dialogue.
   Each entry: { id, voice, text, pitch, rate, followup? }.
   `voice` keys map to TTS voice ids in generate-voices.js AND to
   SpeechSynthesis voice selection rules in voices.js. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  /* Voice profiles. Names kept consistent across the whole script so the
     TTS script can batch per-voice without re-uploading reference audio. */
  SB.VOICES = {
    halberd:    { name: 'Mrs. Halberd',    ssPitch: 0.9, ssRate: 0.85, ttsHint: 'warm elderly woman, slow' },
    child:      { name: 'The Child',       ssPitch: 1.4, ssRate: 0.75, ttsHint: 'young girl, whispering' },
    crane:      { name: 'Mr. Crane',       ssPitch: 1.0, ssRate: 1.0,  ttsHint: 'cheerful middle-aged salesman' },
    doctor:     { name: 'The Doctor',      ssPitch: 0.85,ssRate: 0.95, ttsHint: 'clinical man, dry' },
    weatherman: { name: 'The Weatherman',  ssPitch: 0.95,ssRate: 0.9,  ttsHint: '1920s radio announcer' },
    you:        { name: 'The Operator',    ssPitch: 1.0, ssRate: 1.0,  ttsHint: 'neutral narrator, slightly echoed' },
    grocer:     { name: 'Mr. Abbott',      ssPitch: 1.0, ssRate: 1.05, ttsHint: 'busy shopkeeper' },
    cabbie:     { name: 'Dispatcher',      ssPitch: 0.9, ssRate: 1.1,  ttsHint: 'brusque woman' },
    ma:         { name: 'Mrs. Kilgore',    ssPitch: 0.95,ssRate: 1.0,  ttsHint: 'neighborhood gossip' },
    receptionist:{ name: 'Miss Dole',      ssPitch: 1.05,ssRate: 1.0,  ttsHint: 'tired receptionist' }
  };

  /* Directory entries. `id` is the directory key; `line` is the outgoing
     socket 1-10 the player should plug into. Some entries are added/removed
     across nights. */
  SB.DIRECTORIES = {
    n1: {
      '418 Linden': 7,
      'Dr. Whalen\'s Office': 2,
      'Abbott Grocers': 4,
      'Keystone Cab Co.': 5,
      'Linden Coroner': 2,
      'Mrs. Kilgore (neighbor)': 3,
      'Union Telegraph': 8,
      'County Weather Desk': 9,
      'Crane Glass Co.': 6
    },
    n2: {
      '418 Linden': 7,
      'Dr. Whalen\'s Office': 2,
      'Abbott Grocers': 4,
      'Keystone Cab Co.': 5,
      'Linden Coroner': 2,
      'Union Telegraph': 8,
      'County Weather Desk': 9,
      'Crane Glass Co.': 6
    },
    n3: {
      '418 Linden': 7,
      'Dr. Whalen\'s Office': 2,
      'Linden Coroner': 2,
      'Union Telegraph': 8,
      'County Weather Desk': 9,
      'Crane Glass Co.': 6,
      '418 Linden (kitchen)': 10,
      '418 Linden (nursery)': 1
    },
    n4: {
      '418 Linden': 7,
      'Linden Coroner': 2,
      'Crane Glass Co.': 6,
      'County Weather Desk': 9,
      '418 Linden (kitchen)': 10,
      '418 Linden (nursery)': 1,
      '418 Linden (parlor)': 3,
      '418 Linden (study)': 8
    }
  };

  /* All callable lines per night. Scheduled over the ~6-minute night. */
  SB.NIGHTS = [
    {
      id: 1,
      durationSec: 300,           // 5 minutes for Night 1
      ambientPitch: 1.0,
      directory: 'n1',
      intro: 'NIGHT ONE\n\nRoute the calls. Don\'t keep them waiting.',
      calls: [
        { at: 4,   voice: 'grocer',    request: 'Abbott Grocers',
          text: 'Abbott Grocers — order for Mrs. Halberd? Got her tea in.' },
        { at: 18,  voice: 'halberd',   request: '418 Linden',
          text: 'Operator, dear. 418 Linden, please — I\'m expecting my daughter home.' },
        { at: 34,  voice: 'cabbie',    request: 'Keystone Cab Co.',
          text: 'Dispatch. Cab for Union Station. Mind the fog.' },
        { at: 52,  voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Two cases of window panels ready for Linden Street.' },
        { at: 70,  voice: 'ma',        request: 'Mrs. Kilgore (neighbor)',
          text: 'Kilgore residence. Have you heard from the Halberd girl? She was due home by eight.' },
        { at: 92,  voice: 'doctor',    request: 'Linden Coroner',
          text: 'Dr. Whalen here. Need the county coroner — regarding the occupant of 418 Linden.' },
        { at: 116, voice: 'halberd',   request: '418 Linden',
          text: 'Operator — 418 Linden again. The line must be stuck. She should be home by now.' },
        { at: 140, voice: 'receptionist', request: 'Dr. Whalen\'s Office',
          text: 'Dr. Whalen\'s office. Cancel his appointments after six — he says he\'s working late.' },
        { at: 166, voice: 'weatherman', request: 'County Weather Desk',
          text: 'County Weather Desk. Fog rolling east from the river. Listeners near Linden Street should close their windows. Repeat — close your windows.' },
        { at: 192, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass again — did those cases arrive at 418? Operator, can you confirm?' },
        { at: 220, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. I\'m sorry to keep troubling you. The supper\'s cold. 418 Linden, one more try.' },
        { at: 250, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner again. Revising cause of death. Smoke inhalation.' },
        { at: 278, voice: 'weatherman', request: 'County Weather Desk',
          text: 'Wind shifting. Expect ash on Linden Street by morning.' }
      ],
      deadlineNote: 'Sunrise.'
    },

    {
      id: 2,
      durationSec: 330,
      ambientPitch: 0.95,
      directory: 'n2',
      intro: 'NIGHT TWO\n\nSomeone removed Mrs. Kilgore\'s number from the directory. Mrs. Halberd is still calling.',
      calls: [
        { at: 3,   voice: 'halberd',   request: '418 Linden',
          text: 'Operator — did she reach you? She said she\'d call if the fog got bad.' },
        { at: 22,  voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Delivery confirmation — we\'re still holding last Tuesday\'s cases.' },
        { at: 44,  voice: 'you',       request: '418 Linden',
          text: 'Operator. 418 Linden. Please — 418 Linden.' ,
          flag: 'you_call_seen' },
        { at: 68,  voice: 'doctor',    request: 'Linden Coroner',
          text: 'Whalen. Coroner, please. Revising again. Cause: exposure.' },
        { at: 94,  voice: 'halberd',   request: '418 Linden',
          text: 'Operator. I thought I heard her on the line a moment ago. Was that her?' },
        { at: 122, voice: 'weatherman', request: 'County Weather Desk',
          text: 'Fog holding steady near the river. An address on Linden Street has been asking about its own weather.' },
        { at: 150, voice: 'grocer',    request: 'Abbott Grocers',
          text: 'Abbott Grocers. Cancel the Halberd order. Nobody home to receive it.' },
        { at: 180, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Operator, do you know what color glass burns green?' },
        { at: 210, voice: 'child',     request: null,     // dead channel whisper
          text: 'Mama?', onDeadLine: true },
        { at: 240, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. Please. 418 Linden. I can wait all night if I have to.' },
        { at: 272, voice: 'you',       request: '418 Linden',
          text: 'Operator, it\'s me. I\'m already there. Please connect me.' },
        { at: 304, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner. Cause of death, fourth revision: the occupant is not dead yet.' }
      ],
      deadlineNote: 'Sunrise.'
    },

    {
      id: 3,
      durationSec: 360,
      ambientPitch: 0.88,
      directory: 'n3',
      intro: 'NIGHT THREE\n\nThe directory now lists rooms inside 418 Linden. Two of Mr. Crane\'s earlier calls never ended. You can hear them faintly behind every line.',
      calls: [
        { at: 2,   voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane here. Still on hold from Tuesday. Hello? Operator?' },
        { at: 20,  voice: 'halberd',   request: '418 Linden',
          text: 'Operator. The trellis outside is casting two shadows. Is that normal? Please — 418 Linden.' },
        { at: 46,  voice: 'you',       request: '418 Linden (nursery)',
          text: 'Operator. 418 Linden, the nursery. She\'s supposed to be there.' },
        { at: 72,  voice: 'child',     request: null,
          text: 'Is Mama?', onDeadLine: true },
        { at: 98,  voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner. Cause of death revised again. Please thank the operator for her patience.' },
        { at: 128, voice: 'weatherman', request: 'County Weather Desk',
          text: 'Forecast for tomorrow night: occasional fire. Listeners with daughters out after dark should lock the back door.' },
        { at: 160, voice: 'halberd',   request: '418 Linden (kitchen)',
          text: 'Operator, the kitchen line this time. The kettle\'s been whistling for forty minutes. I can\'t get up to turn it off.' },
        { at: 194, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Operator, my delivery driver called. He says the house is already on fire and the windows are already in.' },
        { at: 224, voice: 'you',       request: '418 Linden',
          text: 'Operator, thank you for all your help so far.' },
        { at: 258, voice: 'child',     request: null,
          text: 'Mama, hurry.', onDeadLine: true },
        { at: 292, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. Did my daughter ever come on the line? Or have I been calling empty rooms?' },
        { at: 328, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Final revision. The cause of death is the operator.' }
      ],
      deadlineNote: 'Sunrise.'
    },

    {
      id: 4,
      durationSec: 360,
      ambientPitch: 0.80,
      directory: 'n4',
      intro: 'NIGHT FOUR\n\nLines have begun to connect themselves. Your only choice tonight is whether to connect the call that wants to reach 418 Linden. The caller\'s voice is yours.',
      calls: [
        { at: 4,   voice: 'halberd',   request: '418 Linden (kitchen)',
          text: 'Operator. I\'ve set out two cups of tea. Would you come sit down.' },
        { at: 32,  voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Every window in the house. Operator — I\'m so sorry.' },
        { at: 60,  voice: 'weatherman', request: 'County Weather Desk',
          text: 'Tomorrow\'s forecast has been cancelled.' },
        { at: 92,  voice: 'child',     request: null,
          text: 'Mama, I\'m home.', onDeadLine: true },
        { at: 124, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. She called. Didn\'t she. Didn\'t you connect her.' },
        { at: 156, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner here. Please strike all prior revisions. The occupant is still waiting to be reached.' },
        { at: 192, voice: 'you',       request: '418 Linden',
          text: 'Operator. It\'s me. I got caught in the fog. I\'m ready to come home. Please connect me.',
          critical: true, flag: 'final_self_call' },
        { at: 240, voice: 'halberd',   request: '418 Linden (nursery)',
          text: 'Operator, if you can hear me — the nursery line. Please.' },
        { at: 284, voice: 'crane',     request: '418 Linden (parlor)',
          text: 'Crane Glass. The parlor glass is still cracked. Operator, it never got replaced.' },
        { at: 324, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. One last time.' }
      ],
      deadlineNote: 'Sunrise.'
    }
  ];

  /* Night 5 — walkthrough scene. Room-by-room lines; the player can approach
     each figure and "lean in" to hear more. */
  SB.NIGHT5 = {
    id: 5,
    ambientPitch: 0.70,
    intro: 'NIGHT FIVE\n\nYou stepped away from the board. Your heels clicked on wood.',
    rooms: [
      {
        name: 'Parlor',
        description: 'Glass cases stacked to the ceiling. One of them is cracked.',
        figure: 'Mr. Crane',
        voice: 'crane',
        lines: [
          'Tell her the cases are here.',
          'Every pane. Every window. The house is ready.',
          'Operator — you were always the best listener.'
        ]
      },
      {
        name: 'Study',
        description: 'A desk. Piles of death certificates, each crossed out.',
        figure: 'The Doctor',
        voice: 'doctor',
        lines: [
          'I kept trying to write it down correctly.',
          'She wasn\'t dead when she called you. That\'s the thing about it.',
          'The last certificate is blank. It\'s yours to fill in.'
        ]
      },
      {
        name: 'Hall',
        description: 'A radio that nobody is listening to.',
        figure: 'The Weatherman',
        voice: 'weatherman',
        lines: [
          'Forecast for tonight: you.',
          'Ash on Linden Street. It\'s been ash on Linden Street for some time.',
          'The fog is you walking through the fog.'
        ]
      },
      {
        name: 'Nursery',
        description: 'A small figure facing the wall. A toy phone on the floor.',
        figure: 'The Child',
        voice: 'child',
        lines: [
          'Are you Mama?',
          'You sound like the phone.',
          'Mama, it\'s okay. I waited.'
        ]
      },
      {
        name: 'Kitchen',
        description: 'Two cups of tea. One switchboard. One line lit.',
        figure: 'Mrs. Halberd',
        voice: 'halberd',
        lines: [
          'There you are.',
          'Come in, dear. The tea is still warm.',
          'Would you like to pick up the line, or would you like to sit down.'
        ]
      }
    ],
    endings: {
      route: [
        'The line clicks open.',
        'A young woman: "Mama, I\'m coming home. I got caught in the fog."',
        'Mrs. Halberd: "She\'s home. She\'s home. She\'s home."',
        'The kettle whistles. The house goes quiet.'
      ],
      deny: [
        'The jack will not fit.',
        'Mrs. Halberd: "I\'ll wait up for you, dear. Every night, I\'ll wait up."',
        'The tea is cold.',
        'Dawn does not come. The board lights up again.'
      ],
      hidden: [
        'A sixth jack appears on the kitchen board.',
        'The house empties around you.',
        'You are in a switchboard room. The lines are dark.',
        'Outside: fog. You can leave, or you can stay.',
        'You have always been the operator.'
      ]
    }
  };
})();
