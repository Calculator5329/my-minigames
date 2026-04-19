// Quick probe: does gpt-audio-mini emit a transcript stream?
const KEY = process.env.OPENROUTER_API_KEY;
const body = JSON.stringify({
  model: 'openai/gpt-audio-mini',
  modalities: ['text', 'audio'],
  stream: true,
  audio: { voice: 'shimmer', format: 'pcm16' },
  messages: [
    { role: 'system', content: [
      'You are an audiobook performer recording lines for a horror radio drama set at a 1923 telephone exchange.',
      'For each take, the user gives you the SCRIPT in <script> tags and the CHARACTER in <character> tags.',
      'Your job is to perform the script aloud as the character, exactly as written, then stop.',
      '',
      'Hard rules:',
      '- Read every word inside <script> in order, exactly as written.',
      '- Do NOT add anything outside the script (no greetings, no continuations, no replies, no ad-libs, no "[pause]", no stage directions).',
      '- Do NOT respond to the script as if it were addressed to you.',
      '- Stop the moment you finish the last word of the script.'
    ].join('\n') },
    { role: 'user', content:
      '<character>A breathy man whispering urgently into the phone, terrified, late at night.</character>\n' +
      '<script>Don\'t connect this. Whoever calls for 418, it isn\'t a person. Cut the line.</script>'
    }
  ]
});

(async () => {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body
  });
  console.log('status', r.status);
  if (!r.ok) { console.log(await r.text()); return; }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', transcript = '', text = '', audioBytes = 0, errors = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        if (j.error) errors.push(JSON.stringify(j.error));
        const delta = j.choices?.[0]?.delta;
        const a = delta?.audio;
        if (a?.data) audioBytes += Buffer.from(a.data, 'base64').length;
        if (a?.transcript) transcript += a.transcript;
        if (delta?.content) text += delta.content;
      } catch (e) {}
    }
  }
  console.log('audio bytes:', audioBytes);
  console.log('transcript :', JSON.stringify(transcript));
  console.log('text       :', JSON.stringify(text));
  if (errors.length) console.log('errors:', errors);
})();
