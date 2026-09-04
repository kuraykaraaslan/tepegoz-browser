/**
 * Narrates a recording: ElevenLabs text-to-speech, real caption timing, and a
 * muxed track — without re-encoding the video.
 *
 * ── Why the captions are not guessed ────────────────────────────────────────
 * The TTS call is `/with-timestamps`, which returns the audio AND a per-character
 * alignment. Cue times therefore come from the synthesiser's own measurement of
 * the speech it produced, not from a words-per-minute estimate. Hand-timed
 * captions drift within a sentence and the drift is invisible to whoever wrote
 * them, because they already know what the line says.
 *
 * ── Why each line is placed, not concatenated ───────────────────────────────
 * A narration that runs continuously has to be written to fill time. Placing
 * each line at an explicit `at` second lets it stay silent while something on
 * screen is worth watching, and lets a line land ON the event it describes. The
 * bed is generated silence of the video's own duration, so the audio track can
 * never be shorter or longer than the picture.
 *
 * ── The honesty constraint ─────────────────────────────────────────────────
 * A narration script may only state what is visible in the frames it plays over.
 * It is the easiest place on the whole site to smuggle in a claim, because
 * nobody diffs a voice-over. `--check` prints every line against its timestamp
 * so the pairing can be read before anything is published.
 *
 *   node scripts/narrate.mjs <script.json> [--lang en|tr] [--video path] [--out dir] [--check]
 *
 * Script file:
 *   {
 *     "lang": "en",
 *     "voiceId": "onwK4e9ZLuTAKqWW03F9",
 *     "lines": [ { "at": 1.5, "text": "…" }, { "at": 12.0, "text": "…" } ]
 *   }
 *
 * Needs ELEVENLABS_API_KEY in .env.eval.local (gitignored) and ffmpeg on PATH.
 * Writes <out>/narration.<lang>.opus, <out>/captions.<lang>.vtt,
 * <out>/agent-run.narrated.<lang>.webm and an .mp4 fallback.
 */
import { join, basename } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const scriptPath = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
if (!scriptPath) {
  console.error('usage: node scripts/narrate.mjs <script.json> [--lang en|tr] [--video f.webm] [--out dir] [--check]');
  process.exit(1);
}

const OUT = flag('out', '.recording');
const VIDEO = flag('video', join(OUT, 'agent-run.webm'));
const CHECK_ONLY = has('check');
mkdirSync(OUT, { recursive: true });

const spec = JSON.parse(readFileSync(scriptPath, 'utf8'));
const LANG = flag('lang', spec.lang ?? 'en');

/** Narrators, chosen deliberately rather than by whatever the account lists first. */
const VOICES = {
  // Daniel — Steady Broadcaster (british, formal, informative). Understated; the
  // product's argument is restraint, and an excited read would contradict it.
  en: 'onwK4e9ZLuTAKqWW03F9',
  // Yigit Atilla — Steady and Confident (Istanbul accent). Turkish is a
  // first-class language here, not a subtitle track.
  tr: 'oOSiVtAFJQH0fw31A1we',
};
const VOICE = spec.voiceId ?? VOICES[LANG];
if (!VOICE) {
  console.error(`no voice configured for lang "${LANG}"`);
  process.exit(1);
}

const MODEL_ID = spec.modelId ?? 'eleven_multilingual_v2';

function apiKey() {
  const text = readFileSync('.env.eval.local', 'utf8');
  const m = text.match(/^ELEVENLABS_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY not found in .env.eval.local');
  return m[1];
}

function ff(cmdArgs, label) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...cmdArgs], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`ffmpeg failed (${label}):`, (r.stderr || '').trim().slice(0, 600));
    process.exit(1);
  }
}

function videoDurationSeconds(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' },
  );
  const d = Number((r.stdout || '').trim());
  return Number.isFinite(d) && d > 0 ? d : 0;
}

const vtt = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
};

/**
 * Split one line's character alignment into readable cues.
 *
 * Breaks at a sentence end when the cue is already long enough, otherwise at the
 * last space before the limit — never mid-word, which is the caption defect that
 * makes people turn captions off.
 */
function cuesFor(text, starts, ends, offset, maxChars = 64) {
  const cues = [];
  let from = 0;
  while (from < text.length) {
    let to = Math.min(from + maxChars, text.length);
    if (to < text.length) {
      const window = text.slice(from, to);
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
      const space = window.lastIndexOf(' ');
      if (sentence > maxChars * 0.5) to = from + sentence + 1;
      else if (space > 0) to = from + space;
    }
    const body = text.slice(from, to).trim();
    if (body) {
      cues.push({
        start: offset + (starts[from] ?? 0),
        end: offset + (ends[Math.max(from, to - 1)] ?? 0),
        text: body,
      });
    }
    from = to;
    while (text[from] === ' ') from += 1;
  }
  return cues;
}

const duration = existsSync(VIDEO) ? videoDurationSeconds(VIDEO) : 0;
console.log(`script  : ${basename(scriptPath)}  (${spec.lines.length} lines, lang ${LANG}, voice ${VOICE})`);
console.log(`video   : ${existsSync(VIDEO) ? `${VIDEO} — ${duration.toFixed(1)}s` : `${VIDEO} — MISSING`}`);

// Read the pairing before anything is published: every line against the second
// it speaks over, and any line that runs past the end of the picture.
let cursor = -1;
let bad = 0;
for (const [i, l] of spec.lines.entries()) {
  const overlaps = l.at <= cursor;
  const past = duration > 0 && l.at >= duration;
  if (overlaps || past) bad += 1;
  console.log(
    `  ${String(i).padStart(2)}  @${String(l.at).padStart(6)}s  ${overlaps ? 'OVERLAPS-PREV ' : ''}${past ? 'PAST-END ' : ''}${l.text}`,
  );
  cursor = l.at;
}
if (CHECK_ONLY) {
  console.log(bad ? `\n${bad} line(s) need attention.` : '\nAll lines are ordered and inside the picture.');
  process.exit(bad ? 1 : 0);
}
if (!existsSync(VIDEO)) {
  console.error('\nNo video to narrate. Record one first: node scripts/record-agent.mjs');
  process.exit(1);
}

const key = apiKey();
const clips = [];
const cues = [];
let spokenChars = 0;

for (const [i, line] of spec.lines.entries()) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: line.text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) {
    console.error(`TTS failed on line ${i} (HTTP ${res.status}):`, (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const j = await res.json();
  const file = join(OUT, `.narr-${LANG}-${String(i).padStart(2, '0')}.mp3`);
  writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));

  const a = j.alignment ?? j.normalized_alignment;
  const spoken = (a?.characters ?? []).join('');
  const end = a?.character_end_times_seconds?.at(-1) ?? 0;
  clips.push({ file, at: line.at, length: end });
  cues.push(
    ...cuesFor(spoken, a?.character_start_times_seconds ?? [], a?.character_end_times_seconds ?? [], line.at),
  );
  spokenChars += line.text.length;
  console.log(`  ✓ line ${i}  ${end.toFixed(2)}s  @${line.at}s`);
}

// Any line that runs into the next one is a defect the ear notices immediately.
for (let i = 0; i < clips.length - 1; i += 1) {
  const overrun = clips[i].at + clips[i].length - clips[i + 1].at;
  if (overrun > 0) console.log(`  ! line ${i} runs ${overrun.toFixed(2)}s into line ${i + 1}`);
}
const last = clips.at(-1);
if (last && duration > 0 && last.at + last.length > duration) {
  console.log(`  ! last line ends ${(last.at + last.length - duration).toFixed(2)}s after the video does`);
}

// One silent bed of exactly the video's length, each clip delayed onto it. The
// bed is what guarantees the track cannot end early and leave a silent tail that
// some players read as a corrupt stream.
const narration = join(OUT, `narration.${LANG}.opus`);
const inputs = ['-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=r=44100:cl=stereo'];
clips.forEach((c) => inputs.push('-i', c.file));
const delays = clips
  .map((c, i) => `[${i + 1}]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[d${i}]`)
  .join(';');
const mixIn = `[0]${clips.map((_, i) => `[d${i}]`).join('')}`;
ff(
  [...inputs, '-filter_complex', `${delays};${mixIn}amix=inputs=${clips.length + 1}:normalize=0[a]`,
   '-map', '[a]', '-c:a', 'libopus', '-b:a', '96k', narration],
  'narration bed',
);

// Captions, from the synthesiser's own timings.
const vttFile = join(OUT, `captions.${LANG}.vtt`);
writeFileSync(
  vttFile,
  `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${vtt(c.start)} --> ${vtt(c.end)}\n${c.text}\n`).join('\n')}`,
);

// Mux without touching the picture: the video stream is copied, not re-encoded.
const narrated = join(OUT, `agent-run.narrated.${LANG}.webm`);
ff(['-i', VIDEO, '-i', narration, '-c:v', 'copy', '-c:a', 'copy', '-shortest', narrated], 'mux webm');

// H.264/AAC fallback for players that will not take VP9/Opus.
const mp4 = join(OUT, `agent-run.narrated.${LANG}.mp4`);
ff(
  ['-i', narrated, '-c:v', 'libx264', '-crf', '21', '-preset', 'slow', '-pix_fmt', 'yuv420p',
   '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4],
  'mp4 fallback',
);

console.log(`\nwrote ${narration}`);
console.log(`wrote ${vttFile}  (${cues.length} cues)`);
console.log(`wrote ${narrated}`);
console.log(`wrote ${mp4}`);
console.log(`spoken characters billed: ${spokenChars}`);
