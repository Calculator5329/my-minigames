/* 418 Linden — all call dialogue.
   Each entry: { at, voice, request, text, [critical], [flag], [onDeadLine],
                 [direction] (per-line acting note for the TTS prompt),
                 [overlap] (if true, allowed to ring while another line rings) }.
   `voice` keys map to TTS voice ids in generate-voices.js AND to
   SpeechSynthesis voice selection rules in voices.js. */
(function () {
  const NDP = window.NDP;
  const SB = (NDP.switchboard = NDP.switchboard || {});

  /* Voice profiles. Each has:
     - name: shown in the UI
     - ssPitch / ssRate: SpeechSynthesis fallback parameters
     - ttsHint: a short description used by the OpenRouter TTS prompt
     - direction: a default acting note appended to every TTS request
     - voice: which OpenAI voice to ask for (gpt-audio voices)
     - filter: { lo, hi } telephone bandpass; lower hi = more "tinny far away"
     - reverb: 0..1 mix of the wet reverb tail
     - hiss: 0..1 amount of background tape hiss layered behind the voice
     - rate: HTMLAudio playbackRate. <1 = slower & lower, >1 = faster & higher
     - detune: extra cents detune on the playback (creepy when paired)
     - whisperPitch: SS pitch when this voice is whispering on a dead line */
  SB.VOICES = {
    halberd: {
      name: 'Mrs. Halberd',
      ssPitch: 0.85, ssRate: 0.78,
      voice: 'shimmer',
      ttsHint: 'A frail elderly woman in 1923, soft and tired but unfailingly polite.',
      direction: 'Speak softly into a heavy bakelite receiver. Voice has a faint waver. Slow. Tender. As if comforting yourself. Pause briefly between phrases. Do not raise your voice. Trail off slightly at the end of sentences.',
      filter: { lo: 360, hi: 2600 }, reverb: 0.18, hiss: 0.10,
      rate: 0.97, detune: -10, whisperPitch: 0.7
    },
    child: {
      name: 'The Child',
      ssPitch: 1.55, ssRate: 0.65,
      voice: 'nova',
      ttsHint: 'A young girl, three or four years old, alone in a quiet room.',
      direction: 'Whisper. Half-asleep. Muffled, as if speaking with a thumb in your mouth or with the receiver pressed against a pillow. Stretch the vowels. Tiny in-breath between words.',
      filter: { lo: 220, hi: 2400 }, reverb: 0.55, hiss: 0.18,
      rate: 0.88, detune: +30, whisperPitch: 1.9
    },
    crane: {
      name: 'Mr. Crane',
      ssPitch: 1.0, ssRate: 1.0,
      voice: 'onyx',
      ttsHint: 'A cheerful middle-aged glass salesman, the kind who smiles into the phone.',
      direction: 'Warm and confident at first. Linger on consonants like a man who likes his own voice. Across nights the warmth thins; by Night 3 your sentences should feel like they are being read off a card. Do not act afraid even when the words are.',
      filter: { lo: 320, hi: 2900 }, reverb: 0.10, hiss: 0.08,
      rate: 0.99, detune: 0, whisperPitch: 0.9
    },
    doctor: {
      name: 'Dr. Whalen',
      ssPitch: 0.82, ssRate: 0.92,
      voice: 'echo',
      ttsHint: 'A dry, clinical man. Mid-fifties. Speaks like he is dictating to a stenographer.',
      direction: 'Flat affect. No emotion. Articulate every syllable as if it will be transcribed. Slight pause between phrases as if reviewing a chart. Never editorialise. Read death like weather.',
      filter: { lo: 300, hi: 2500 }, reverb: 0.12, hiss: 0.07,
      rate: 0.96, detune: -8, whisperPitch: 0.6
    },
    weatherman: {
      name: 'The Weatherman',
      ssPitch: 0.95, ssRate: 0.9,
      voice: 'fable',
      ttsHint: 'A 1920s radio weatherman reading a forecast that no one is listening to.',
      direction: 'Mid-Atlantic announcer cadence. Smooth. Practiced. The forecast is wrong but you do not know that. Slight tape warble. Long pauses where music would be.',
      filter: { lo: 280, hi: 2300 }, reverb: 0.30, hiss: 0.22,
      rate: 0.95, detune: -12, whisperPitch: 0.85
    },
    you: {
      name: 'The Operator',
      ssPitch: 1.0, ssRate: 0.95,
      voice: 'alloy',
      ttsHint: 'A neutral young woman with a slight echo, as though heard through your own headset.',
      direction: 'Speak as if from inside the listener\'s own head. Even, factual, faintly tired. Add a soft echo on every other word, like a leaking patch line. Never sound surprised by what you are saying.',
      filter: { lo: 380, hi: 3200 }, reverb: 0.45, hiss: 0.12,
      rate: 0.98, detune: -3, whisperPitch: 1.0
    },
    grocer: {
      name: 'Mr. Abbott',
      ssPitch: 1.0, ssRate: 1.05,
      voice: 'onyx',
      ttsHint: 'A busy shopkeeper between customers, half-shouting toward the receiver.',
      direction: 'Brisk and a little distracted. Background bustle in your delivery. Talk like you are wiping your hands on an apron.',
      filter: { lo: 400, hi: 3000 }, reverb: 0.06, hiss: 0.10,
      rate: 1.0, detune: 0, whisperPitch: 0.95
    },
    cabbie: {
      name: 'Keystone Dispatch',
      ssPitch: 0.9, ssRate: 1.1,
      voice: 'nova',
      ttsHint: 'A brusque woman dispatcher in a smoky office.',
      direction: 'Clipped. No-nonsense. Slight rasp. Treat every call as the seventh of the night. Do not warm up.',
      filter: { lo: 350, hi: 2700 }, reverb: 0.08, hiss: 0.14,
      rate: 1.01, detune: 0, whisperPitch: 0.8
    },
    ma: {
      name: 'Mrs. Kilgore',
      ssPitch: 0.95, ssRate: 1.0,
      voice: 'shimmer',
      ttsHint: 'A neighborhood gossip leaning toward the mouthpiece.',
      direction: 'Hushed but eager. Lean in. Small dry laugh between phrases. Sentences shaped like questions even when they are not.',
      filter: { lo: 340, hi: 2700 }, reverb: 0.10, hiss: 0.10,
      rate: 0.99, detune: 0, whisperPitch: 1.1
    },
    receptionist: {
      name: 'Miss Dole',
      ssPitch: 1.05, ssRate: 1.0,
      voice: 'alloy',
      ttsHint: 'A tired daytime receptionist at the end of a long shift.',
      direction: 'Read each line as if from an appointment book. Mild boredom. A swallow before the last word.',
      filter: { lo: 360, hi: 2800 }, reverb: 0.10, hiss: 0.09,
      rate: 1.0, detune: 0, whisperPitch: 1.0
    },
    operator2: {
      name: 'Sister Exchange',
      ssPitch: 0.95, ssRate: 1.0,
      voice: 'shimmer',
      ttsHint: 'Another night-shift operator from a neighbouring exchange, calm and a little curious.',
      direction: 'Polite, professional, a fellow tradeswoman. Slight echo on the line. Treat the listener as a colleague who is in trouble.',
      filter: { lo: 380, hi: 3000 }, reverb: 0.30, hiss: 0.14,
      rate: 0.98, detune: -5, whisperPitch: 1.0
    },
    stranger: {
      name: 'Wrong Number',
      ssPitch: 0.7, ssRate: 0.8,
      voice: 'echo',
      ttsHint: 'A very distant male voice on a degraded line, perhaps not in this decade.',
      direction: 'Sound like you are calling from underwater, or from inside a wooden box. Slow. Half a sentence at a time. Long gaps where the line drops out. Never sound aggressive — sound lost.',
      filter: { lo: 200, hi: 1800 }, reverb: 0.65, hiss: 0.30,
      rate: 0.9, detune: -25, whisperPitch: 0.5
    }
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

  /* All callable lines per night. Times are in seconds since night start. */
  SB.NIGHTS = [
    {
      id: 1,
      durationSec: 330,
      ambientPitch: 1.0,
      directory: 'n1',
      intro: 'NIGHT ONE\n\nYou are the night operator at the 418 Linden Exchange.\nLines light up. You answer them. You connect them.\n\nWhen a lamp glows: click it to pick up.\nHold [L] to lean into the receiver and hear what they want.\nDrag a cable from their INCOMING socket down to the OUTGOING socket\nthat matches the name in the directory on your right.\n\nDon\'t keep them waiting.',
      calls: [
        { at: 4,   voice: 'grocer',    request: 'Abbott Grocers',
          text: 'Abbott Grocers. Order for Mrs. Halberd? Got her tea in. Earl Grey.' },
        { at: 18,  voice: 'halberd',   request: '418 Linden',
          text: 'Operator, dear. Four-one-eight Linden, please. I\'m expecting my daughter home.' },
        { at: 34,  voice: 'cabbie',    request: 'Keystone Cab Co.',
          text: 'Keystone Dispatch. Cab to Union Station. Mind the fog on Linden Street.' },
        { at: 52,  voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass Company. Two cases of window panels ready for Linden Street pickup.' },
        { at: 70,  voice: 'ma',        request: 'Mrs. Kilgore (neighbor)',
          text: 'Kilgore residence. Have you heard from the Halberd girl? She was due home by eight.' },
        { at: 92,  voice: 'doctor',    request: 'Linden Coroner',
          text: 'Dr. Whalen. Connect me to the county coroner regarding the occupant of four-one-eight Linden.' },
        { at: 116, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. Four-one-eight Linden again. The line must be stuck. She should be home by now.' },
        { at: 140, voice: 'receptionist', request: 'Dr. Whalen\'s Office',
          text: 'Dr. Whalen\'s office. Cancel his appointments after six. He says he\'s working late.' },
        { at: 158, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Wanted to confirm — the cases are still on the dock. Driver hasn\'t come round.' },
        { at: 178, voice: 'weatherman', request: 'County Weather Desk',
          text: 'County Weather Desk. Fog rolling east from the river. Listeners near Linden Street should close their windows. Repeat. Close your windows.' },
        { at: 198, voice: 'grocer',    request: 'Abbott Grocers',
          text: 'Abbott\'s again. Ma\'am, will the Halberd girl be by? She\'s late for the order.' },
        { at: 218, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass once more. Did those cases arrive at four-one-eight? Operator, can you confirm?' },
        { at: 238, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. I\'m sorry to keep troubling you. The supper\'s gone cold. Four-one-eight Linden, one more try.' },
        { at: 262, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner again. Revising cause of death. Smoke inhalation.' },
        { at: 282, voice: 'cabbie',    request: 'Keystone Cab Co.',
          text: 'Dispatch. Cancelling that Union Station fare. Driver says he can\'t see ten feet.' },
        { at: 304, voice: 'weatherman', request: 'County Weather Desk',
          text: 'Wind shifting. Expect ash on Linden Street by morning.' }
      ],
      deadlineNote: 'Sunrise.'
    },

    {
      id: 2,
      durationSec: 360,
      ambientPitch: 0.94,
      directory: 'n2',
      intro: 'NIGHT TWO\n\nSomeone removed Mrs. Kilgore\'s number from the directory. Mrs. Halberd is still calling.',
      calls: [
        { at: 3,   voice: 'halberd',   request: '418 Linden',
          text: 'Operator. Did she reach you? She said she\'d call if the fog got bad.' },
        { at: 22,  voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Delivery confirmation. We\'re still holding last Tuesday\'s cases.' },
        { at: 44,  voice: 'you',       request: '418 Linden',
          text: 'Operator. Four-one-eight Linden. Please. Four-one-eight Linden.',
          flag: 'you_call_seen' },
        { at: 64,  voice: 'doctor',    request: 'Linden Coroner',
          text: 'Whalen. Coroner, please. Revising again. Cause: exposure.' },
        { at: 84,  voice: 'halberd',   request: '418 Linden',
          text: 'Operator. I thought I heard her on the line a moment ago. Was that her?' },
        { at: 102, voice: 'weatherman', request: 'County Weather Desk',
          text: 'Fog holding steady near the river. An address on Linden Street has been asking about its own weather.' },
        { at: 126, voice: 'grocer',    request: 'Abbott Grocers',
          text: 'Abbott Grocers. Cancel the Halberd order. Nobody home to receive it.' },
        { at: 148, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Operator. Do you know what color glass burns green?' },
        { at: 170, voice: 'child',     request: null,
          text: 'Mama?', onDeadLine: true },
        { at: 192, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. Please. Four-one-eight Linden. I can wait all night if I have to.' },
        { at: 214, voice: 'receptionist', request: 'Dr. Whalen\'s Office',
          text: 'Whalen\'s office. The doctor never came in this morning. We\'re trying to reach him.' },
        { at: 234, voice: 'cabbie',    request: 'Keystone Cab Co.',
          text: 'Dispatch. We had a fare to four-one-eight Linden last night. Driver says the porch light was already out.' },
        { at: 256, voice: 'you',       request: '418 Linden',
          text: 'Operator. It\'s me. I\'m already there. Please connect me.' },
        { at: 278, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner. Cause of death, fourth revision. The occupant is not dead yet.' },
        { at: 304, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Operator, my driver phoned. He says the windows are already in.' },
        { at: 328, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. One more, dear. Just one more.' }
      ],
      deadlineNote: 'Sunrise.'
    },

    {
      id: 3,
      durationSec: 390,
      ambientPitch: 0.88,
      directory: 'n3',
      intro: 'NIGHT THREE\n\nThe directory now lists rooms inside 418 Linden. Two of Mr. Crane\'s earlier calls never ended. You can hear them faintly behind every line.',
      calls: [
        { at: 2,   voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane here. Still on hold from Tuesday. Hello? Operator?' },
        { at: 20,  voice: 'halberd',   request: '418 Linden',
          text: 'Operator. The trellis outside is casting two shadows. Is that normal? Please. Four-one-eight Linden.' },
        { at: 44,  voice: 'you',       request: '418 Linden (nursery)',
          text: 'Operator. Four-one-eight Linden, the nursery. She\'s supposed to be there.' },
        { at: 66,  voice: 'child',     request: null,
          text: 'Is Mama?', onDeadLine: true },
        { at: 88,  voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner. Cause of death revised again. Please thank the operator for her patience.' },
        { at: 112, voice: 'weatherman', request: 'County Weather Desk',
          text: 'Forecast for tomorrow night. Occasional fire. Listeners with daughters out after dark should lock the back door.' },
        { at: 138, voice: 'halberd',   request: '418 Linden (kitchen)',
          text: 'Operator. The kitchen line this time. The kettle\'s been whistling for forty minutes. I can\'t get up to turn it off.' },
        { at: 162, voice: 'stranger',  request: '418 Linden',
          text: 'Hello. Hello. Is this still the exchange. I\'m calling from a pay phone that doesn\'t exist.' },
        { at: 186, voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Operator, my delivery driver called. He says the house is already on fire and the windows are already in.' },
        { at: 210, voice: 'you',       request: '418 Linden',
          text: 'Operator. Thank you for all your help so far.' },
        { at: 232, voice: 'child',     request: null,
          text: 'Mama, hurry.', onDeadLine: true },
        { at: 256, voice: 'operator2', request: '418 Linden',
          text: 'Sister. This is Maple Avenue Exchange. We\'re getting calls for your address from people who say they\'ve been on hold for years. Are you all right.' },
        { at: 282, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. Did my daughter ever come on the line. Or have I been calling empty rooms.' },
        { at: 308, voice: 'cabbie',    request: 'Keystone Cab Co.',
          text: 'Dispatch. Driver out at four-one-eight Linden says the porch light came back on without anyone touching it.' },
        { at: 334, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Final revision. The cause of death is the operator.' },
        { at: 360, voice: 'child',     request: null,
          text: 'Plug me in.', onDeadLine: true }
      ],
      deadlineNote: 'Sunrise.'
    },

    {
      id: 4,
      durationSec: 390,
      ambientPitch: 0.80,
      directory: 'n4',
      intro: 'NIGHT FOUR\n\nLines have begun to connect themselves. Your only choice tonight is whether to connect the call that wants to reach 418 Linden. The caller\'s voice is yours.',
      calls: [
        { at: 4,   voice: 'halberd',   request: '418 Linden (kitchen)',
          text: 'Operator. I\'ve set out two cups of tea. Would you come sit down.' },
        { at: 30,  voice: 'crane',     request: 'Crane Glass Co.',
          text: 'Crane Glass. Every window in the house. Operator, I\'m so sorry.' },
        { at: 56,  voice: 'weatherman', request: 'County Weather Desk',
          text: 'Tomorrow\'s forecast has been cancelled.' },
        { at: 80,  voice: 'child',     request: null,
          text: 'Mama, I\'m home.', onDeadLine: true },
        { at: 104, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. She called. Didn\'t she. Didn\'t you connect her.' },
        { at: 130, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner. Strike all prior revisions. The occupant is still waiting to be reached.' },
        { at: 156, voice: 'operator2', request: '418 Linden',
          text: 'Sister. We\'re going to lose contact in a moment. Whatever you do tonight — listen to her first.' },
        { at: 184, voice: 'stranger',  request: '418 Linden',
          text: 'Operator. The clock at the corner of Linden hasn\'t moved since you sat down.' },
        { at: 212, voice: 'you',       request: '418 Linden',
          text: 'Operator. It\'s me. I got caught in the fog. I\'m ready to come home. Please connect me.',
          critical: true, flag: 'final_self_call' },
        { at: 250, voice: 'halberd',   request: '418 Linden (nursery)',
          text: 'Operator, if you can hear me — the nursery line. Please.' },
        { at: 278, voice: 'crane',     request: '418 Linden (parlor)',
          text: 'Crane Glass. The parlor glass is still cracked. Operator, it never got replaced.' },
        { at: 304, voice: 'child',     request: null,
          text: 'Sit down with us.', onDeadLine: true },
        { at: 330, voice: 'doctor',    request: 'Linden Coroner',
          text: 'Coroner. The blank certificate is on the desk. Whoever is reading this — fill in the name.' },
        { at: 358, voice: 'halberd',   request: '418 Linden',
          text: 'Operator. One last time.' }
      ],
      deadlineNote: 'Sunrise.'
    }
  ];

  /* Night 5 — walkthrough scene. More lines per figure now. */
  SB.NIGHT5 = {
    id: 5,
    ambientPitch: 0.70,
    intro: 'NIGHT FIVE\n\nYou stepped away from the board.\nYour heels clicked on wood.',
    rooms: [
      {
        name: 'Parlor',
        description: 'Glass cases stacked to the ceiling. One of them is cracked.',
        figure: 'Mr. Crane',
        voice: 'crane',
        lines: [
          'Tell her the cases are here.',
          'Every pane. Every window. The house is ready.',
          'Operator — you were always the best listener.',
          'I never put down the phone, you know. None of us did.',
          'The crack in the case is shaped like the receiver. Have a look.'
        ]
      },
      {
        name: 'Study',
        description: 'A desk. Piles of death certificates, each crossed out.',
        figure: 'Dr. Whalen',
        voice: 'doctor',
        lines: [
          'I kept trying to write it down correctly.',
          'She wasn\'t dead when she called you. That\'s the thing about it.',
          'The last certificate is blank. It\'s yours to fill in.',
          'I revised the cause of death once for every night you didn\'t answer.',
          'There is a name printed on the inside of your headset. Have you ever looked.'
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
          'The fog is you walking through the fog.',
          'My broadcasts only ever went out to one address.',
          'When the radio stops, please, do not turn it on again.'
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
          'Mama, it\'s okay. I waited.',
          'I picked up every time it rang. Nobody was there.',
          'The toy phone has the same number as your switchboard.'
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
          'You\'ve been at the board so long, my hands forgot how to hold the cup.',
          'She rang in once tonight. Just once. Will you connect her, or will you sit.',
          'Would you like to pick up the line — or would you like to sit down.'
        ]
      }
    ],
    endings: {
      route: [
        'The line clicks open.',
        'A young woman: "Mama, I\'m coming home. I got caught in the fog."',
        'Mrs. Halberd: "She\'s home. She\'s home. She\'s home."',
        'The kettle whistles. The house goes quiet.',
        'Sunrise, finally, on Linden Street.'
      ],
      deny: [
        'The jack will not fit.',
        'Mrs. Halberd: "I\'ll wait up for you, dear. Every night, I\'ll wait up."',
        'The tea is cold.',
        'Dawn does not come. The board lights up again.',
        'You sit down. You have always sat down.'
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
