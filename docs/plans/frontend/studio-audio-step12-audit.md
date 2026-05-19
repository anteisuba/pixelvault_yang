# Step 12 Audit — Voice Cloning UX (VoiceTrainer + train → library sync)

> Last updated: 2026-05-19
> Companion: `docs/plans/frontend/studio-feature-map.md` (Audio Mode section)
> Status: audit complete; concrete fixes listed at bottom

## Why this audit

Sprint 1-11 of the audio plan shipped most of the user-facing audio surface
(pace / pause / style chips, advanced tabs, speaker chips, feedback retry,
ASR audio-to-prompt, zero-shot reference upload). Step 12 was scoped as
"voice cloning UX hardening" — but VoiceTrainer has been in the codebase
since before the audio sprint kicked off and was never re-reviewed.

This audit reads the current code on `main` and lists what is wired, what
is half-wired, and what is missing — so we can decide whether Step 12 is
"finish a few small gaps" or "real new work."

## Files reviewed

| File                                                                                                                              | Role                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`src/components/business/studio/VoiceTrainer.tsx`](../../../src/components/business/studio/VoiceTrainer.tsx)                     | clone form UI                                                               |
| [`src/components/business/studio/StudioToolbarPanels.tsx`](../../../src/components/business/studio/StudioToolbarPanels.tsx)       | "Clone" pill that opens the `voiceTrainer` panel                            |
| [`src/components/business/studio/StudioDockPanelArea.tsx`](../../../src/components/business/studio/StudioDockPanelArea.tsx)       | Dialog host for `voiceTrainer` + `voiceSelector` (`FishVoiceLibraryDialog`) |
| [`src/components/business/studio/FishVoiceLibraryDialog.tsx`](../../../src/components/business/studio/FishVoiceLibraryDialog.tsx) | Wraps `VoiceSelector` in a modal                                            |
| [`src/components/business/studio/VoiceSelector.tsx`](../../../src/components/business/studio/VoiceSelector.tsx)                   | Public + "My voices" tabs                                                   |
| [`src/hooks/use-voice-cards.ts`](../../../src/hooks/use-voice-cards.ts)                                                           | Loads local `VoiceCard` records from `/api/voice-cards`                     |
| [`src/app/api/voices/route.ts`](../../../src/app/api/voices/route.ts)                                                             | `GET` list (public + self) · `POST` create (clone)                          |
| [`src/services/fish-audio-voice.service.ts`](../../../src/services/fish-audio-voice.service.ts)                                   | Fish API client — `createVoice` is the only non-stream call we make         |
| [`src/services/voice-card.service.ts`](../../../src/services/voice-card.service.ts)                                               | Writes the local DB `VoiceCard` row after a successful clone                |

## What works today

### Train flow

1. Toolbar pill "Clone" toggles the `voiceTrainer` panel (mutually exclusive
   with `voiceSelector` and `audioTranscribe`).
2. `VoiceTrainer` accepts:
   - voice name (`title`, max 100 chars)
   - 1..N audio files (`<input type="file" multiple accept="audio/*">`)
   - optional transcript (`Textarea`)
   - "Transcribe" button → runs ASR via `/api/voices/transcribe` on the
     first uploaded file, fills the transcript text
   - "Enhance audio quality" checkbox → forwarded as
     `enhance_audio_quality=true` to Fish
3. On submit: builds a single `FormData` with all files + optional transcript
   - enhance flag, posts to `/api/voices` (multipart).
4. Server: `POST /api/voices` validates the Clerk session, finds the user's
   Fish API key, calls `createVoice()` against Fish, and on success writes a
   `VoiceCard` row via `createClonedVoiceCard()`. Returns
   `{ data: voice, voiceCard }`.
5. Client on success: dispatches `SET_VOICE_CARD_ID` + `SET_VOICE_ID` so the
   newly cloned voice is immediately selected as the active voice, resets
   the form, toasts success.

This is sound — the cloned voice is selected and ready to TTS against
without a round-trip.

### Library tab semantics

- `VoiceSelector` has two tabs: `public` (calls `GET /api/voices` against the
  platform Fish key, cached `s-maxage=300, swr=900`) and `my` (reads local
  `VoiceCard` rows via `useVoiceCards`).
- The `my` tab also shows favorites (a Heart toggle on public voices creates
  a `VoiceCard` row with `provider=FISH_AUDIO, voiceId=<public voice id>`).
- `useVoiceCards` runs `refresh()` once on mount via `deferEffectTask`.
- Favorite / delete from `VoiceSelector` call `voiceCards.refresh()` after
  the API mutation — so within a single `VoiceSelector` mount the list stays
  consistent.

## Gaps (the actual Step 12 punch list)

### G1 — VoiceTrainer does not refresh the voice card list after a clone

`VoiceTrainer.handleTrain` dispatches `SET_VOICE_CARD_ID` + `SET_VOICE_ID`
but never calls `voiceCards.refresh()`. The hook is not even imported.

Visible bug: if the user trains a voice and then immediately opens the
voice library ("My voices" tab) without remounting `VoiceSelector`, the
new card may not appear. In practice this is usually masked because the
library dialog is a separate `Dialog`, and `VoiceSelector` is dynamically
imported + likely remounts on dialog reopen — but the gap is real on any
path that keeps `VoiceSelector` mounted.

**Fix**: have `VoiceTrainer` call `useVoiceCards().refresh()` on success.
~3 lines of code, no API or schema change.

### G2 — No per-file progress feedback during multi-file uploads

`createVoiceAPI(formData)` is a single multipart POST — for a 5-file clone
the user sees one "Training…" spinner for the duration of the entire
upload + Fish create call. No per-file status, no upload progress, no way
to cancel.

For typical 1-3 file clones this is fine. For larger sample sets it feels
broken.

**Fix options**:

- (cheap) Show a `Stage: uploading / training` two-step indicator based on
  request lifecycle. No upload bytes — just a state.
- (expensive) Switch to per-file upload to R2 first, then a JSON POST that
  references R2 URLs. Worth it only if we hit Vercel's 4.5 MB body limit
  for multi-file clones, which is plausible at ~3 files of WAV.

Recommendation: cheap fix only — see B3 in the existing tech-debt list.

### G3 — There is no async / polling status for clone

The Fish docs claim `POST /model` is synchronous and returns the new voice
ID instantly ("fast mode"), and the in-code comment on `VoiceTrainer`
agrees ("Fast mode: voice is instantly available after creation"). The
service does not poll, and we have not observed delayed availability.

So the "polling status" item from the original Step 12 sketch is **not
needed** — close it out.

### G4 — Batch upload (more than ~5 files) is untested

Fish accepts multiple `voices[]` files in one create call. There is no
client-side cap on `<input multiple>`, so a user could attach 50 files.
The server reads them all into memory in `voices: Buffer[]` before
forwarding. Vercel function memory and the 4.5 MB request body limit
will both bite long before we hit a real Fish limit.

**Fix**: cap the file count client-side (suggested ≤ 8) and reject
files larger than ~10 MB each with a clear error. ~10 lines, no API
change. Probably want to surface the cap in the i18n hint.

### G5 — No "this voice clone uses X seconds of source audio" hint

The Fish dashboard surfaces total source-audio duration; we do not. For
power users it would be nice to show the running total as files are added.

**Fix**: deferred — out of scope for Step 12. Capture in the roadmap as
a polish item.

### G6 — VoiceTrainer's "Transcribe" button only handles the first file

Even when the user uploads multiple files, only `files[0]` is sent to
ASR. If they meant to populate the transcript from a later file, they
have to remove earlier files first. Not a bug per the current contract
but surprising.

**Fix**: optional small UX — pick which file to transcribe, or just
relabel to "Transcribe first file." ~2 lines.

### G7 — No tests cover VoiceTrainer behavior

`VoiceTrainer.tsx` has no `VoiceTrainer.test.tsx`. The component has
non-trivial behavior (multi-file management, optional transcript,
enhance toggle, dispatch on success). The other dialogs added during the
audio sprint (AudioTranscribeDialog, FishVoiceLibraryDialog,
StudioAudioFeedback) all have tests.

**Fix**: add `VoiceTrainer.test.tsx` covering the train success path,
ASR fill, and the file add/remove flow. Per CLAUDE.md's testing rule,
"修改功能必须更新测试" — if we touch G1 / G4 / G6 we should add a test
file at the same time. ~50 lines.

## Bottom line — what Step 12 actually is

Step 12 is **not** a from-scratch voice-cloning rebuild. It is a small
hardening pass:

| Sub-step | Effort | Value                                          |
| -------- | ------ | ---------------------------------------------- |
| G1 fix   | XS     | Closes a real "where did my voice go" bug      |
| G4 fix   | XS     | Prevents foot-gun OOM / 413 on big multi-clone |
| G7 tests | S      | Catches regressions on the above two           |
| G2 cheap | XS     | Minor UX clarity                               |
| G6 fix   | XS     | Minor UX clarity                               |
| G3       | —      | NOT NEEDED — close                             |
| G5       | —      | DEFER to roadmap polish                        |

Total estimated effort: **~1 focused hour** of dev + ~30 min for tests,
matching the original "A1 Step 12 audit + small fixes" budget.

## Recommended micro-tickets (ready to ship)

1. `VoiceTrainer` calls `useVoiceCards().refresh()` after a successful
   `createVoiceAPI` call. Add a unit test asserting the call.
2. Add `VOICE_TRAIN_MAX_FILES = 8` and `VOICE_TRAIN_MAX_FILE_BYTES = 10

- 1024 \* 1024`constants in`src/constants/voice-cards.ts`; enforce in
 `VoiceTrainer.handleFileSelect` with i18n'd toasts.

3. Add `voiceTrainTranscribeFirstHint` to the three i18n files clarifying
   which file gets transcribed.
4. New `VoiceTrainer.test.tsx` (rendering, file add/remove, train success
   dispatching SET_VOICE_CARD_ID and SET_VOICE_ID + refresh, train failure
   toast on missing API key).

Defer to a separate ticket (or kill):

- Per-file upload progress (G2 expensive version)
- Source-audio duration counter (G5)
- Pick-which-file-to-transcribe (G6 fancy version)

## What this audit explicitly is NOT

- It does not survey the Fish API for new endpoints we should adopt.
- It does not propose UI redesign of `VoiceSelector` or the library.
- It does not touch the public-library cache key behavior.

Those belong in their own tickets if we want them.
