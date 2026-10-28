import { ROUTES } from '@/constants/routes'

/**
 * `/studio` 外壳（第 9f 步，方向 E「分层」）：左 = 在哪儿（列表），中 = 想什么（对话），
 * 右 = 用什么做（台）。三层只在 ≥1024（`desk:`）摆开；更窄照旧（台全屏 + 浮起的助手）。
 * 设计稿：`/mnt/project-files/assistant-reliability/step9f-e.md`。
 */

/** 台条（台开着在台顶、关着贴右边）里的六个台，顺序就是画板上的顺序（配音台 ③，样件 v5 排在 LoRA 后面）。 */
export const STUDIO_SHELL_BENCH_IDS = [
  'image',
  'lora',
  'audio',
  'video',
  'model3d',
  'canvas',
] as const

export type StudioShellBenchId = (typeof STUDIO_SHELL_BENCH_IDS)[number]

/**
 * 路由在外壳里算哪一种。
 * - `home`：只有对话（首页、`/studio/c/编号`）—— 中间一栏铺开，右边贴一条台条。
 * - `bench`：对话 + 台，中间那一根分隔线定宽窄。
 * - `page`：整页 —— ⛔ 不挂对话（现在只有库就地铺开时用，`StudioShell` 的 `libraryInPlace`）。
 * - `library`：库叠在中间（`/library/<类>`）—— 底下是进来之前那一页（台不卸载）。
 */
export type StudioShellRouteKind = 'home' | 'bench' | 'page' | 'library'

/** 宽窄那一根分隔线（对话栏的像素宽，台吃掉剩下的）。 */
export const STUDIO_SHELL_SPLIT = {
  /** localStorage：对话栏宽 + 收没收起。 */
  storageKey: 'pv:studio-shell:split',
  defaultConversationPx: 400,
  /** 对话栏拖到比这还窄 = 收起对话（台顶出现「‹ 对话名」）。 */
  minConversationPx: 320,
  /** 台拖到比这还窄 = 收起台（回到只有对话）。 */
  minBenchPx: 560,
  /** 拖过最小值再多拖这么多才真的收起，免得手一抖就收。 */
  collapseSlackPx: 48,
  /** 方向键一下挪多少。 */
  keyStepPx: 24,
  /** 拖到离默认宽这么近就吸到默认宽（9f-4）。 */
  snapPx: 16,
} as const

/**
 * 两指横滑换台（桌面触控板，9f-4）：一次手势横向累计过 `thresholdPx` 换一格；停手
 * `idleMs` 算这次手势结束，才能再换。横向要明显大过纵向（`dominance` 倍）才算横滑。
 * ⛔ 画布台不响应（画布里两指滑是平移，owner 10-24）。
 */
export const STUDIO_SHELL_SWIPE = {
  thresholdPx: 80,
  idleMs: 260,
  dominance: 1.5,
} as const

/** 左边列表的宽（固定，不参与拖）。 */
export const STUDIO_SHELL_LIST_WIDTH_CLASS = 'w-60'

/** 左边列表里「最近对话」摆几条（其余在列表里往下滚）。 */
export const STUDIO_SHELL_RECENT_LIMIT = 30

/**
 * 外壳整页的几类（第 9f 步）：id 就是地址里那一段（`/library/<id>`）；名字与图标见
 * `STUDIO_LIBRARY_ITEMS`（`constants/navigation.ts`）。标签（9f-2c）、酒馆只在库里，没有旧页面。
 * 用户 10-25：「库」只放公开来源那几样（`STUDIO_LIBRARY_TAB_IDS`）；素材 / 角色 / 提示词 / 画廊
 * 各在左栏有一颗，点开整页，顶上只写名字。
 */
export const STUDIO_LIBRARY_CATEGORY_IDS = [
  'lora',
  'tavern',
  'tags',
  'voices',
  'assets',
  'cards',
  'prompts',
  'gallery',
] as const

/** 库顶上那一排、左栏「库」弹出的那一排：LoRA · 酒馆 · 标签 · 音色。 */
export const STUDIO_LIBRARY_TAB_IDS = [
  'lora',
  'tavern',
  'tags',
  'voices',
] as const

export type StudioLibraryCategoryId =
  (typeof STUDIO_LIBRARY_CATEGORY_IDS)[number]

/**
 * 叠在中间那一栏上的东西（第 9f 步）：库的各类，外加「我的主页」（9f-2e，从外壳里点开
 * `/u/me` 时叠上来；直接打开仍是整页）。
 */
export type StudioShellOverlayId = StudioLibraryCategoryId | 'profile'

export function studioLibraryPath(category: StudioLibraryCategoryId): string {
  return `${ROUTES.LIBRARY}/${category}`
}

/** LoRA 库左栏那一格记在网址里（`?view=favorites|trained|characters`，不写 = 全部）。 */
export const LORA_LIBRARY_VIEW_PARAM = 'view'

/**
 * 助手「翻给你看」换到那个库时去的地址（owner 10-28）：LoRA 库点名了哪一格就直接写进网址 ——
 * ⚠ 挂上之后再换格会被 Civitai 那一格挂载时按旧网址写回的筛选参数盖掉。
 */
export function studioLibraryShowPath(
  category: StudioLibraryCategoryId,
  loraSection?: string,
): string {
  const path = studioLibraryPath(category)
  return category === 'lora' && loraSection && loraSection !== 'library'
    ? `${path}?${LORA_LIBRARY_VIEW_PARAM}=${loraSection}`
    : path
}

/** 库左栏收起 / 展开（本机记住，七个库同一份）。 */
export const LIBRARY_RAIL_STORAGE_KEY = 'pv:library:rail'

/**
 * 标签库里直接打开一个 tag 的详情（台上 Ctrl+点一格标签，9f-2c）。`of` 不写 = 按 tag 自己的
 * 类别认。参数名与 `TagLibraryView` 那份一致。
 */
export function studioTagLibraryDetailPath(tag: string, of?: 'artist'): string {
  const params = new URLSearchParams({ tag })
  if (of) params.set('of', of)
  return `${studioLibraryPath('tags')}?${params}`
}

/**
 * 左边列表的封面 / 进度圈 / 小点（第 9f 步 9f-3）。
 * - `batchWindowMs`：进度「2/4」只数这么久以内出的那一批（最早那个还在跑的任务往后算）。
 * - `pollMs`：有任务在跑时每隔多久问一次；都跑完就不问了。
 * - `seenStorageKey`：每段对话「你最后看它的时间」只记在本机（owner 10-24 同意）。
 */
export const STUDIO_CONVERSATION_ACTIVITY = {
  batchWindowMs: 2 * 60 * 60 * 1000,
  pollMs: 4000,
  seenStorageKey: 'pv:studio-shell:seen',
} as const
