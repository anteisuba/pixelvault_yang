/**
 * 首页 v6「她 + 一个窗口」的常量：滚动长度、素材路径、名单。
 * 施工图：`docs/references/pages/home.md` §v6。文案在 `Homepage.v6.*`。
 */

/** 每段占多少屏的滚动距离（vh）。换段的那一下算在后一段的开头。 */
export const HOME_V6_LEN = {
  wall: 130,
  shots: 240,
  lora: 300,
  voice: 240,
  canvas: 320,
  char: 300,
} as const

export const HOME_V6_SEGS = [
  'shots',
  'lora',
  'voice',
  'canvas',
  'char',
] as const
export type HomeV6Seg = (typeof HOME_V6_SEGS)[number]

export const HOME_V6_TRACK_VH =
  HOME_V6_LEN.wall + HOME_V6_SEGS.reduce((n, k) => n + HOME_V6_LEN[k], 0)

/** 作品墙四列往上走的快慢（乘窗口高）。 */
export const HOME_V6_WALL_SPEED = [0.12, 0.34, 0.2, 0.44] as const

const P = '/homepage/production'
const V6 = '/homepage/v6'

export const HOME_V6_ASSETS = {
  her: `${V6}/her.webp`,
  whale: `${V6}/whale.webp`,
  /** ① 四张同题图（同一句提示词）。第二张是 ⑤ 里两个人点评的那张。 */
  shots: ['flux-2-pro', 'gemini-3-pro', 'gpt-image-2', 'seedream-5-0'].map(
    (k) => `${P}/quad/quad-${k}.webp`,
  ),
  lora: [1, 2, 3, 4].map((i) => `${P}/lora/lora-body-${i}.webp`),
  voiceAvatar: (key: HomeV6Voice) => `${P}/voice/avatar-${key}.webp`,
  voiceAudio: (key: HomeV6Voice, locale: string) =>
    `${P}/voice/voice-${key}-${locale}.mp3`,
  /** ④ 《借伞》：五张关键帧 + 30 秒成片。 */
  keyframes: ['entrance', 'shared', 'hydrangea', 'arcade', 'farewell'].map(
    (k, i) => `${P}/umbrella/umbrella-kf${i + 1}-${k}.webp`,
  ),
  film: `${P}/umbrella/umbrella-film-30s.mp4`,
} as const

export const HOME_V6_VOICES = ['qing', 'lei', 'ke'] as const
export type HomeV6Voice = (typeof HOME_V6_VOICES)[number]

/**
 * 三句台词各语言的原文，和 `public/homepage/production/voice/voice-{key}-{lang}.mp3` 一一对应。
 * 这是音频的内容，不是界面文案：名单里切语言时三种都要用到，所以不进 messages。
 */
export const HOME_V6_VOICE_LINES: Readonly<
  Record<HomeV6Voice, Readonly<Record<'zh' | 'ja' | 'en', string>>>
> = {
  qing: {
    zh: '今晚的画展，八点开始。',
    ja: '今夜の展示は、八時から。',
    en: 'The show opens tonight at eight.',
  },
  lei: {
    zh: '好，我把海报再改一版。',
    ja: '了解。ポスターをもう少し直しておくね。',
    en: "Got it. I'll do one more pass on the poster.",
  },
  ke: {
    zh: '而此刻，馆里的灯一盏盏亮了。',
    ja: 'そのとき、館の灯りが一つずつ点いた。',
    en: 'And just then, the lamps in the hall came on one by one.',
  },
}

/** ④ 三句台词挂在第几个镜头上、谁念。 */
export const HOME_V6_FILM_LINES: readonly (readonly [number, HomeV6Voice])[] = [
  [1, 'lei'],
  [2, 'ke'],
  [4, 'qing'],
]

/** 语音卡波形的格数。 */
export const HOME_V6_BARS = 44

/* ─── 模型她来挑 ─────────────────────────────────────────────── */

export type HomeV6MarkKey =
  | 'openai'
  | 'gemini'
  | 'bytedance'
  | 'novelai'
  | 'minimax'
  | 'fish'
  | 'wan'
  | 'lora'

/** 名单里的品牌标。openai / gemini / lora 是内联路径，其余是文件（来源见 `public/homepage/v6/_manifest.md`）。 */
export const HOME_V6_MARK_FILES: Partial<Record<HomeV6MarkKey, string>> = {
  bytedance: `${V6}/marks/bytedance-color.svg`,
  novelai: `${V6}/marks/novelai.svg`,
  minimax: `${V6}/marks/minimax-color.svg`,
  fish: `${V6}/marks/fishaudio.svg`,
  wan: `${V6}/marks/wan.png`,
}

export type HomeV6RowId =
  | 'gpt'
  | 'gemini'
  | 'seedream'
  | 'novelai'
  | 'lora'
  | 'seedance'
  | 'wan'
  | 'minimax'
  | 'fish'

export interface HomeV6Sample {
  src: string
  /** CSS aspect-ratio，宽/高。 */
  ar: string
}

interface HomeV6RowBase {
  id: HomeV6RowId
  mark: HomeV6MarkKey
  /** 家族名。⛔ 型号（owner 第 49 轮：更新太频繁）。品牌名不翻译。 */
  name: string
}

export type HomeV6Row =
  | (HomeV6RowBase & { tray: 'pics'; samples: readonly HomeV6Sample[] })
  | (HomeV6RowBase & { tray: 'clip'; poster: string; src: string })
  | (HomeV6RowBase & { tray: 'voice' })

const M = `${V6}/models`
const QUAD = `${P}/quad/quad-`

export const HOME_V6_ROSTER: readonly {
  group: 'image' | 'video' | 'audio'
  rows: readonly HomeV6Row[]
}[] = [
  {
    group: 'image',
    rows: [
      {
        id: 'gpt',
        mark: 'openai',
        name: 'GPT Image',
        tray: 'pics',
        samples: [
          { src: `${M}/gpt-street.webp`, ar: '3/4' },
          { src: `${M}/gpt-breakfast.webp`, ar: '3/4' },
          { src: `${M}/gpt-bookstore.webp`, ar: '16/9' },
          { src: `${QUAD}gpt-image-2.webp`, ar: '3/4' },
        ],
      },
      {
        id: 'gemini',
        mark: 'gemini',
        name: 'Gemini',
        tray: 'pics',
        samples: [
          { src: `${M}/gemini-baker.webp`, ar: '3/4' },
          { src: `${M}/gemini-bike.webp`, ar: '3/4' },
          { src: `${M}/gemini-cabin.webp`, ar: '7/4' },
          { src: `${QUAD}gemini-3-pro.webp`, ar: '3/4' },
        ],
      },
      {
        id: 'seedream',
        mark: 'bytedance',
        name: 'Seedream',
        tray: 'pics',
        samples: [
          { src: `${M}/seedream-magazine.webp`, ar: '3/4' },
          { src: `${M}/seedream-festival.webp`, ar: '3/4' },
          { src: `${M}/seedream-cafe.webp`, ar: '7/4' },
          { src: `${QUAD}seedream-5-0.webp`, ar: '3/4' },
        ],
      },
      {
        id: 'novelai',
        mark: 'novelai',
        name: 'NovelAI',
        tray: 'pics',
        samples: [
          { src: `${M}/novelai-trio.webp`, ar: '4/3' },
          { src: `${M}/novelai-cel.webp`, ar: '3/4' },
          { src: `${M}/novelai-watercolor.webp`, ar: '3/4' },
          { src: `${M}/novelai-paint.webp`, ar: '3/4' },
          { src: `${M}/novelai-retro.webp`, ar: '3/4' },
        ],
      },
      {
        id: 'lora',
        mark: 'lora',
        name: 'LoRA',
        tray: 'pics',
        samples: [1, 2, 3, 4].map((i) => ({
          src: `${P}/lora/lora-body-${i}.webp`,
          ar: '3/4',
        })),
      },
    ],
  },
  {
    group: 'video',
    rows: [
      {
        id: 'seedance',
        mark: 'bytedance',
        name: 'Seedance',
        tray: 'clip',
        poster: '/homepage/v4/model-seedance.webp',
        src: `${P}/models/video/model-seedance.mp4`,
      },
      {
        id: 'wan',
        mark: 'wan',
        name: 'Wan',
        tray: 'clip',
        poster: '/homepage/v4/model-wan-30.jpg',
        src: `${P}/models/video/model-wan30.mp4`,
      },
      {
        id: 'minimax',
        mark: 'minimax',
        name: 'MiniMax',
        tray: 'clip',
        poster: '/homepage/v4/model-minimax-h3.webp',
        src: `${P}/models/video/model-minimax.mp4`,
      },
    ],
  },
  {
    group: 'audio',
    rows: [{ id: 'fish', mark: 'fish', name: 'Fish Audio', tray: 'voice' }],
  },
]
