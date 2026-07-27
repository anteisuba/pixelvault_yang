import { ROUTES } from '@/constants/routes'

/**
 * Fixtures for the v3 marketing home's framed product views.
 *
 * These are staged screenshots-in-markup, not live data: the homepage is
 * statically rendered and edge-cached (`revalidate = 3600`), so it must not
 * reach for a session or the database. Baseline: docs/references/pages/home.md
 * §A1. Whether any of it should become real is listed as undecided in §A7.
 *
 * All prose lives in `src/messages/*.json` under `Homepage.*View`; only
 * geometry, model names and image paths are here.
 */

/** Shared pool so every view draws from the same archive the hero strip does. */
export const HOME_V3_SHOTS = {
  portrait: '/homepage/archive/portrait.webp',
  landscape: '/homepage/archive/landscape.webp',
  stillLife: '/homepage/archive/stilllife.webp',
  animal: '/homepage/archive/animal.webp',
  concept: '/homepage/archive/concept.webp',
  abstract: '/homepage/archive/abstract.webp',
  nightFerryCharacter:
    '/homepage/production/canvas/night-ferry-character-anchor-v1.webp',
  nightFerrySetting: '/homepage/production/canvas/night-ferry-setting-v1.webp',
  nightFerryShot:
    '/homepage/production/video/night-ferry-seedance-first-frame-v1.webp',
  nightFerryVideo:
    '/homepage/production/canvas/night-ferry-video-poster-v1.webp',
  s01: '/showcase/showcase-01.webp',
  s02: '/showcase/showcase-02.webp',
  s03: '/showcase/showcase-03.webp',
  s04: '/showcase/showcase-04.webp',
  s05: '/showcase/showcase-05.webp',
  s06: '/showcase/showcase-06.webp',
  s07: '/showcase/showcase-07.webp',
  s08: '/showcase/showcase-08.webp',
} as const

export const HOME_V3_VIEWS = ['canvas', 'studio', 'lora', 'assets'] as const
export type HomeV3View = (typeof HOME_V3_VIEWS)[number]

/**
 * The node graph's own coordinate space. The edge `<svg>` uses this as its
 * viewBox with `preserveAspectRatio="none"` and the cards are positioned as
 * percentages of the same box, so the two stay in step at any width.
 *
 * `H` is 640 rather than the 528 it started at because card height comes from
 * fixed font sizes and does not shrink with the canvas, while the pitch between
 * cards does — at 528 the middle column overlapped as soon as the viewport was
 * narrower than the design width.
 */
export const HOME_V3_CANVAS_BOX = {
  width: 1050,
  height: 640,
  portY: 46,
} as const

export const HOME_V3_CANVAS_NODES = [
  { id: 'script', x: 20, y: 244, model: 'GPT-5.5', kind: 'text' },
  {
    id: 'character',
    x: 250,
    y: 20,
    model: 'Flux 2 Pro',
    kind: 'image',
    shot: HOME_V3_SHOTS.nightFerryCharacter,
  },
  {
    id: 'setting',
    x: 250,
    y: 214,
    model: 'Gemini 3 Pro',
    kind: 'image',
    shot: HOME_V3_SHOTS.nightFerrySetting,
    running: true,
  },
  { id: 'audio', x: 250, y: 408, model: 'Fish Audio S2', kind: 'wave' },
  {
    id: 'shot',
    x: 520,
    y: 150,
    model: 'Seedream 5.0',
    kind: 'image',
    shot: HOME_V3_SHOTS.nightFerryShot,
    selected: true,
  },
  {
    id: 'video',
    x: 800,
    y: 320,
    model: 'Seedance 2.0',
    kind: 'image',
    shot: HOME_V3_SHOTS.nightFerryVideo,
    running: true,
  },
] as const

/** `[from, to, isActive]` — the active one is the dashed black edge. */
export const HOME_V3_CANVAS_EDGES = [
  ['script', 'character', false],
  ['script', 'setting', false],
  ['script', 'audio', false],
  ['character', 'shot', false],
  ['setting', 'shot', false],
  ['shot', 'video', true],
  ['audio', 'video', false],
] as const

/** Waveform bar heights, precomputed so the markup is deterministic. */
export const HOME_V3_WAVE_BARS = Array.from(
  { length: 22 },
  (_, i) =>
    12 + Math.round(70 * Math.abs(Math.sin(i * 0.8) * Math.cos(i * 0.34))),
)

export const HOME_V3_STUDIO_TAGS = [
  { name: 'Flux 2 Pro', on: true },
  { name: 'Gemini 3 Pro', on: true },
  { name: 'GPT Image 2', on: true },
  { name: 'NovelAI V4.5', on: true },
  { name: 'Seedream 5.0', on: false },
  { name: 'Recraft V4.1', on: false },
] as const

export const HOME_V3_STUDIO_SHEET = [
  { model: 'Flux 2 Pro', shot: HOME_V3_SHOTS.s01, elapsed: '2.1s' },
  { model: 'Gemini 3 Pro', shot: HOME_V3_SHOTS.s03, picked: true },
  { model: 'GPT Image 2', shot: HOME_V3_SHOTS.landscape, elapsed: '3.4s' },
  { model: 'NovelAI V4.5', shot: HOME_V3_SHOTS.s06, progress: 71 },
] as const

export const HOME_V3_LORA = {
  baseName: 'Nova Anime XL',
  baseMeta: 'SDXL · runner',
  baseShot: HOME_V3_SHOTS.s04,
  stack: [
    { name: '娜波摩非 · 角色', weight: 0.85 },
    { name: '冷调胶片 · 画风', weight: 0.42 },
  ],
  triggers: ['nbmf', 'short hair', 'film grain', 'cold tone'],
  /**
   * One source, three crops — not three different pictures. The view claims the
   * character stays the same across shots, so three unrelated subjects would
   * disprove the very thing it is there to show.
   */
  shots: [
    { id: 'front', objectPosition: 'center 22%', scale: 1, brightness: 1.06 },
    { id: 'profile', objectPosition: 'center 40%', scale: 1.14, brightness: 1 },
    {
      id: 'waist',
      objectPosition: 'center 58%',
      scale: 1.06,
      brightness: 0.96,
    },
  ],
  shotSource: HOME_V3_SHOTS.nightFerryCharacter,
} as const

export const HOME_V3_ASSETS = {
  folders: [
    { id: 'all', count: '2,418' },
    { id: 'project', count: '186', active: true },
    { id: 'characters', count: '412' },
    { id: 'studies', count: '97' },
    { id: 'voice', count: '53' },
    { id: 'assets3d', count: '28' },
  ],
  /** 5 × 4 grid; the fox is the selected one so the metadata panel matches it. */
  gridSize: 20,
  selectedIndex: 3,
  meta: {
    model: 'Flux 2 Pro',
    provider: 'fal.ai',
    seed: '20713',
    time: '07-24 23:11',
  },
} as const

export const HOME_V3_TOOL_GLYPHS = ['＋', '▢', '◎', '♪', '▷', '⌗'] as const

/* ── capability stage ─────────────────────────────────────────────────────── */

/**
 * Three capabilities, each one row of `text | demo`. Prose (eyebrow, headline,
 * body) resolves under `Homepage.caps.<id>`; only the model names and the demo's
 * geometry live here.
 *
 * `moreCount` renders as `Homepage.caps.moreModels` so the "+ N" chip stays
 * translatable instead of being a literal in the tag list.
 */
export const HOME_V3_CAPS = [
  {
    id: 'textToImage',
    demo: 'fan',
    tags: ['GPT Image 2', 'Gemini 3 Pro', 'Flux 2 Pro', 'NovelAI V4.5'],
    moreCount: 4,
  },
  {
    id: 'imageToVideo',
    demo: 'video',
    tags: ['Seedance 2.0', 'Kling 2.6', 'Veo 3.1', 'Gemini Omni Flash'],
  },
  {
    id: 'imageTo3d',
    demo: 'turntable',
    tags: ['Rodin Gen-2.5', 'Hunyuan3D v3.1 Pro', 'Trellis 2'],
  },
] as const

export type HomeV3Cap = (typeof HOME_V3_CAPS)[number]

/**
 * The video demo is one continuous shot, not six pictures: a slow push-in across
 * the clip, so the filmstrip reads as frames of the same take. Four unrelated
 * stills in a row read as "four images" and the row stops saying "video".
 */
export const HOME_V3_VIDEO_DEMO = {
  shot: HOME_V3_SHOTS.nightFerryShot,
  model: 'Seedance 2.0',
  spec: '5s · 24fps',
  elapsed: '00:02',
  duration: '00:05',
  /** Playhead position, in percent — the scrub fill and its knob share it. */
  progress: 42,
  currentFrame: 2,
  frames: Array.from({ length: 6 }, (_, k) => ({
    scale: +(1 + k * 0.045).toFixed(3),
    brightness: +(1 - k * 0.03).toFixed(2),
  })),
} as const

/* ── model rails ──────────────────────────────────────────────────────────── */

/**
 * A rail needs at least this many cards before it can overflow a desktop
 * viewport. Below it the arrows would be dead controls, so they are not drawn.
 */
export const HOME_V3_RAIL_ARROW_MIN = 6

/** One arrow press moves about two cards. */
export const HOME_V3_RAIL_STEP = 660

/**
 * The four rails, in page order. Contents come from `getAvailableModels()` at
 * build time, not from a list kept here: the catalog gets a monthly audit
 * (docs/references/model-catalog.md) and a hand-written copy would start
 * advertising models the product can no longer run.
 */
export const HOME_V3_RAIL_GROUPS = [
  { id: 'image', outputType: 'IMAGE', href: ROUTES.STUDIO_IMAGE },
  { id: 'video', outputType: 'VIDEO', href: ROUTES.STUDIO_VIDEO },
  { id: 'audio', outputType: 'AUDIO', href: ROUTES.STUDIO_AUDIO },
  { id: 'model3d', outputType: 'MODEL_3D', href: ROUTES.STUDIO_3D },
] as const

/**
 * Every catalog entry has a locally cached original asset from its model owner
 * or exact checkpoint page. Keeping the files local avoids third-party tracking
 * and prevents an upstream social image change from silently changing the home.
 */
export function getHomeV3ModelCover(
  modelId: string,
  outputType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D',
) {
  if (modelId === 'gpt-image-2') {
    return '/homepage/production/models/image/gpt-image-2.png'
  }

  const directory = {
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    MODEL_3D: 'model3d',
  }[outputType]
  return `/homepage/production/models/${directory}/${modelId}.webp`
}

/** A real, self-contained GLB rendered by the shared interactive viewer. */
export const HOME_V3_TURNTABLE = {
  model: '/homepage/production/model3d/moon-lantern-fox-v1.glb',
  shot: '/homepage/production/model3d/moon-lantern-fox-poster-v1.webp',
  alt: 'Moon Lantern Fox',
  spec: 'Moon Lantern Fox · glb',
} as const
