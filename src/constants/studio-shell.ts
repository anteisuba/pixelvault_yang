import { ROUTES } from '@/constants/routes'

/**
 * `/studio` 外壳（第 9f 步，方向 E「分层」）：左 = 在哪儿（列表），中 = 想什么（对话），
 * 右 = 用什么做（台）。三层只在 ≥1024（`desk:`）摆开；更窄照旧（台全屏 + 浮起的助手）。
 * 设计稿：`/mnt/project-files/assistant-reliability/step9f-e.md`。
 */

/** 台条（台开着在台顶、关着贴右边）里的五个台，顺序就是画板上的顺序。⛔ 配音不是台。 */
export const STUDIO_SHELL_BENCH_IDS = [
  'image',
  'lora',
  'video',
  'model3d',
  'canvas',
] as const

export type StudioShellBenchId = (typeof STUDIO_SHELL_BENCH_IDS)[number]

/**
 * 路由在外壳里算哪一种。
 * - `home`：只有对话（首页、`/studio/c/编号`）—— 中间一栏铺开，右边贴一条台条。
 * - `bench`：对话 + 台，中间那一根分隔线定宽窄。
 * - `page`：整页（配音间）—— 左边列表 + 这一页，⛔ 不挂对话（助手不进配音间，owner 10-23）。
 * - `library`：库叠在中间（`/library/<类>`）—— 底下是进来之前那一页（台不卸载）。
 */
export type StudioShellRouteKind = 'home' | 'bench' | 'page' | 'library'

/** 整页显示、不挂对话的那几条（前缀）。 */
export const STUDIO_SHELL_PAGE_ROUTES: readonly string[] = [ROUTES.STUDIO_AUDIO]

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
} as const

/** 左边列表的宽（固定，不参与拖）。 */
export const STUDIO_SHELL_LIST_WIDTH_CLASS = 'w-60'

/** 左边列表里「最近对话」摆几条（其余在列表里往下滚）。 */
export const STUDIO_SHELL_RECENT_LIMIT = 30

/**
 * 库里的几类（第 9f 步 9f-2a）：先接已有的五页，LoRA / 标签两类随 9f-2b 加进来。
 * id 就是地址里那一段（`/library/<id>`）；名字与图标取全站「去处」那份清单（`SHELL_NAV_GO`）。
 */
export const STUDIO_LIBRARY_CATEGORY_IDS = [
  'assets',
  'cards',
  'prompts',
  'voices',
  'gallery',
] as const

export type StudioLibraryCategoryId =
  (typeof STUDIO_LIBRARY_CATEGORY_IDS)[number]

export function studioLibraryPath(category: StudioLibraryCategoryId): string {
  return `${ROUTES.LIBRARY}/${category}`
}
