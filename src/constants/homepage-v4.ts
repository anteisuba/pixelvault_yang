import { ROUTES } from '@/constants/routes'
import type { AppLocale } from '@/i18n/routing'

/**
 * v4 marketing home — the paging deck.
 *
 * Domain contract, page/station tables and hard constraints:
 * `docs/references/pages/home.md`.
 *
 * Every number in this file was lifted from the accepted slide prototype's
 * `<style>` / engine, and this file is now their only home so the skin and the
 * engine cannot drift apart: the motion numbers below are written onto the
 * domain root as CSS custom properties by `HomeV4Deck`, and `home-v4.css` reads
 * them from there. One number, one home — change the constant, not the CSS.
 *
 * Asset names come from `public/homepage/v4/_manifest.md` — the prototype spelled
 * them `asset-NN.*`, that manifest is the translation table.
 */

/* ── 引擎：输入阈值与节拍 ─────────────────────────────────────────── */

/**
 * Wheel/touch/keyboard routing plus the transition clock. `LOCK_MS` is
 * deliberately a hair longer than `PAGE_MS`: the lock has to outlive the slide,
 * or a trackpad's tail delta lands mid-flight and double-steps the deck.
 */
export const HOME_V4_ENGINE = {
  /** One vertical page slide. Published as `--dur`. */
  PAGE_MS: 850,
  /** Input is ignored for this long after a step. */
  LOCK_MS: 900,
  /** Accumulated `wheel` deltaY that counts as one step. */
  WHEEL_THRESHOLD: 46,
  /** Swipe distance (px) that counts as one step. */
  TOUCH_THRESHOLD_PX: 52,
} as const

/**
 * Three-layer parallax. The layers run on their own clocks so that at the moment
 * the page lands they are still sliding inside it — that lag is the depth.
 * Vertical numbers are `vh`, the horizontal (station) ones `vw`.
 */
export const HOME_V4_PARALLAX = {
  /** Background layer, slowest. */
  L1_MS: 1050,
  /* The text layer has no entry: it runs on `PAGE_MS`, the page's own clock. */
  /** Visual blocks, fastest. */
  L3_MS: 680,
  /** Cross-fade of a horizontal station's pages. */
  STATION_FADE_MS: 750,
  VERTICAL_VH: { L1: 7, L2: 13, L3: 22 },
  HORIZONTAL_VW: { L1: 6, L2: 11, L3: 18 },
} as const

/** Left-rail dots: each title slides in one beat after the one above it. */
export const HOME_V4_DOTS_STAGGER_MS = 18

/* ── 开场页演出 ──────────────────────────────────────────────────── */

/**
 * The opening runs its intro once per entry, then keeps a resident rotation:
 * every `ROTATE_INTERVAL_MS` one random cell cross-fades to a spare, and the
 * cell's outgoing shot goes back into the spare pool.
 *
 * The SPEC did this by copying two base64 blobs out of later pages at runtime.
 * That hack is retired — `HOME_V4_STRIP_SPARES` are ordinary paths.
 */
export const HOME_V4_OPENING = {
  /** Play the intro this long after the page becomes active. */
  ENTER_DELAY_MS: 300,
  /** …and this long after first paint, where nothing has moved yet. */
  FIRST_PAINT_DELAY_MS: 450,
  /** Headline mask lifts. */
  HERO_MS: 150,
  /** First strip cell appears. */
  STRIP_START_MS: 620,
  /** Each following cell. */
  STRIP_STAGGER_MS: 60,
  /** Note line + provider marquee + scroll cue, together. */
  TAIL_MS: 1550,
  /** Resident rotation period. */
  ROTATE_INTERVAL_MS: 5200,
  /** Cross-fade window: `b` on top at full opacity before `a` takes the new src. */
  SWAP_MS: 900,
} as const

/** 收尾页：CTA 收口 → 品牌帽尾升入 → 单行 footer，一遍即止。 */
export const HOME_V4_FINALE = {
  ENTER_DELAY_MS: 350,
  HERO_MS: 200,
  MARK_MS: 500,
  FOOT_MS: 800,
  /** Same figure the v3 footer prints; the page states it, so it is not a `new Date()`. */
  COPYRIGHT_YEAR: 2026,
} as const

/* ── 开场作品墙 ──────────────────────────────────────────────────── */

/**
 * Ten real archive results — the page carries no brand colour of its own, so
 * every colour on the first screen comes from these. Re-encoded to 480×640 from
 * the 1086px originals kept in `public/homepage/production/`: this strip caps
 * each cell at 120px wide, so the originals were shipping ~10× the pixels they
 * drew.
 */
export const HOME_V4_STRIP = [
  { id: 'lunaMoth', src: '/homepage/v4/hero-01-luna-moth-480.webp' },
  {
    id: 'desertObservatory',
    src: '/homepage/v4/hero-02-desert-observatory-480.webp',
  },
  { id: 'blackClay', src: '/homepage/v4/hero-03-black-clay-480.webp' },
  {
    id: 'risographLaundry',
    src: '/homepage/v4/hero-04-risograph-laundry-480.webp',
  },
  { id: 'frostFlower', src: '/homepage/v4/hero-05-frost-flower-480.webp' },
  { id: 'watchRobot', src: '/homepage/v4/hero-06-watch-robot-480.webp' },
  { id: 'snowTrain', src: '/homepage/v4/hero-07-snow-train-480.webp' },
  { id: 'glacialRiver', src: '/homepage/v4/hero-08-glacial-river-480.webp' },
  { id: 'rubyChair', src: '/homepage/v4/hero-09-ruby-chair-480.webp' },
  { id: 'cenoteDiver', src: '/homepage/v4/hero-10-cenote-diver-480.webp' },
] as const

/**
 * Rotation pool. Two is enough: one is out on the wall while the other waits.
 *
 * ⚠ Written as literal paths rather than `HOME_V4_STORY.*`: that constant is
 * declared further down this file, so reading it here would hit the temporal
 * dead zone at module load.
 */
export const HOME_V4_STRIP_SPARES = [
  '/homepage/production/umbrella/umbrella-kf5-farewell.webp',
  '/homepage/production/umbrella/umbrella-kf3-hydrangea.webp',
] as const

/**
 * 作品墙的取数口径。墙上真正画的是**公开画廊里最新的公开作品**
 * （`getHomeShowcaseShots()`），上面那两组静态图退成兜底：构建期取不到数、
 * 查询失败、或库里合格作品不足时，用它们把墙补满。
 *
 * `CELL_COUNT` 直接读 `HOME_V4_STRIP.length` —— 格子数只有一个家。
 */
/**
 * 墙上一格的图。服务端取数、客户端演出共用的契约，所以住在常量里而不是
 * `homepage-showcase.service.ts` —— 那是 `server-only` 模块，客户端组件
 * 连类型都不该从那里引。`id` 只作 React key，不打印。
 */
export interface HomeV4ShowcaseShot {
  id: string
  src: string
}

export const HOME_V4_SHOWCASE = {
  /** 墙上的格子数。 */
  CELL_COUNT: HOME_V4_STRIP.length,
  /** 轮换备胎的最少张数：一张在墙上时另一张在等，少于 2 张轮换就停了。 */
  SPARE_COUNT: HOME_V4_STRIP_SPARES.length,
  /** 一次最多下发几张（格子 + 备胎）。多出来的只是更长的轮换池。 */
  POOL_LIMIT: 24,
  /**
   * 先按最新捞多少行，再在服务端筛掉横图。竖版比例是运气问题，
   * 所以捞的行数要显著多于 `POOL_LIMIT`。
   */
  QUERY_LIMIT: 72,
} as const

/**
 * 人工置顶：这里列出的 generation id 排在墙的最前面，顺序即本数组顺序。
 *
 * **维护方式**：在画廊里找到想置顶的作品，复制它的 generation id（详情页 URL
 * 末段），加进这个数组，重新部署即可。删掉即恢复「按最新」。
 *
 * ⚠ 置顶会**跳过竖版比例筛选**（自动选片才按 3:4 挑竖图；人工点名的以人为准），
 * 但**不会**跳过公开性检查 —— 非公开 / 非图片 / 未完成 / 没有缩略图的作品，
 * 即使 pin 了也不会出现在首页。
 */
export const HOME_V4_SHOWCASE_PINNED: readonly string[] = []

/**
 * 人工黑名单：这里列出的 generation id 永远不上首页作品墙，
 * 即使它是最新的公开作品。
 *
 * **维护方式**：同上，把 generation id 加进数组即可。用于把不适合当门面的
 * 公开作品挡在首屏之外，**不需要**把它从画廊里撤下来。
 */
export const HOME_V4_SHOWCASE_BLOCKLIST: readonly string[] = []

/* ── 功能页（P2）：共用素材、字形与节拍 ──────────────────────────── */

/**
 * 「借伞」— one short film's material, shared by feature pages 04 / 05 / 06 so
 * the three read as one story rather than three stock demos. A Japanese high
 * school in the rainy season: she forgets her umbrella, he tilts his over her
 * and walks the rest of the way with a wet right shoulder.
 *
 * The SPEC filled these three pages by *copying blobs between them at runtime*
 * (`fn5Media` / `fn6Media` read `#fn4-out video`'s src, `.cn img`'s src…). That
 * hack is retired: every page states its own path, and the pages stay
 * independent of each other's DOM and of the order they are visited in.
 *
 * ⚠ The three `shot*` keys are **slots on the pages**, not descriptions of the
 * frames — they are the order the canvas script is written and the nodes are
 * laid out in. The names date from the placeholder story this replaced; what
 * each slot actually shows is the label in the message files.
 */
export const HOME_V4_STORY = {
  /** 分镜 01 · 昇降口 — she watches the rain with no umbrella. */
  shotDeck: '/homepage/production/umbrella/umbrella-kf1-entrance.webp',
  /** 分镜 02 · 共伞 — the over-shoulder shot, the umbrella tilting her way. */
  shotDeparture: '/homepage/production/umbrella/umbrella-kf2-shared.webp',
  /** 分镜 03 · 商店街 — the arcade, where the rain goes quiet. */
  shotPullback: '/homepage/production/umbrella/umbrella-kf4-arcade.webp',
  /** Character anchor: both of them from behind, under the one umbrella. */
  anchor: '/homepage/production/umbrella/umbrella-kf3-hydrangea.webp',
  poster: '/homepage/production/umbrella/umbrella-kf5-farewell.webp',
  clip: '/homepage/production/umbrella/umbrella-film-30s.mp4',
} as const

/**
 * Glyphs the mock UIs print. Marks, not words — they read the same in all three
 * locales, so they stay out of the message files (same call as the numbered
 * eyebrows).
 */
export const HOME_V4_GLYPHS = {
  play: '▶',
  /* Two heavy bars, not U+23F8 ⏸ — that codepoint defaults to emoji
     presentation, so it would come out as a colour glyph next to the black
     ▶ it replaces. U+275A is dingbats: text presentation everywhere. */
  pause: '❚❚',
  search: '⌕',
  note: '♪',
  plus: '＋',
  send: '↑',
  arrow: '→',
} as const

/**
 * The one breakpoint the deck's mobile layouts are cut at. Feature page 05 is
 * the only performance whose *timeline* differs between the two, so it asks
 * `matchMedia` for this at play time — see `HOME_V4_FN_CANVAS`.
 */
export const HOME_V4_MOBILE_QUERY = '(max-width: 768px)'

/* ── 01 图片：工作台 → 打字机 → 生成 → 四格 ───────────────────────── */

/**
 * The four models the mock workbench fires at once, in tile order. `name` is a
 * product name — never translated, and deliberately the shorthand the real bar
 * prints (`Gemini 3 Pro`), not the catalogue's full `Gemini 3 Pro Image`.
 *
 * `shot` is that model's own answer to `v4.fn.image.prompt`: four real in-app
 * results of one prompt, re-encoded to 480×640 from what each model returned
 * (880×1184 … 1536×2048) because a tile draws ~180px wide.
 *
 * ⚠ Name and shot are one row on purpose — the page's whole claim is *which*
 * model drew *which* picture, and two parallel arrays would let them drift
 * apart with nothing failing.
 */
export const HOME_V4_FN_IMAGE_MODELS = [
  {
    name: 'GPT Image 2',
    shot: '/homepage/production/quad/quad-gpt-image-2.webp',
  },
  {
    name: 'Gemini 3 Pro',
    shot: '/homepage/production/quad/quad-gemini-3-pro.webp',
  },
  {
    name: 'FLUX 2 Pro',
    shot: '/homepage/production/quad/quad-flux-2-pro.webp',
  },
  {
    name: 'Seedream 5.0',
    shot: '/homepage/production/quad/quad-seedream-5-0.webp',
  },
] as const

/**
 * Typing is per character, so the reveal is chained off the *end of the typing*
 * rather than a wall-clock offset — a longer en/ja prompt then pushes the whole
 * tail back instead of showing results before the prompt is written.
 */
export const HOME_V4_FN_IMAGE = {
  ENTER_DELAY_MS: 500,
  /** One character. */
  TYPE_MS: 46,
  /** Quad starts appearing this long after the last character. */
  REVEAL_MS: 350,
} as const

/* ── 02 LoRA：逐个挂载 → 触发词弹入 → 出图位 ─────────────────────── */

/**
 * Library rows. `base` is the base model the LoRA is cut for — an uppercase
 * category plus a product name, the same all-Latin shorthand the real library
 * prints, so it stays out of the message files.
 */
/**
 * The library rows. `base` is the base model the LoRA is cut for — an uppercase
 * category plus a product name, the same all-Latin shorthand the real library
 * prints, so it stays out of the message files.
 *
 * ⭐ Every one of these is a **real Civitai LoRA that this page's four shots
 * were actually generated with** (except `water`, which stays unmounted — see
 * `HOME_V4_FN_LORA_MOUNTS`). They are all cut for **Anima**, and that is the
 * point: the previous cast was three LoRAs on three different base models
 * (Illustrious / FLUX / Pony V6), a stack that **cannot be run** — mounting
 * across architectures is not a quality problem, it fails to load. The page was
 * advertising an impossible configuration. See findings ledger L3 for how the
 * product let that happen: the LoRA library does not filter by the mounted base
 * model, so its first screen offers SDXL/Pony rows to an Anima rack with no
 * warning.
 */
/**
 * ⚠ Order is not mount order — the rack lights cards in
 * `HOME_V4_FN_LORA_MOUNTS` order wherever they sit. `water` is third **on
 * purpose**: it is the one row cut for a different base, it never lights, and
 * the library column is capped at roughly four rows, so anywhere below that it
 * would be invisible and the one card that says something would say it under
 * the fold.
 */
export const HOME_V4_FN_LORA_CARDS = [
  { id: 'flatline', base: 'STYLE · Anima' },
  { id: 'figure', base: 'STYLE · Anima' },
  { id: 'water', base: 'STYLE · SDXL' },
  { id: 'pose', base: 'POSE · Anima' },
  { id: 'detail', base: 'DETAIL · Anima' },
  { id: 'light', base: 'LIGHT · Anima' },
] as const

/**
 * The five the demo mounts, in mount order. The sixth card stays in the library
 * — a rack that fills itself completely reads as a fixed list rather than a
 * choice — and it is deliberately the one cut for a *different* base, which is
 * what「挂不上」 actually looks like.
 *
 * `trigger` is prompt syntax, never translated. **`null` is not a gap**: a
 * slider LoRA and a detail LoRA genuinely have no trigger word, and printing
 * one for every mount would be a lie about how they work. Only the three that
 * have one appear in the prompt row.
 *
 * `weight` is what the rack shows at rest. The two style LoRAs sit at the ends
 * of their own axis instead — see `HOME_V4_FN_LORA_OUTS`.
 */
export const HOME_V4_FN_LORA_MOUNTS = [
  { id: 'flatline', trigger: '@flatline', weight: 2 },
  { id: 'figure', trigger: 'f1gur3', weight: 0.1 },
  { id: 'pose', trigger: null, weight: 0.3 },
  { id: 'detail', trigger: null, weight: 0.6 },
  { id: 'light', trigger: 'dispersion', weight: 0.4 },
] as const

/**
 * The four output tiles, left to right. ⭐ All four come off **one mount list
 * and one seed** — the only thing that changes across them is the pair of
 * numbers in `cel` / `solid`, which is why the tile prints them. Four shots of
 * the same character where only two numbers moved is the whole argument of the
 * page: the weight is a continuous axis, not a toggle.
 *
 * ⚠ `0.1`, not `0`, at each end — the product's own floor
 * (`LoraSchema.scale` is `z.number().min(0.1)`; 0 comes back 400). Printing the
 * real floor keeps the tile honest about what the workbench can express.
 */
export const HOME_V4_FN_LORA_OUTS = [
  {
    id: 'w1',
    cel: 2,
    solid: 0.1,
    shot: '/homepage/production/lora/lora-body-1.webp',
  },
  {
    id: 'w2',
    cel: 1.4,
    solid: 0.7,
    shot: '/homepage/production/lora/lora-body-2.webp',
  },
  {
    id: 'w3',
    cel: 0.7,
    solid: 1.4,
    shot: '/homepage/production/lora/lora-body-3.webp',
  },
  {
    id: 'w4',
    cel: 0.1,
    solid: 2,
    shot: '/homepage/production/lora/lora-body-4.webp',
  },
] as const

/**
 * ⚠ These are chained, not independent: mounts must finish before the trigger
 * words drop, and the trigger words before the shots. Five mounts and four
 * shots is more beats than the previous three-and-two, so the steps were cut to
 * keep the whole run near five seconds — a page the reader scrolls past in
 * three is not worth animating.
 */
/**
 * The top of the weight scale the rack draws against — the product's own
 * ceiling (`provider-capabilities.ts`, runner `loraScale: { min: 0.1, max: 2 }`).
 *
 * ⚠ The bar is `weight / MAX`, **not** `weight`. A mount at 2.0 is a legal,
 * commonly-used value here — the shots on this page were generated at exactly
 * that — and dividing by 1 sent the fill to 200% and pushed it straight through
 * the end of the track and over its own number.
 */
export const HOME_V4_FN_LORA_WEIGHT_MAX = 2

export const HOME_V4_FN_LORA = {
  ENTER_DELAY_MS: 400,
  /** First mount lands, then one every `MOUNT_STEP_MS`. Five of them. */
  MOUNT_START_MS: 500,
  MOUNT_STEP_MS: 420,
  /** Trigger words drop into the prompt row after the last mount lands. */
  TRIGGER_START_MS: 2700,
  TRIGGER_STEP_MS: 200,
  /** Shots fade up last, left to right. Four of them. */
  OUT_START_MS: 3800,
  OUT_STEP_MS: 250,
} as const

/* ── 03 声音：配音聊天室 ─────────────────────────────────────────── */

/**
 * Three messages, each with the waveform its voice note draws and the clip it
 * actually plays. The bar heights are percentages of the track and carry no
 * meaning beyond looking like speech — they are data, not layout, which is why
 * they live here and not in the CSS.
 *
 * `clips` is one real file per (line × locale): the visitor hears the line in
 * the language they are reading, spoken by a Fish Audio S2.1 voice this product
 * generated through `/api/generate-audio` (see `_manifest.md` in the folder for
 * the nine voice ids). One row per line rather than two parallel structures —
 * same call as `HOME_V4_FN_IMAGE_MODELS`: the waveform and the sound it draws
 * must not be able to drift apart.
 *
 * `avatar` is that speaker's face — a cel-shaded portrait this product drew on
 * GPT Image 2, one per line, and the same file serves both the chat bubble and
 * the voice picker in the input row. Each picture is keyed to the hue the old
 * gradient chips used (qing 粉紫 / lei 蓝 / ke 金), because 「颜色 = 谁在说」
 * is the only thing tying the picker back to the messages above it.
 *
 * ⚠ The `satisfies` clause is the guard that a locale cannot be forgotten: drop
 * one and this file stops compiling, rather than the page 404ing at play time.
 */
export const HOME_V4_FN_AUDIO_LINES = [
  {
    id: 'qing',
    mine: false,
    wave: [87, 84, 54, 43, 78, 89, 71, 33, 63, 88, 83, 53, 44, 79, 89, 70],
    avatar: '/homepage/production/voice/avatar-qing.webp',
    clips: {
      zh: '/homepage/production/voice/voice-qing-zh.mp3',
      ja: '/homepage/production/voice/voice-qing-ja.mp3',
      en: '/homepage/production/voice/voice-qing-en.mp3',
    },
  },
  {
    id: 'lei',
    mine: true,
    wave: [59, 37, 74, 89, 75, 39, 58, 86, 86, 59, 38, 75, 89],
    avatar: '/homepage/production/voice/avatar-lei.webp',
    clips: {
      zh: '/homepage/production/voice/voice-lei-zh.mp3',
      ja: '/homepage/production/voice/voice-lei-ja.mp3',
      en: '/homepage/production/voice/voice-lei-en.mp3',
    },
  },
  {
    id: 'ke',
    mine: false,
    wave: [
      78, 89, 71, 33, 63, 88, 83, 53, 44, 79, 89, 70, 32, 64, 88, 83, 52, 45,
    ],
    avatar: '/homepage/production/voice/avatar-ke.webp',
    clips: {
      zh: '/homepage/production/voice/voice-ke-zh.mp3',
      ja: '/homepage/production/voice/voice-ke-ja.mp3',
      en: '/homepage/production/voice/voice-ke-en.mp3',
    },
  },
] as const satisfies readonly {
  id: string
  mine: boolean
  wave: readonly number[]
  avatar: string
  clips: Readonly<Record<AppLocale, string>>
}[]

export const HOME_V4_FN_AUDIO = {
  ENTER_DELAY_MS: 400,
  /** First bubble lands, then one every `MSG_STEP_MS`. */
  MSG_START_MS: 500,
  MSG_STEP_MS: 900,
  /** A bubble's waveform grows this long after the bubble itself arrives. */
  PLAY_DELAY_MS: 380,
  /** Chat-bubble avatar, matching `.fn-audio .ava` in `home-v4.css`. */
  AVATAR_PX: 38,
  /** The same face in the voice picker, matching `.fn-audio .pick`. */
  PICK_PX: 30,
} as const

/* ── 04 视频：全能参考输入框 ─────────────────────────────────────── */

/** The three reference capsules, top to bottom. `thumb` is the pill's picture. */
export const HOME_V4_FN_VIDEO_REFS = [
  { id: 'shot', thumb: HOME_V4_STORY.shotDeck, glyph: HOME_V4_GLYPHS.play },
  { id: 'anchor', thumb: HOME_V4_STORY.anchor, glyph: null },
  { id: 'voice', thumb: null, glyph: HOME_V4_GLYPHS.note },
] as const

/** Composer tool row. Marks, not words. */
export const HOME_V4_FN_VIDEO_TOOLS = ['＋', '⬡', '▤', '✥'] as const

export const HOME_V4_FN_VIDEO = {
  ENTER_DELAY_MS: 400,
  /** First capsule lands, then one every `PILL_STEP_MS`. */
  PILL_START_MS: 400,
  PILL_STEP_MS: 550,
  /** Prompt line appears and the typewriter starts. */
  PROMPT_MS: 2150,
  /**
   * One character. The cut lands at `PROMPT_MS + length × TYPE_MS +
   * OUT_AFTER_TYPE_MS`, so this number is the only lever against the length of
   * `v4.fn.video.prompt` — 42ms was cut for a 23-character Chinese line, and
   * the full three-shot brief that replaced it is 64 / 138 / 71 characters.
   * At 28ms the three locales land at 4.8s / 6.8s / 5.0s.
   */
  TYPE_MS: 28,
  /**
   * The cut appears this long after the last character. The SPEC hard-coded the
   * whole thing as one 3950ms wall-clock offset; chaining it off the typing
   * instead keeps the order (prompt → send button lights → cut) true whatever
   * the locale's line length is.
   */
  OUT_AFTER_TYPE_MS: 834,
  /** Pill thumbnail, matching `.fn-video .pill img` in `home-v4.css`. */
  THUMB_PX: 24,
} as const

/* ── 05 画布：助手 → 剧本 → 节点 → 成片 ──────────────────────────── */

/** The three shots, in script order. Ids double as message keys. */
export const HOME_V4_FN_CANVAS_SHOTS = [
  'deck',
  'departure',
  'pullback',
] as const

/** Node thumbnails on the mini canvas, matching `.s3 .cn img` / `.cnv video`. */
export const HOME_V4_FN_CANVAS_THUMBS = {
  SHOT: { W: 110, H: 62 },
  CUT: { W: 222, H: 125 },
} as const

/**
 * Two timelines, because the two layouts tell the story differently: on desktop
 * the three windows stand side by side and the *hand-off* is the point (a ghost
 * flies from one window into the next), on mobile they are one carousel and the
 * hand-off is the step change itself, so the flight is dropped and every beat
 * shifts.
 */
export const HOME_V4_FN_CANVAS = {
  ENTER_DELAY_MS: 400,
  /** A ghost is removed this long after it launches — see `.flyer` in the CSS. */
  FLY_LIFE_MS: 820,
  /** The script chip shrinks into the second window's title. */
  CHIP_FLY_SCALE: 0.55,
  /** A shot card grows slightly as it lands on the canvas. */
  CARD_FLY_SCALE: 1.1,
  PC: {
    MSG_MS: [300, 1150],
    CHIP_MS: 1950,
    HANDOFF_MS: 2650,
    SCRIPT_ON_MS: 3350,
    ROW_IN_MS: 3500,
    ROW_SENT_MS: 3950,
    NODE_IN_MS: 4600,
    ROW_STEP_MS: 450,
    WIRES_MS: 5900,
    CUT_MS: 6700,
  },
  MOBILE: {
    MSG_MS: [350, 1150],
    CHIP_MS: 1900,
    STAGE_SCRIPT_MS: 2800,
    ROW_IN_MS: 3200,
    ROW_SENT_MS: 3550,
    ROW_STEP_MS: 430,
    STAGE_BOARD_MS: 5150,
    NODE_IN_MS: 5550,
    NODE_STEP_MS: 380,
    WIRES_MS: 6850,
    CUT_MS: 7550,
  },
} as const

/* ── 06 资源库：归档飞入 → 涌入 → 回流飞出 ───────────────────────── */

/**
 * The ten library tiles, in grid order. `kind` picks the tile's body:
 *
 * - `shot` — a picture from the archive (`src`),
 * - `wave` — the voice note, drawn from `wave`,
 * - `swatch` — a flat gradient tile (LoRA / 3D), painted by `data-tile`,
 * - `prompt` — the saved prompt card,
 * - `count` — the 「还在库里」 tally.
 *
 * `hero` marks the one tile that flies back out into the reuse slot, and
 * `arrival` marks the three that drop in from the pages above (the SPEC's
 * `.far`).
 */
export const HOME_V4_FN_VAULT_CELLS = [
  {
    id: 'cut',
    kind: 'shot',
    src: HOME_V4_STORY.poster,
    arrival: true,
    hero: false,
  },
  {
    id: 'anchor',
    kind: 'shot',
    src: HOME_V4_STORY.anchor,
    arrival: true,
    hero: true,
  },
  { id: 'voice', kind: 'wave', src: null, arrival: true, hero: false },
  {
    id: 'shotDeck',
    kind: 'shot',
    src: HOME_V4_STORY.shotDeck,
    arrival: false,
    hero: false,
  },
  {
    id: 'shotPullback',
    kind: 'shot',
    src: HOME_V4_STORY.shotPullback,
    arrival: false,
    hero: false,
  },
  { id: 'lora', kind: 'swatch', src: null, arrival: false, hero: false },
  { id: 'prompt', kind: 'prompt', src: null, arrival: false, hero: false },
  { id: 'threed', kind: 'swatch', src: null, arrival: false, hero: false },
  {
    id: 'shotDeparture',
    kind: 'shot',
    src: HOME_V4_STORY.shotDeparture,
    arrival: false,
    hero: false,
  },
  { id: 'count', kind: 'count', src: null, arrival: false, hero: false },
] as const

/** The voice tile's waveform. Same kind of data as the audio page's. */
export const HOME_V4_FN_VAULT_WAVE = [
  68, 29, 60, 86, 86, 60, 29, 68, 89, 82, 51, 39, 75, 89,
] as const

/** Filter chips over the grid. Ids double as message keys; the first is on. */
export const HOME_V4_FN_VAULT_FILTERS = [
  'all',
  'image',
  'video',
  'audio',
  'lora',
] as const

export const HOME_V4_FN_VAULT = {
  ENTER_DELAY_MS: 400,
  /** The three arrivals drop in first, one every `ARRIVAL_STEP_MS`. */
  ARRIVAL_START_MS: 350,
  ARRIVAL_STEP_MS: 280,
  /** …then the rest of the library floods in. */
  REST_START_MS: 1450,
  REST_STEP_MS: 80,
  /** The character anchor lights up, then a *copy* flies to the reuse slot. */
  LIFT_MS: 2550,
  FLY_MS: 3000,
  SLOT_MS: 3720,
  CTA_MS: 4150,
  FLY_LIFE_MS: 820,
  FLY_SCALE: 0.85,
  /** What the tally prints. The library is the product; the number is the point. */
  ARCHIVED_COUNT: 1284,
} as const

/* ── 模型区：五个横站 ────────────────────────────────────────────── */

export const HOME_V4_STATION_KEYS = [
  'image',
  'lora',
  'video',
  'audio',
  'threed',
] as const

export type HomeV4StationKey = (typeof HOME_V4_STATION_KEYS)[number]

/**
 * Brands that ship a drawn mark on the identity board. Everything else prints
 * its name as a mono textmark (`mark`), which is why the list is this short —
 * a wrong logo is worse than no logo.
 *
 * `seed` is the composite: the ByteDance wordmark followed by 「Seed」, the
 * research group Seedream / Seedance actually come from.
 */
export const HOME_V4_MODEL_LOGO_KEYS = ['openai', 'gemini', 'seed'] as const

export type HomeV4ModelLogoKey = (typeof HOME_V4_MODEL_LOGO_KEYS)[number]

/**
 * How a model page paints its background.
 *
 * - `cover` — one landscape shot bled over the whole page, darkened by a scrim.
 * - `side` — one portrait shot stood upright on the right, complete and
 *   uncropped, over paper. The identity board keeps the left half.
 * - `wall` — three portrait shots side by side, one triptych across the page.
 *   Mobile shows only the first.
 *
 * A model with `cover: null` falls back to the paper + prompt-card state
 * regardless of what it declares here.
 */
export const HOME_V4_MODEL_LAYOUTS = ['cover', 'side', 'wall'] as const

export type HomeV4ModelLayout = (typeof HOME_V4_MODEL_LAYOUTS)[number]

/**
 * How many of each repeated field a model record carries. Every model in the
 * SPEC has exactly these, and the message files are indexed against them
 * (`v4.models.<key>.plus.0` …), so the counts are what the copy test walks.
 * Changing one here without adding the copy is a test failure, not a blank row.
 */
export const HOME_V4_MODEL_FACETS = {
  TAGS: 3,
  PLUS: 3,
  MINUS: 2,
} as const

export interface HomeV4Model {
  /** Stable id, used for React keys, deep links and message paths. */
  key: string
  /** Product name. A proper noun — never translated. */
  name: string
  /** Eyebrow, e.g. `IMAGE · OPENAI`. Proper nouns — never translated. */
  provider: string
  /**
   * Full-bleed background under `public/`. `null` is the SPEC's
   * 「待站内生成」 state — the page shows the prompt watermark card instead,
   * and the shot still has to be generated in-app (task list in the manifest).
   */
  cover: string | null
  /**
   * ⭐ A video model's page plays the actual clip, not a still of it. `null` for
   * everything else, and for a video model we could not run.
   *
   * `cover` stays required and is used as this video's `poster` — so the page
   * has something to show the instant it lands, and the still is what a visitor
   * sees if the clip is refused (a data-saver profile, a paused-media setting).
   * ⚠ Only `layout: 'cover'` honours this; a `side` portrait or a `wall`
   * triptych has nowhere to put a video.
   *
   * ⚠ These are the **source files, not re-encoded** — owner 2026-08-30:
   * 「作为背景的素材都不要压缩清晰度」. The weight is carried by `preload="none"`
   * plus the deck's own paging instead: only the page you are looking at ever
   * fetches its clip, so a visitor who never opens the video station downloads
   * zero video bytes.
   */
  clip: string | null
  /** Drawn brand mark, or `null` to print `mark` as a textmark instead. */
  logo: HomeV4ModelLogoKey | null
  /**
   * Mono textmark used when there is no drawn logo. All-Latin product
   * shorthand — never translated. `null` exactly when `logo` is set.
   */
  mark: string | null
  layout: HomeV4ModelLayout
  /**
   * Panels 2 and 3 of a `wall`. Empty for every other layout; `cover` is
   * panel 1, so a wall is `[cover, ...wall]`.
   */
  wall: readonly string[]
  /**
   * The shot this page still needs, written as the prompt that will generate
   * it. Set exactly when `cover` is `null`.
   *
   * ⚠ Deliberately **not** translated. It is a generation task addressed to the
   * model, not a sentence addressed to a reader; rendering the Japanese page's
   * card in Japanese would produce a prompt nobody is going to run.
   */
  wantPrompt: string | null
}

/**
 * The five stations, in deck order, each with its models in station order.
 *
 * Language-neutral facts only. Everything a reader actually reads — the
 * positioning line, the price line, the route line, the source badge, the
 * tag chips, the strengths, the weaknesses and both halves of every spec row —
 * lives in `Homepage.v4.models.<key>.*` in all three locales.
 */
export const HOME_V4_STATIONS: Record<
  HomeV4StationKey,
  readonly HomeV4Model[]
> = {
  image: [
    {
      key: 'gpt',
      name: 'GPT Image 2',
      provider: 'IMAGE · OPENAI',
      /* ⚠ `.webp`，不是 `.jpg`：这张是 owner 2026-08-30 亲自出的 3840×2160，
         按「背景素材不压清晰度」落成**无损** WebP（7.17MB，与源 PNG 逐像素一致，
         RMSE 0，而且比 11MB 的源 PNG 还小）。有损档实测 RMSE 1.27–1.50 —— 这张是
         平滑渐变的水墨，正是有损编码最容易起带状的那类画面。 */
      cover: '/homepage/v4/model-gpt-image-2.webp',
      logo: 'openai',
      mark: null,
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'gemini',
      name: 'Gemini 3 Pro Image',
      provider: 'IMAGE · GOOGLE',
      cover: '/homepage/v4/model-gemini-3-pro-image.jpg',
      logo: 'gemini',
      mark: null,
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'flux',
      name: 'FLUX 2 Pro',
      provider: 'IMAGE · BLACK FOREST LABS',
      cover: '/homepage/v4/model-flux-2-pro.jpg',
      logo: null,
      mark: 'FLUX',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'seedream',
      name: 'Seedream 5.0',
      provider: 'IMAGE · BYTEDANCE',
      cover: '/homepage/v4/model-seedream-5.jpg',
      logo: 'seed',
      mark: null,
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'recraft',
      name: 'Recraft V4 Pro',
      provider: 'IMAGE · RECRAFT',
      cover: '/homepage/v4/model-recraft-v4-pro.webp',
      logo: null,
      mark: 'RECRAFT',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'novelai',
      name: 'NovelAI Diffusion V5',
      provider: 'IMAGE · ANLATAN',
      cover: '/homepage/v4/model-novelai-v5.webp',
      logo: null,
      mark: 'NOVELAI',
      layout: 'wall',
      wall: [
        '/homepage/v4/model-novelai-v5-b.jpg',
        '/homepage/v4/model-novelai-v5-c.jpg',
      ],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'illustrious',
      name: 'Illustrious XL',
      provider: 'IMAGE · ONOMA AI · 开源',
      cover: '/homepage/v4/model-illustrious-xl.webp',
      logo: null,
      mark: 'ILLUSTRIOUS',
      layout: 'wall',
      wall: [
        '/homepage/v4/model-illustrious-xl-b.webp',
        '/homepage/v4/model-illustrious-xl-c.webp',
      ],
      clip: null,
      wantPrompt: null,
    },
  ],
  lora: [
    {
      key: 'ill-b',
      name: 'Illustrious XL',
      provider: 'LORA · ONOMA AI · 开源',
      cover: '/homepage/v4/model-lora-illustrious-xl.webp',
      logo: null,
      mark: 'ILLUSTRIOUS',
      layout: 'side',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'wai',
      name: 'WAI-Illustrious',
      provider: 'LORA · RUNNER',
      cover: '/homepage/v4/model-lora-wai-illustrious.webp',
      logo: null,
      mark: 'WAI',
      layout: 'side',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'pencil',
      name: 'Anima Pencil-XL',
      provider: 'LORA · RUNNER',
      cover: '/homepage/v4/model-lora-anima-pencil-xl.webp',
      logo: null,
      mark: 'PENCIL-XL',
      layout: 'side',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'pony',
      name: 'Pony Diffusion V6 XL',
      provider: 'LORA · RUNNER',
      cover: '/homepage/v4/model-lora-pony-v6-xl.webp',
      logo: null,
      mark: 'PONY V6',
      layout: 'side',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'sdxl',
      name: 'SDXL 1.0',
      provider: 'LORA · RUNNER',
      cover: '/homepage/v4/model-lora-sdxl-10.webp',
      logo: null,
      mark: 'SDXL',
      layout: 'side',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'anima',
      name: 'Anima（DiT）',
      provider: 'LORA · RUNNER',
      cover: '/homepage/v4/model-lora-anima-dit.webp',
      logo: null,
      mark: 'ANIMA',
      layout: 'side',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
  ],
  video: [
    {
      key: 'seedance',
      name: 'Seedance',
      provider: 'VIDEO · BYTEDANCE',
      cover: '/homepage/v4/model-seedance.webp',
      logo: 'seed',
      mark: null,
      layout: 'cover',
      wall: [],
      clip: '/homepage/production/models/video/model-seedance.mp4',
      wantPrompt: null,
    },
    {
      key: 'minimax',
      name: 'MiniMax H3',
      provider: 'VIDEO · MINIMAX',
      cover: '/homepage/v4/model-minimax-h3.webp',
      logo: null,
      mark: 'MINIMAX',
      layout: 'cover',
      wall: [],
      clip: '/homepage/production/models/video/model-minimax.mp4',
      wantPrompt: null,
    },
    {
      key: 'wan30',
      name: 'Wan 3.0',
      provider: 'VIDEO · ALIBABA',
      /* Wan 3.0 出的 2 秒 720p 片子抽的第 1.93 秒帧，1280×720 是视频原生分辨率
         ——没有放大，放大等于给一张 720p 的图编造细节。 */
      cover: '/homepage/v4/model-wan-30.jpg',
      logo: null,
      mark: 'WAN 3.0',
      layout: 'cover',
      wall: [],
      clip: '/homepage/production/models/video/model-wan30.mp4',
      wantPrompt: null,
    },
    {
      key: 'horse',
      name: 'HappyHorse 1.1',
      provider: 'VIDEO · ALIBABA',
      cover: '/homepage/v4/model-happyhorse-11.webp',
      logo: null,
      mark: 'HAPPYHORSE',
      layout: 'cover',
      wall: [],
      clip: '/homepage/production/models/video/model-horse.mp4',
      wantPrompt: null,
    },
    {
      key: 'kling',
      name: '可灵',
      provider: 'VIDEO · KLING',
      cover: '/homepage/v4/model-kling.webp',
      logo: null,
      mark: 'KLING',
      layout: 'cover',
      wall: [],
      clip: '/homepage/production/models/video/model-kling.mp4',
      wantPrompt: null,
    },
    {
      key: 'gomni',
      name: 'Gemini Omni Flash',
      provider: 'VIDEO · GOOGLE',
      /* ⚠ 唯一一张**不是该模型自己出**的站内图：Gemini Omni Flash 在本仓库跑不了
         （`generate-video.service.ts` 的 `WORKER_CAPABLE_VIDEO_ADAPTERS` 里没有
         `GEMINI`，每次提交恒 501——见台账 Z 条）。owner 2026-08-29 拍板：跑得了的
         用自己出，跑不了的用 GPT Image 2 代画。出处徽标因此如实写「站内生成 ·
         GPT Image 2」，不许写成 Gemini 出的。
         ⚠ 哪天 501 修好了，这张要换成 Gemini 自己出的帧，徽标一起改。 */
      cover: '/homepage/v4/model-gemini-omni-flash.jpg',
      logo: 'gemini',
      mark: null,
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
  ],
  audio: [
    {
      key: 'fish',
      name: 'Fish Audio S2.1 Pro',
      provider: 'AUDIO · FISH AUDIO',
      cover: '/homepage/v4/model-fish-audio-s21-pro.jpg',
      logo: null,
      mark: 'FISH AUDIO',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'eleven',
      name: 'ElevenLabs',
      provider: 'AUDIO · ELEVENLABS',
      cover: '/homepage/v4/model-elevenlabs.jpg',
      logo: null,
      mark: 'ELEVENLABS',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
  ],
  threed: [
    {
      key: 'rodin',
      name: 'Rodin Gen-2.5',
      provider: '3D · HYPER3D',
      cover: '/homepage/v4/model-rodin-gen-25.jpg',
      logo: null,
      mark: 'RODIN',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'hunyuan',
      name: 'Hunyuan3D',
      provider: '3D · TENCENT',
      /* 三跳出来的：GPT Image 2 出源图 → Hunyuan3D v3.1 Pro 出 45.6MB GLB →
         `@google/model-viewer`（与 `ModelViewerInner.tsx` 同包）渲成 1600×900。
         全站第一张真从 GLB 渲出来的图——`moon-lantern-fox-poster-v1.webp` 不是，
         那是参考立绘的再编码。
         ⚠ 跑通它当时要给 worker 打两个补丁（台账 AJ / AK：入参字段名与出参键都
         写错了），补丁已还原——**照现在的代码再点 Hunyuan3D 仍然必失败**。 */
      cover: '/homepage/v4/model-hunyuan3d.jpg',
      logo: null,
      mark: 'HUNYUAN',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'trellis',
      name: 'Trellis 2',
      provider: '3D · MICROSOFT',
      cover: '/homepage/v4/model-trellis-2.jpg',
      logo: null,
      mark: 'TRELLIS',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
    {
      key: 'tripo',
      name: 'TripoSR',
      provider: '3D · TRIPO',
      cover: '/homepage/v4/model-triposr.jpg',
      logo: null,
      mark: 'TRIPO',
      layout: 'cover',
      wall: [],
      clip: null,
      wantPrompt: null,
    },
  ],
}

/** Every model, flattened in deck order — the copy tests and the sheet walk it. */
export const HOME_V4_ALL_MODELS: readonly HomeV4Model[] =
  HOME_V4_STATION_KEYS.flatMap((key) => HOME_V4_STATIONS[key])

/* ── 竖轴：13 页 ─────────────────────────────────────────────────── */

/** Which block of the left rail / mobile toc a page belongs to. */
export type HomeV4PageGroup = 'opening' | 'feature' | 'models' | 'finale'

export interface HomeV4Page {
  /** Stable id. Doubles as the i18n key under `Homepage.v4.pages.*`. */
  id: string
  group: HomeV4PageGroup
  /**
   * Numbered eyebrow, e.g. `01 · IMAGE`. Language-neutral by design, so it stays
   * out of the message files. `null` on the opening (which prints the model
   * count instead) and the finale (which prints nothing).
   */
  eyebrow: string | null
  /** Set on the five model pages: they page sideways before releasing downward. */
  station: HomeV4StationKey | null
}

/**
 * The deck, top to bottom. Thirteen pages: opening, six feature pages, the five
 * model stations, finale.
 *
 * A fourteenth page — a four-column price list of the whole catalogue — shipped
 * briefly and was cut by owner on sight (「这个页面不需要。之前的设计页面也没有
 * 这个」). The deck is back to the prototype's structure: the model region ends
 * at the 3D station and releases straight into the finale.
 */
export const HOME_V4_PAGES: readonly HomeV4Page[] = [
  { id: 'opening', group: 'opening', eyebrow: null, station: null },
  { id: 'image', group: 'feature', eyebrow: '01 · IMAGE', station: null },
  { id: 'lora', group: 'feature', eyebrow: '02 · LORA', station: null },
  { id: 'audio', group: 'feature', eyebrow: '03 · AUDIO', station: null },
  { id: 'video', group: 'feature', eyebrow: '04 · VIDEO', station: null },
  { id: 'canvas', group: 'feature', eyebrow: '05 · CANVAS', station: null },
  { id: 'vault', group: 'feature', eyebrow: '06 · VAULT', station: null },
  { id: 'modelsImage', group: 'models', eyebrow: null, station: 'image' },
  { id: 'modelsLora', group: 'models', eyebrow: null, station: 'lora' },
  { id: 'modelsVideo', group: 'models', eyebrow: null, station: 'video' },
  { id: 'modelsAudio', group: 'models', eyebrow: null, station: 'audio' },
  { id: 'models3d', group: 'models', eyebrow: null, station: 'threed' },
  { id: 'finale', group: 'finale', eyebrow: null, station: null },
]

/** Where the finale's CTA goes — same destination as the footer's 画布 link. */
export const HOME_V4_ROUTES = {
  home: ROUTES.HOME,
  canvas: ROUTES.STUDIO_NODE,
  studio: ROUTES.STUDIO_IMAGE,
  terms: ROUTES.TERMS,
  privacy: ROUTES.PRIVACY,
} as const
