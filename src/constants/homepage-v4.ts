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
 * The top of the weight scale the rack draws against — the product's own
 * ceiling (`provider-capabilities.ts`, runner `loraScale: { min: 0.1, max: 2 }`).
 *
 * ⚠ The bar is `weight / MAX`, **not** `weight`. A mount at 2.0 is a legal,
 * commonly-used value here — the shots on this page were generated at exactly
 * that — and dividing by 1 sent the fill to 200% and pushed it straight through
 * the end of the track and over its own number.
 */
export const HOME_V4_FN_LORA_WEIGHT_MAX = 2

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
  /** What the tally prints. The library is the product; the number is the point. */
  ARCHIVED_COUNT: 1284,
} as const

/* ── v5 长卷：段高、降级门槛与关键帧表 ──────────────────────────── */

/**
 * 长卷的几何与降级门槛（owner 批注 40：方向 B · 连续滚动 + 钉住演示）。
 *
 * 每个功能段是一条 `SECTION_VH` 高的滚动行程，里面钉住一屏（`STAGE_VH`）的演示
 * 卡；滚过的距离除以 `段高 − 一屏` 就是那一段的 `progress`。钉住用的是
 * `position: sticky`，不是 GSAP pin —— sticky 够用，就不把动画库拉进营销域。
 */
export const HOME_V4_SCROLL = {
  /** 钉住区高度，单位 vh。一屏一段，多出来的段高全是 scrub 行程。 */
  STAGE_VH: 100,
  /**
   * 降级后每段直接渲染的进度。⚠ 是 1 不是 0：降级要给的是**结果态**，
   * 不是空态——空态等于把页面的内容藏起来。
   */
  REST_PROGRESS: 1,
  /** 这个宽度及以下不钉住、不 scrub（ui-defaults 的移动断点）。 */
  MOBILE_MAX_PX: 767,
  /** 屏高低于这个值走矮视口收缩（owner 批注 50）。 */
  SHORT_VIEWPORT_PX: 900,
  /**
   * 目录跳页 / 键盘跳段时那一段被直接置到的进度。落地要点原文：
   * 「键盘翻页跳到 1.0」。
   */
  JUMP_PROGRESS: 1,
} as const

/**
 * 六段演示的关键帧表 —— **状态机，不是时间线**。
 *
 * 每个条目是这一段 `progress`（0–1）轴上的一个区间或一个阈值，求值在
 * `src/lib/home-v4-beats.ts`，那里是纯函数，测试直接在 0 / 0.3 / 0.7 / 1.0 上
 * 钉住结果。⚠ 这里没有一个毫秒数：段的快慢由读者的滚轮决定，不由时钟决定。
 *
 * 表的形状统一按 UX 板给的节拍读：**0.0 空态 · 0.3 输入完 · 0.7 出图 · 1.0
 * 结果 + CTA**，各段在这个骨架上自定自己的分镜。
 *
 * `[from, to]` 是一批元素依次落位的区间（第 i 个在 `from + i/n` 处落位）；
 * 单个数字是一个开关的阈值。
 */
export const HOME_V4_BEATS = {
  /** 01 图片：写 prompt → 四家出图 → 结果 + CTA。 */
  image: {
    /** 打字区间：写到 0.30 收笔。 */
    type: [0.04, 0.3],
    /** 四格依次揭开。 */
    tiles: [0.42, 0.86],
    /** 结果态：CTA 亮起。 */
    cta: 0.9,
  },
  /** 02 LoRA：挂载 → 触发词 → 权重轴四张对照图。 */
  lora: {
    mounts: [0.04, 0.22],
    triggers: [0.22, 0.3],
    outs: [0.4, 0.86],
    cta: 0.92,
  },
  /** 03 声音：三句台词落位 → 波形画出 → 输入行就绪。 */
  audio: {
    lines: [0.04, 0.3],
    /** 波形比气泡慢一拍：气泡是「到了」，波形是「这条有声音」。 */
    waves: [0.1, 0.4],
    compose: 0.62,
    cta: 0.88,
  },
  /** 04 视频：三个参考落槽 → 写 brief → 发送键亮 → 出片。 */
  video: {
    pills: [0.02, 0.18],
    type: [0.18, 0.3],
    send: 0.34,
    out: 0.62,
    cta: 0.9,
  },
  /** 05 画布：助手 → 剧本 → 节点；`steps` 的 0–1 线性映到 0–2 号步骤。 */
  canvas: {
    steps: [0.05, 0.9],
    /** 步骤浮点数到这里才放成片（第三步已经坐稳）。 */
    cutAtStep: 1.9,
    cta: 0.95,
  },
  /** 06 资源库：新作品落库 → 库涌满 → 选中角色锚 → 复用位填上。 */
  vault: {
    arrivals: [0.04, 0.18],
    rest: [0.18, 0.3],
    lift: 0.45,
    /** 复用位是连续填充（clip-path），不是开关。 */
    slot: [0.55, 0.75],
    cta: 0.88,
  },
  /** 开场：作品墙随滚动向两侧散开，散开量就是这一段的进度。 */
  opening: {
    /** 最外侧一列散开的距离，单位 vw。 */
    spreadVw: 26,
    /** 标题与副文在散开的后半程淡出。 */
    fade: [0.35, 1],
  },
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
  ],
  lora: [
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

/* ── 竖轴：v5 长卷的九段 ─────────────────────────────────────────── */

/** Which block of the rail / mobile toc a section belongs to. */
export type HomeV4PageGroup = 'opening' | 'feature' | 'models' | 'finale'

export interface HomeV4Section {
  /** Stable id. Doubles as the i18n key under `Homepage.v4.pages.*` and as the
   *  shareable anchor (`/#lora` → `id="home-lora"`). */
  id: string
  group: HomeV4PageGroup
  /**
   * Numbered eyebrow, e.g. `01 · IMAGE`. Language-neutral by design, so it stays
   * out of the message files. `null` where the section prints something else.
   */
  eyebrow: string | null
  /**
   * 段高，单位 vh。`HOME_V4_SCROLL.STAGE_VH` 是钉住的那一屏，多出来的部分就是
   * scrub 行程 —— 250vh 的段有 150vh 可以滚，进度 0–1 摊在这段距离上。
   */
  vh: number
  /**
   * 这一段的演示由段内进度驱动。`false` 的段（开场 / 模型 / 收尾）高度就是一屏，
   * 不钉住、不 scrub —— 模型列表是横滑的，参与 scrub 会和横轴打架。
   */
  scrub: boolean
}

/**
 * 长卷，从上到下九段（owner 批注 40 定的结构，UX 板「推荐结构」那一列）。
 *
 * ⚠ 与 v4 的十三页 snap deck 的差别不只是少了四页：**五个整屏模型站合并成了
 * 终页前的一段横滑列表**（每模态一行），模型不再参与竖向翻页。旧结构见 git。
 */
export const HOME_V4_SECTIONS: readonly HomeV4Section[] = [
  { id: 'opening', group: 'opening', eyebrow: null, vh: 100, scrub: false },
  {
    id: 'image',
    group: 'feature',
    eyebrow: '01 · IMAGE',
    vh: 250,
    scrub: true,
  },
  { id: 'lora', group: 'feature', eyebrow: '02 · LORA', vh: 250, scrub: true },
  {
    id: 'audio',
    group: 'feature',
    eyebrow: '03 · AUDIO',
    vh: 200,
    scrub: true,
  },
  {
    id: 'video',
    group: 'feature',
    eyebrow: '04 · VIDEO',
    vh: 250,
    scrub: true,
  },
  {
    id: 'canvas',
    group: 'feature',
    eyebrow: '05 · CANVAS',
    vh: 250,
    scrub: true,
  },
  {
    id: 'vault',
    group: 'feature',
    eyebrow: '06 · VAULT',
    vh: 200,
    scrub: true,
  },
  { id: 'models', group: 'models', eyebrow: null, vh: 100, scrub: false },
  { id: 'finale', group: 'finale', eyebrow: null, vh: 100, scrub: false },
]

/** `#home-lora` 一类的可分享锚点。段 id → DOM id，一处拼接。 */
export function homeV4SectionAnchor(id: string): string {
  return `home-${id}`
}

/**
 * 模型列表里每一行封面点下去的去处 —— 对应模态的工作台。
 *
 * ⚠ 还**不带模型预选**：站表的 `key`（`gpt` / `flux` …）是首页自己的 id，不是
 * 目录里的 model id，凭它拼一个 `?model=` 参数就是手抄。工作台也还没有读这个
 * 参数的入口。见 `docs/references/pages/home.md` §已知缺口。
 */
export const HOME_V4_STATION_ROUTES: Record<HomeV4StationKey, string> = {
  image: ROUTES.STUDIO_IMAGE,
  lora: ROUTES.STUDIO_LORA,
  video: ROUTES.STUDIO_VIDEO,
  audio: ROUTES.STUDIO_AUDIO,
  threed: ROUTES.STUDIO_3D,
}

/**
 * 每个功能段结束态那颗「去用这个」按钮的去处。
 *
 * ⚠ 段 id → 路由，一处声明；六段的 CTA 都从这里取，⛔ 不在组件里各写各的。
 */
export const HOME_V4_FN_ROUTES: Record<string, string> = {
  image: ROUTES.STUDIO_IMAGE,
  lora: ROUTES.STUDIO_LORA,
  audio: ROUTES.STUDIO_AUDIO,
  video: ROUTES.STUDIO_VIDEO,
  canvas: ROUTES.STUDIO_NODE,
  vault: ROUTES.ASSETS,
}

/** Where the finale's CTA goes — same destination as the footer's 画布 link. */
export const HOME_V4_ROUTES = {
  home: ROUTES.HOME,
  canvas: ROUTES.STUDIO_NODE,
  studio: ROUTES.STUDIO_IMAGE,
  terms: ROUTES.TERMS,
  privacy: ROUTES.PRIVACY,
} as const
