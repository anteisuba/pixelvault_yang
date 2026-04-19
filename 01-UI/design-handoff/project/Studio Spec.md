# PixelVault Studio — Design Spec & Engineering Handoff

Target reader: **Claude Code** (or any senior FE engineer).
Scope: the `Studio` surface — three modes (**Image**, **Video**, **Audio**), plus the shared chrome (top nav, sidebar, command palette).

Visual references (build these 1:1):

- `ui_kits/Studio — Image.html`
- `ui_kits/Studio — Video.html`
- `ui_kits/Studio — Audio.html`

Shared tokens live in `colors_and_type.css` (do not redefine — import only).

---

## 0. Global principles

1. **Three modes, one shell.** Top nav, left sidebar, and command palette are shared. Each mode owns its workspace grid. Switching modes is a route change, not a state toggle — URLs: `/studio/image`, `/studio/video`, `/studio/audio`.
2. **Warm, editorial, quiet.** The brand color `#d97757` is reserved for _primary actions and accents_. Each mode has a secondary accent used only inside its own workspace: Image → primary (warm orange), Video → `#9b59b6`, Audio → `#6d8f5c`.
3. **Generation is a first-class document, not a modal.** Runs are appended to the canvas as timestamped sections that persist. Never wipe on new generate.
4. **Every asset has a URL + localStorage cursor.** Users can refresh without losing place. Store last-selected project, last-open shot, last-played block in `localStorage`.
5. **Type scale, spacing, radii, shadows — use tokens from `colors_and_type.css` only.** No raw hex or px anywhere outside tokens, except the three accent colors above which are mode-local.

---

## 1. Shared shell

### 1.1 Top nav (52px, sticky)

- Brand mark (`P` on primary square) + "PixelVault" (display font, 17px, -0.04em).
- Primary nav links: `Gallery · Studio · Arena · Stories` (uppercase 10.5px, tracking 0.16em; active state = pill with `primary @ 10% alpha`).
- Right cluster: search/cmd-palette pill (⌘K), credit counter (pill with primary-color leading dot), user avatar (30px circle).
- Backdrop blur + semi-transparent background to sit over any workspace.

### 1.2 Sidebar (240px)

Three stacked sections top→bottom:

1. **Mode switcher** — three tiles (Image / Video / Audio). Active tile gets card background + border + mode-specific icon tint.
2. **Projects tree** — rows with colored tag (`•`), name, and item count. Active row gets `primary @ 8%` background + a 3px left bar (`primary`) extending into the gutter. Rows accept drag targets (drop an image or shot onto a project to move it).
3. **Footer** — `API keys` (shows `3/6` configured), `Settings`. Keep flush-bottom.

### 1.3 Command palette (⌘K)

Not shown in mockups but wire it up. Fuzzy-match against: projects, models, presets, recent prompts, settings. Keyboard-only nav.

---

## 2. Image mode

**Route:** `/studio/image/:projectId`
**Mental model:** an infinite vertical archive of "runs" with a floating composer at the bottom.

### 2.1 Workspace grid

```
┌─────────────────────────────────────────┐
│ ws-header (56px)                        │
├─────────────────────────────────────────┤
│ img-canvas (scrollable, padded bottom)  │
│   ├─ run section 1 (newest, top)        │
│   ├─ variant tray (if user favorited)   │
│   ├─ run section 2                      │
│   └─ …                                  │
│                                         │
│   [floating composer, abs-positioned]   │
│   [run minimap, fixed right edge]       │
└─────────────────────────────────────────┘
```

### 2.2 Run section

Each generate call creates a **run** — an immutable block containing: timestamp, prompt echo, meta (aspect, model count, seed), and a grid of model-comparison cards.

- Run header: mono timestamp (`14:32 · Now`) + serif italic prompt echo + mono meta row.
- Grid: `repeat(N, 1fr)` where N = number of models compared (1–4). Cards have head (model name + vendor + cost), image (aspect 1:1 by default), and foot (resolution + gen time).
- Loading state: "film developing" animation — animated noise overlay + rising gradient sweep + bottom HUD bar with progress %.
- Hover reveals: favorite (heart), variations, upscale, download — as pill-shaped buttons over the image.

### 2.3 Variant tray (auto-appears after favorite)

When a user hearts a card, the system enqueues 5 seed variations and shows a **variant tray** immediately below that run: 6-up row (5 variants + `+` to add more). Each variant displays a `seed tag` in the bottom-left corner.

### 2.4 Composer (floating bottom)

Sticky-ish: absolutely positioned inside workspace, 1120px max-width, centered. Four horizontal zones stacked:

1. **Reference row** — pill-shaped chips for each dropped reference image (24px round thumb + filename + ×). Trailing dashed `+ Add reference` button. Hint on right: "drag anywhere on canvas" — indeed, users can drop files anywhere on the canvas and they get attached here.
2. **Prompt textarea** — auto-growing (min 40px, max 140px), serif-free, 15px, italic placeholder.
3. **Preset strip** — horizontal scroll row of style chips, each with a tiny round color-mix thumb. One "none" at front. Chips are mutually exclusive.
4. **Composer foot** — model trigger (left), aspect segmented control (1:1/3:4/16:9/9:16), batch (1×/4×/8×), advanced button, and **Generate** (right, primary filled pill with cost echo and `⌘↵` kbd).

### 2.5 Model trigger / picker

Tapping the "Compare · 4 models" chip opens a sheet (modal, not a dropdown) listing all available models grouped by vendor. Each row: vendor logo, model name, cost, tags (`fast`, `photoreal`, `text-in-image`), toggle. User selects 1–4 to compare. Footer: "Compare selected · est. cost $X.XX".

### 2.6 Run minimap

Fixed to right edge, vertical dots. Current run = 18px tall pill. Click to scroll to run. Smooth-scroll only; no `scrollIntoView`.

---

## 3. Video mode

**Route:** `/studio/video/:projectId`
**Accent color:** `#9b59b6` (mode-local).

### 3.1 Workspace grid

```
┌─────────────────────────────────────────┐
│ ws-header                               │
├─────────────────────────────────────────┤
│ sub-tabs: Shot | Script Doctor | Timeline│
├──────────┬──────────────────────────────┤
│ assets   │ mode-specific main            │
│ rail     │                              │
│ (Cast,   │                              │
│  Locs,   │                              │
│  Props)  │                              │
└──────────┴──────────────────────────────┘
```

Default sub-tab on first visit = **Script Doctor** (this is PixelVault's signature feature).

### 3.2 Assets rail (Cast / Locations / Props)

All three lists share the same card shape (44px thumb, name, subline, status chip). Cards are **draggable** — drop onto any shot to attach as a locked reference. Status chips: `3-view` (green, character has locked turnaround) or `draft`.

### 3.3 Sub-tab: Script Doctor ★ signature feature

This is the differentiator. Users paste prose; AI returns a shot list with camera, duration, motion, refs.

**Layout:**

```
┌─ Script intake (collapsible card) ─────────┐
│  textarea + tone/shots/length knobs        │
│                        [Re-doctor script]  │
└────────────────────────────────────────────┘

Storyboard · 6 shots (est. 30s · 2 locked · 4 pending)

┌──┬────────┬──────────────────────┬────────┐
│01│ clip  │ INT · SLUG            │  Lock  │
│  │ (16:9) │ @Cast @Loc @Motion    │  Regen │
│  │ ◆LOCK  │ serif script editable │  Vary  │
│  │        │ model · refs · seed   │        │
└──┴────────┴──────────────────────┴────────┘
          ── Cut ──   (click to change transition)
┌──┬────────┬──────────────────────┬────────┐
│02│ ...    │ ...                   │ ...    │
```

**Per-shot row:**

- **Index column**: large display number + duration range + drag handle.
- **Preview**: 16:9 video placeholder with hover play overlay. Status badge top-left (`◆ LOCKED · v3` green, or `READY · v1` neutral, or full `not generated` diagonal-hatch empty state).
- **Detail column**:
  - Label row: all-caps slug (`INT · CAFÉ DOOR · DAWN`) + attachment chips — cast (purple), location (amber), motion (blue). Each chip has a tiny swatch.
  - Script: serif 14px, contenteditable. `<strong>` for camera directives, `<em>` for ambient/parenthetical.
  - Meta: model · refs · seed · cost (mono 10.5px).
- **Actions column** (200px, vertical stack):
  - Lock / Regenerate / Vary / Download, or Generate+cost / Add variant / Delete when empty.

**Transitions between shots:** horizontal connector with a pill label (`Cut`, `Dissolve`, `Hard cut · sound bridge`). Click to pick.

**Behaviors:**

- Editing script text in a shot marks the shot as "dirty" → regenerate button gets a dot.
- Dragging a cast card onto a shot's chip row attaches and re-renders the chip.
- "Re-doctor script" regenerates **only pending/unlocked shots** so locked takes survive.

### 3.4 Character Turnaround workbench ★ signature feature

Entry: click any cast card. Opens a full-workspace overlay (not a modal).

**Three zones:**

1. **Header** — eyebrow `CHARACTER · TURNAROUND`, character name, close button.
2. **Canvas** (left, large): source photo (3:4 thumb) + **triptych** of views (Front 0°, 3/4 45°, Profile 90°). Each view has its own lock toggle and "Vary" button. Locked views get a green left-border and a `◆` prefix on the view name.
3. **Inspector** (right, 320px): three stacked panels:
   - **Character** — name, role, wardrobe tags (add/remove), description textarea.
   - **Turnaround settings** — model, background, lighting match. Big `Regenerate profile view` button. Big green `◆ Use as reference in all Elena shots` button.
   - **Usage** — "Used in 4 shots · shots 02, 04, 05, 06".

**Why three views specifically:** Front/3-4/Profile is the minimum set most video models need for character consistency. The triptych also prints well into a character sheet PDF export.

### 3.5 Sub-tab: Shot (quick/single clip mode)

Similar composer to Image mode but: drag one ref, pick one model, pick duration (1s/3s/5s/10s), pick motion preset. Single preview output.

### 3.6 Sub-tab: Timeline

Classic NLE: rows for video/music/SFX/captions, playhead, scrubbable preview. Drag shots from Storyboard → Timeline row. Out of scope for v1 MVP; stub only.

---

## 4. Audio mode

**Route:** `/studio/audio/:projectId`
**Accent color:** `#6d8f5c` (mode-local).

### 4.1 Workspace grid

```
┌─────────────────────────────────────────┐
│ ws-header                               │
├─────────────────────────────────────────┤
│ tabs: Script→Voice | Music | SFX | Stems│
├────────┬────────────────────┬───────────┤
│ voices │ script document    │ inspector │
│ rail   │ (center, scroll)   │ (right)   │
│ 260    │                    │ 340       │
│        │ [transport bar, floating]      │
└────────┴────────────────────┴───────────┘
```

### 4.2 Voice cast rail

Round 42px avatars with initial letter on mode-accent gradient. Each card: name, sub (role · tone · age). Play button on right previews the voice on a canned line. Clone-a-voice card at bottom — dashed border, italic hint.

### 4.3 Script document (center)

**Structure:** chapter → blocks → inline tokens.

- **Chapter label**: mono `Ch. 01` in accent green + editable title + dashed line + `remove`.
- **Block** (the core unit): grid `[44px avatar-col] [body-col 1fr]`.
  - Avatar col: voice avatar (click to reassign voice) + speaker name under it.
  - Body col:
    - **Text**: serif 17px, line-height 1.65, contenteditable. Supports inline tokens:
      - `<span class="dir">` — direction pill (`warm, slow`, `whisper`, `conversational`). Mode-accent chip, capsule shape.
      - `<span class="pause">` — timed pause marker (`⏸ 0.4s`).
      - `<span class="emph">` — emphasis (soft peach bg).
    - **Waveform** — 80 bars, scales to width. `playing` state animates scaleY pulse on each bar.
    - **Foot**: Play · duration pill + provider + cost + inline insert bar (`+ pause`, `+ direction`, `+ SFX`, `↻`).
- **SFX block** — visually distinct: primary-orange accent avatar with wave icon, `ambient` direction chip in orange, duration + dB + license tag. Looks like a voice block but isn't rendered through TTS.
- **Pending block** — dashed border, italic placeholder. Hitting Enter on the last block creates a new one in the same voice.

### 4.4 Right inspector (selected block / voice)

**Top panel** — the voice of the currently-focused block:

- Sliders for **Pace / Warmth / Energy / Stability** (0–100, but pace shows as `0.94×`).
- **Direction presets** — chip row: `warm · whisper · curious · flat · excited · somber · laugh · sigh`. Clicking one inserts a direction token at cursor position.

**Bottom panel** — SFX library, drag-to-timeline cards. Each: 30px icon tile (accent-on-accent), name, `duration · LOOP/ONE-SHOT · db`, play button.

### 4.5 Transport bar (floating bottom)

```
[⟲][▶][⟳]  [waveform with chapter marks + playhead]  [Next render $0.14] [MP3 ▼]
```

- Single-line, bg `card@96%` + backdrop blur + 2xl radius.
- Waveform shows the whole episode. Chapter boundaries = vertical accent-color marks with floating labels above (`Ch.01`). Playhead is a 2px primary line with a glow.
- Time readout left of waveform: `00:12 / 08:24`.
- Export format dropdown: MP3 / WAV / stems (zip).

### 4.6 Other tabs (stubs v1)

- **Music** — prompt-to-music (Suno-style), drag tracks under script timeline.
- **SFX mix** — volume/duck rules per SFX layer.
- **Stems** — per-voice stem export.

---

## 5. Engineering notes

### 5.1 Stack assumption

React 18, Vite, TypeScript. Tailwind optional but design tokens should be CSS vars (already defined in `colors_and_type.css`). State: Zustand for workspace state; TanStack Query for generation calls; `nanoid` for local ids.

### 5.2 Data model (minimum viable)

```ts
type Project = { id; name; color; mode: 'image' | 'video' | 'audio'; createdAt }

// Image
type Run = {
  id
  projectId
  createdAt
  prompt
  aspect
  seed
  modelIds: string[]
  refs: RefImage[]
  style?: string
}
type Result = {
  id
  runId
  modelId
  status: 'queued' | 'running' | 'done' | 'error'
  url?
  cost
  duration
}

// Video
type Character = {
  id
  projectId
  name
  role
  wardrobe: string[]
  description
  sourceUrl
  views: { front: ViewState; threeQuarter: ViewState; profile: ViewState }
}
type ViewState = { url?; locked: boolean; seed; model }
type Shot = {
  id
  projectId
  index
  durationStart
  durationEnd
  slug
  script
  castIds: string[]
  locationId?
  motion?
  modelId
  refs: string[]
  status: 'empty' | 'queued' | 'ready' | 'locked'
  videoUrl?
  seed
}
type Transition = {
  from: shotId
  to: shotId
  kind: 'cut' | 'dissolve' | 'whip'
}

// Audio
type Voice = {
  id
  name
  role
  tone
  age
  providerVoiceId
  params: { pace; warmth; energy; stability }
}
type Chapter = { id; projectId; index; title; blockIds: string[] }
type Block = {
  id
  chapterId
  kind: 'voice' | 'sfx' | 'music'
  voiceId?
  text? // voice
  sfxId?
  loop?
  db? // sfx
  audioUrl?
  durationMs
  status
  cost
}
```

### 5.3 Components to build (order)

1. `<StudioShell>` — routes the three mode pages, renders top nav + sidebar.
2. `<ModePicker>` — sidebar tiles.
3. `<ProjectTree>` — drag-aware project list.
4. `<CommandPalette>` — ⌘K.
5. Image: `<RunFeed>`, `<RunSection>`, `<CompareCard>`, `<VariantTray>`, `<Composer>`, `<ModelPicker>`.
6. Video: `<ScriptIntake>`, `<Storyboard>`, `<ShotRow>`, `<TransitionConnector>`, `<AssetsRail>`, `<CharacterWorkbench>`.
7. Audio: `<VoicesRail>`, `<ScriptDocument>`, `<Block>`, `<Inspector>`, `<Transport>`.

### 5.4 Animation & timing

- Use the existing `--ease-out-expo` and `--dur-base` (200ms) for all hover/focus.
- Film-develop loading is 2.2s infinite until swap. Swap with a 200ms cross-fade.
- Waveform animates only when the block is actively playing (one `<audio>` at a time).

### 5.5 Accessibility

- All draggable cards must also have a keyboard affordance (`Enter` opens an "attach to…" picker).
- ContentEditable blocks must expose proper `role="textbox"` and aria-labels.
- Color is never the only signifier: locked shots have both green tint **and** a `◆` glyph; status chips have both color **and** text.

### 5.6 Performance

- Virtualize the Image canvas run feed at >50 runs.
- Debounce contenteditable saves (500ms) before marking a block dirty.
- Preload only the currently-visible shot's poster frame; lazy-load others.

### 5.7 State persistence

`localStorage` keys (all under `pv:v1:`):

- `pv:v1:activeProject` → project id
- `pv:v1:studio:<projectId>:lastTab` → image-subtab / video-subtab / audio-subtab
- `pv:v1:studio:<projectId>:scroll` → canvas scrollTop
- `pv:v1:audio:<projectId>:cursor` → playhead ms

### 5.8 Out of scope for v1

- Team / sharing / permissions.
- Billing wall.
- Timeline sub-tab in Video (stub only).
- Music + Stems tabs in Audio (stubs only).

---

## 6. Learnings lifted from the best tools

| Borrowed from              | What we took                                       | Where it lands              |
| -------------------------- | -------------------------------------------------- | --------------------------- |
| Midjourney Web             | Persistent run archive, favorite → variations loop | Image canvas + variant tray |
| Krea realtime              | Style presets as visual swatches not words         | Composer preset strip       |
| Figma Canvas               | Drop anywhere → ref chip                           | Composer ref row            |
| Runway Gen-3 / Pika        | Shot-level refs, per-shot lock                     | Script Doctor ShotRow       |
| Sora storyboard            | Script → shots pipeline                            | Script Doctor intake        |
| Character sheet traditions | Front/3-4/Profile triptych                         | Character workbench         |
| ElevenLabs Projects        | Speaker-assigned paragraphs                        | Audio script document       |
| Suno                       | Voice as a draggable cast member                   | Voices rail                 |
| Linear                     | ⌘K, keyboard-first                                 | Command palette             |
| Arc                        | Project tree with color tags                       | Sidebar                     |

---

## 7. Open questions for product

1. Credits vs. pay-per-call — the mockups show both (header credits + per-model cost). Pick one primary.
2. Character turnaround: should the three views auto-generate on character creation, or be opt-in?
3. Script Doctor: should it preserve the exact prose as a "master" block, or discard after shot-list generation?
4. Transport scrubber in Audio mode: segment-scrub (per block) or continuous (full timeline)?
5. Multi-voice real-time collaboration — v2, but worth flagging now for data-model shape.

— end of spec —
