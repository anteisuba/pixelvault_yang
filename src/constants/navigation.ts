import {
  CANVAS_SHELL_PANEL_IDS,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import { ROUTES } from '@/constants/routes'

import {
  Archive,
  AudioLines,
  Box,
  FileText,
  FolderOpen,
  FolderTree,
  History,
  IdCard,
  ListTree,
  Image as ImageIcon,
  Images,
  Plus,
  SwatchBook,
  User,
  UserRound,
  Video,
  Waypoints,
  type Icon,
} from '@/components/icons'

/**
 * 全局导航的**唯一**条目清单（施工基准 `docs/references/pages/app-shell.md` §6）。
 *
 * ⛔ **不许再出现第二份清单。** 桌面侧栏和移动轨曾各自手抄一份，结果漂了：
 * 桌面多出一个「敬请期待」组，移动轨没有 —— 那些入口在小屏直接不可达。
 * 任何断点、任何形态，条目都从这里取。
 *
 * 图标是 2026-08-18 owner 确认的一套（§7）。换图标前先读那一节：选型依据是
 * ①拆散方块系（改版前 11 个里有 4 个由方块构成，16px 下轮廓互撞）
 * ②拉平笔画密度 ③语义直给 —— 不是「换个好看的」。
 */

/** 激活判定：`exact` 只认自己，`prefix` 连子路由一起认。 */
export type ShellNavMatch = 'exact' | 'prefix'

/** 「画布」那一项的 id —— 侧栏据它在下面长出画布面板的子图标。 */
export const SHELL_NAV_CANVAS_ITEM_ID = 'canvas'

export interface ShellNavItem {
  id: string
  href: string
  icon: Icon
  /** 完整 i18n 路径，消费方用 `useTranslations()`（不带命名空间）解析 */
  labelKey: string
  /** 除 href 外还算激活的路径 */
  activePaths?: readonly string[]
  match?: ShellNavMatch
}

export interface ShellNavSection {
  id: 'go' | 'tools'
  labelKey: string
  items: readonly ShellNavItem[]
}

/** 去处 —— 低频跳转。手机收起态把这一段收进抽屉，只留工具。 */
export const SHELL_NAV_GO: readonly ShellNavItem[] = [
  {
    id: 'gallery',
    href: ROUTES.GALLERY,
    icon: Images,
    labelKey: 'Navbar.links.gallery',
  },
  {
    id: 'prompts',
    href: ROUTES.PROMPTS,
    icon: FileText,
    labelKey: 'Navbar.links.prompts',
  },
  {
    id: 'assets',
    href: ROUTES.ASSETS,
    icon: Archive,
    labelKey: 'Navbar.links.assets',
  },
  {
    id: 'cards',
    href: ROUTES.CARDS,
    icon: IdCard,
    labelKey: 'Navbar.links.cards',
  },
  /**
   * 我的主页（D11 ④，2026-09-20 owner 确认）。头像不再是它的快捷方式 ——
   * 头像改开账号菜单，一件事只留一个家，所以它下沉成一条常规导航项。
   *
   * ⭐ 地址是**静态**的 `/u/me`，那条路由在服务端解析当前用户后**就地渲染**
   * （`app/[locale]/(main)/u/me/page.tsx`，⛔ 不跳转）。⛔ 不要再让壳在渲染时
   * 按 `useMyProfile()` 拼地址 —— 那一版真机在日语档看得见侧边栏回流一次。
   *
   * ⚠ 「就地渲染而不是 redirect」正是为了这一项的**激活态**：地址栏停在
   * `/u/me`，静态清单就认得出；跳到 `/u/<username>` 的话只能把刚删掉的运行时
   * 解析接回来。`match` 留默认的 `exact`：这条路由没有子路由。
   */
  {
    id: 'profile',
    href: ROUTES.MY_PROFILE,
    icon: User,
    labelKey: 'Navbar.links.profile',
  },
] as const

/** 工具 —— 最高频任务就是在这几个之间来回切，整套设计围绕它优化。 */
export const SHELL_NAV_TOOLS: readonly ShellNavItem[] = [
  {
    id: 'image',
    href: ROUTES.STUDIO_IMAGE,
    icon: ImageIcon,
    labelKey: 'StudioTools.tools.image.label',
    activePaths: [ROUTES.STUDIO, ROUTES.STUDIO_IMAGE, ROUTES.STUDIO_IMAGE_TAGS],
  },
  {
    id: 'video',
    href: ROUTES.STUDIO_VIDEO,
    icon: Video,
    labelKey: 'StudioTools.tools.video.label',
  },
  {
    id: 'audio',
    href: ROUTES.STUDIO_AUDIO,
    icon: AudioLines,
    labelKey: 'StudioTools.tools.audio.label',
  },
  {
    id: 'model3d',
    href: ROUTES.STUDIO_3D,
    icon: Box,
    labelKey: 'StudioTools.tools.model3d.label',
  },
  {
    id: 'lora',
    href: ROUTES.STUDIO_LORA,
    icon: SwatchBook,
    labelKey: 'StudioTools.tools.lora.label',
  },
  {
    id: SHELL_NAV_CANVAS_ITEM_ID,
    href: ROUTES.STUDIO_NODE,
    icon: Waypoints,
    labelKey: 'StudioTools.tools.node.label',
  },
] as const

export const SHELL_NAV_SECTIONS: readonly ShellNavSection[] = [
  { id: 'go', labelKey: 'Navbar.groupLabel', items: SHELL_NAV_GO },
  { id: 'tools', labelKey: 'StudioTools.groupLabel', items: SHELL_NAV_TOOLS },
] as const

/**
 * 手机底栏（<768，owner 2026-10-07 选 P3、10-09 v10 定稿）：
 * `素材 · 画廊 · ＋ · 角色 · 我的`，默认进素材。＋ 是 `SHELL_NAV_TOOLS` 那一组。
 * 条目从「去处」那份清单里按 id 取，⛔ 不另抄一份；提示词收进「我的」，不上底栏。
 */
export const MOBILE_TAB_IDS = {
  left: ['assets', 'gallery'],
  right: ['cards', 'profile'],
} as const

function pickGoItems(ids: readonly string[]): readonly ShellNavItem[] {
  return ids.flatMap((id) => SHELL_NAV_GO.filter((item) => item.id === id))
}

/** 手机底栏的本地记忆（`hooks/use-mobile-nav-memory.ts`）。 */
export const MOBILE_NAV_LAST_TOOL_STORAGE_KEY = 'pv:mobile-nav:last-tool'
export const MOBILE_NAV_RETURN_STORAGE_KEY = 'pv:mobile-nav:return'

/** 长按 ＋ 多久算长按（直接进上次的工具）。 */
export const MOBILE_CREATE_LONG_PRESS_MS = 450

export const MOBILE_TABS_LEFT = pickGoItems(MOBILE_TAB_IDS.left)
export const MOBILE_TABS_RIGHT = pickGoItems(MOBILE_TAB_IDS.right)

/**
 * 工作台路由（`/studio/**`）：手机上底栏收起，换成顶上一条「← · 图片 ▾」。
 */
export function isStudioPath(pathname: string): boolean {
  return pathname === ROUTES.STUDIO || pathname.startsWith(`${ROUTES.STUDIO}/`)
}

/**
 * 当前路径落在哪个工具上（`SHELL_NAV_TOOLS` 那一项，子路由也算，如 LoRA 库）；
 * 不在任何工具上 = undefined。
 */
export function activeShellTool(pathname: string): ShellNavItem | undefined {
  return SHELL_NAV_TOOLS.find(
    (item) =>
      isShellNavItemActive(item, pathname) ||
      pathname.startsWith(`${item.href}/`),
  )
}

/** 一个条目在当前路径下是否激活。桌面与移动必须用同一个判定，别各写各的。 */
export function isShellNavItemActive(
  item: ShellNavItem,
  pathname: string,
): boolean {
  const paths = item.activePaths ?? [item.href]
  return paths.some((path) =>
    item.match === 'prefix'
      ? pathname === path || pathname.startsWith(`${path}/`)
      : pathname === path,
  )
}

/**
 * 画布左侧面板六格的入口（图标 + 文案）。哪几格长在全站侧栏「画布」下面、哪几格留在
 * 画布底栏，**只看下面 `SHELL_NAV_CANVAS_SIDEBAR_IDS` 那一张列表**。
 */
export interface ShellNavCanvasEntry {
  readonly id: CanvasShellPanelId
  readonly icon: Icon
  /** 完整 i18n 路径（与面板标题同一条：`StudioNode.shell.panels.<id>`）。 */
  readonly labelKey: string
}

const SHELL_NAV_CANVAS_ENTRY_BY_ID: Readonly<
  Record<CanvasShellPanelId, ShellNavCanvasEntry>
> = {
  [CANVAS_SHELL_PANEL_IDS.addNode]: {
    id: CANVAS_SHELL_PANEL_IDS.addNode,
    icon: Plus,
    labelKey: 'StudioNode.shell.panels.addNode',
  },
  [CANVAS_SHELL_PANEL_IDS.nodes]: {
    id: CANVAS_SHELL_PANEL_IDS.nodes,
    icon: ListTree,
    labelKey: 'StudioNode.shell.panels.nodes',
  },
  [CANVAS_SHELL_PANEL_IDS.project]: {
    id: CANVAS_SHELL_PANEL_IDS.project,
    icon: FolderTree,
    labelKey: 'StudioNode.shell.panels.project',
  },
  [CANVAS_SHELL_PANEL_IDS.history]: {
    id: CANVAS_SHELL_PANEL_IDS.history,
    icon: History,
    labelKey: 'StudioNode.shell.panels.history',
  },
  [CANVAS_SHELL_PANEL_IDS.cards]: {
    id: CANVAS_SHELL_PANEL_IDS.cards,
    icon: UserRound,
    labelKey: 'StudioNode.shell.panels.cards',
  },
  [CANVAS_SHELL_PANEL_IDS.library]: {
    id: CANVAS_SHELL_PANEL_IDS.library,
    icon: FolderOpen,
    labelKey: 'StudioNode.shell.panels.library',
  },
}

/** 六格的固定次序 —— 侧栏与底栏各自按它排。 */
const SHELL_NAV_CANVAS_ORDER: readonly CanvasShellPanelId[] = [
  CANVAS_SHELL_PANEL_IDS.addNode,
  CANVAS_SHELL_PANEL_IDS.nodes,
  CANVAS_SHELL_PANEL_IDS.project,
  CANVAS_SHELL_PANEL_IDS.history,
  CANVAS_SHELL_PANEL_IDS.cards,
  CANVAS_SHELL_PANEL_IDS.library,
]

/**
 * ⭐ 「画布」那一项下面长出来的子图标（owner 2026-10-08 拍板六格：原型四格 添加节点 / 节点 /
 * 当前项目 / 历史对话，再加线上就有的 角色 / 素材库）。只在画布路由上、画布真的挂着时出现；点一颗 = 在侧栏旁边打开那一格
 * 面板（`ShellSidePanels`），再点收起。
 *
 * ⚠ **不在这张表里的格子自动落到画布底栏**（现在一格都没有）。要把它们也搬进侧栏
 *   ⇄ 底栏，只改这一张列表 —— 侧栏与底栏都跟着它走。
 */
const SHELL_NAV_CANVAS_SIDEBAR_IDS: readonly CanvasShellPanelId[] = [
  CANVAS_SHELL_PANEL_IDS.addNode,
  CANVAS_SHELL_PANEL_IDS.nodes,
  CANVAS_SHELL_PANEL_IDS.project,
  CANVAS_SHELL_PANEL_IDS.history,
  CANVAS_SHELL_PANEL_IDS.cards,
  CANVAS_SHELL_PANEL_IDS.library,
]

export const SHELL_NAV_CANVAS_ENTRIES: readonly ShellNavCanvasEntry[] =
  SHELL_NAV_CANVAS_ORDER.filter((id) =>
    SHELL_NAV_CANVAS_SIDEBAR_IDS.includes(id),
  ).map((id) => SHELL_NAV_CANVAS_ENTRY_BY_ID[id])

/** 画布底栏上的面板入口 = 侧栏没收走的那几格（现在一格都没有）。 */
export const SHELL_CANVAS_BOTTOM_ENTRIES: readonly ShellNavCanvasEntry[] =
  SHELL_NAV_CANVAS_ORDER.filter(
    (id) => !SHELL_NAV_CANVAS_SIDEBAR_IDS.includes(id),
  ).map((id) => SHELL_NAV_CANVAS_ENTRY_BY_ID[id])
