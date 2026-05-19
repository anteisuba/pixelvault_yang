# Audio Style Demos — Hover-Preview MP3 Seeding

> Last updated: 2026-05-19
> Owner: Studio audio (Sprint B1 follow-up to the Sprint 1-11 push)
> Status: script ready, MP3 files NOT yet generated

## Why this exists

`StudioAudioParams` ships per-style chip icons + hover-preview wiring (Step 9),
but the actual demo MP3s have not been seeded. `STYLE_DEMO_FILES` in
[StudioAudioParams.tsx](../../src/components/business/studio/StudioAudioParams.tsx)
keeps the entries commented out — missing files degrade silently to a no-op,
so the UI ships safely either way.

This doc gives you the one-shot procedure to generate the six clips against
your own Fish Audio key, drop them into `public/audio/style-demos/`, and
flip on the previews.

## Output layout

```
public/audio/style-demos/
  none.mp3
  calm.mp3
  excited.mp3
  whisper.mp3
  narration.mp3
  dialogue.mp3
```

Each clip is ~3 seconds, MP3 @ 44.1 kHz / 128 kbps. They are static assets,
not runtime-generated — generate once, commit to the repo, done.

## Procedure

1. Drop the generator script at `scripts/generate-style-demos.ts` (full
   source below — agents do not yet have write access to `scripts/`, so this
   step is a manual copy-paste).
2. Confirm `FISH_AUDIO_API_KEY` is set in `.env.local`.
3. Run:

   ```sh
   npx tsx scripts/generate-style-demos.ts
   ```

   Expect six lines of `ok (N bytes)`.

4. Uncomment the five matching entries in
   [`STYLE_DEMO_FILES` inside StudioAudioParams.tsx](../../src/components/business/studio/StudioAudioParams.tsx):

   ```ts
   const STYLE_DEMO_FILES: Partial<Record<AudioStyleValue, string>> = {
     calm: 'calm.mp3',
     excited: 'excited.mp3',
     whisper: 'whisper.mp3',
     narration: 'narration.mp3',
     dialogue: 'dialogue.mp3',
   }
   ```

   `none` is intentionally omitted — the "no style" chip has no demo.

5. Run the existing tests:

   ```sh
   npx vitest run src/components/business/studio/StudioAudioParams.test.tsx
   ```

   The "does not trigger the hover-preview audio when no demo file is
   configured" case will still pass because the test renders without a demo
   table override.

6. Manually verify in `/studio/audio` (or whichever workflow maps to the
   audio media group): hover a style chip for ~500ms → clip plays at
   volume 0.6.

## Script source (copy into `scripts/generate-style-demos.ts`)

```ts
/**
 * Style Demo MP3 Generator
 *
 * Generates the 6 ~3-second demo clips that power the hover-preview on
 * StudioAudioParams style chips. Writes to `public/audio/style-demos/`:
 *
 *   none.mp3 calm.mp3 excited.mp3 whisper.mp3 narration.mp3 dialogue.mp3
 *
 * Once files exist, uncomment the matching entries in `STYLE_DEMO_FILES`
 * inside `src/components/business/studio/StudioAudioParams.tsx` to light
 * up the previews.
 *
 * Usage:
 *   FISH_AUDIO_API_KEY=sk_... npx tsx scripts/generate-style-demos.ts
 *
 * Reads `.env.local` automatically, so if FISH_AUDIO_API_KEY is set there,
 * you don't need to inline it.
 */

import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

config({ path: resolve(import.meta.dirname, '..', '.env.local') })

const FISH_TTS_ENDPOINT = 'https://api.fish.audio/v1/tts'
const OUTPUT_DIR = resolve(
  import.meta.dirname,
  '..',
  'public',
  'audio',
  'style-demos',
)

type StyleKey =
  | 'none'
  | 'calm'
  | 'excited'
  | 'whisper'
  | 'narration'
  | 'dialogue'

interface StyleDemo {
  key: StyleKey
  prompt: string
  temperature: number
  topP: number
}

const DEMOS: readonly StyleDemo[] = [
  {
    key: 'none',
    prompt: 'This is the default reading style, with neutral tone and pacing.',
    temperature: 0.7,
    topP: 0.7,
  },
  {
    key: 'calm',
    prompt: 'Take a slow breath in, and let the world go quiet for a moment.',
    temperature: 0.55,
    topP: 0.7,
  },
  {
    key: 'excited',
    prompt: 'Wow, this is incredible — wait until you see what happens next!',
    temperature: 0.9,
    topP: 0.8,
  },
  {
    key: 'whisper',
    prompt: 'Lean in close. I have a secret I have been waiting to tell you.',
    temperature: 0.5,
    topP: 0.6,
  },
  {
    key: 'narration',
    prompt:
      'In a small village by the edge of the forest, a single light still burned.',
    temperature: 0.65,
    topP: 0.7,
  },
  {
    key: 'dialogue',
    prompt:
      "He said, 'You really came back.' She smiled and replied, 'I had to.'",
    temperature: 0.75,
    topP: 0.75,
  },
]

async function generateOne(apiKey: string, demo: StyleDemo): Promise<Buffer> {
  const response = await fetch(FISH_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model: 's1',
    },
    body: JSON.stringify({
      text: demo.prompt,
      format: 'mp3',
      mp3_bitrate: 128,
      sample_rate: 44100,
      latency: 'normal',
      normalize: true,
      temperature: demo.temperature,
      top_p: demo.topP,
      chunk_length: 300,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>')
    throw new Error(
      `Fish TTS failed for "${demo.key}" (status ${response.status}): ${body.slice(0, 200)}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function main(): Promise<void> {
  const apiKey = process.env.FISH_AUDIO_API_KEY?.trim()
  if (!apiKey) {
    console.error(
      'FISH_AUDIO_API_KEY is not set. Add it to .env.local or pass inline.',
    )
    process.exit(1)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  console.log(`Output: ${OUTPUT_DIR}\n`)

  for (const demo of DEMOS) {
    process.stdout.write(`  ${demo.key.padEnd(10)} ... `)
    try {
      const buffer = await generateOne(apiKey, demo)
      const filePath = resolve(OUTPUT_DIR, `${demo.key}.mp3`)
      await writeFile(filePath, buffer)
      console.log(`ok (${buffer.byteLength} bytes)`)
    } catch (err) {
      console.log(`FAIL — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(
    '\nNext: uncomment the matching entries in STYLE_DEMO_FILES inside\n' +
      '      src/components/business/studio/StudioAudioParams.tsx',
  )
}

void main()
```

## Why not bake this into a CI step?

- These are static assets — generate once, commit, never re-run unless we
  change a style prompt or want new voices.
- Burning credits on every CI build is silly.
- The demo prompts are short generic English; if you want JP / ZH variants
  later, fork the `DEMOS` table and re-run.

## Alternative: skip the generator and record clips manually

If you don't want Fish-flavored voices for the demo, you can record any six
~3-second clips with your DAW of choice, normalize to ~-14 LUFS, export as
MP3, and place them under `public/audio/style-demos/` with the same filenames.
The component does not care about the source.
