import { ROUTES, creatorProfilePath } from '@/constants/routes'

import {
  Archive,
  AudioLines,
  BookOpen,
  Box,
  FileText,
  IdCard,
  Image as ImageIcon,
  Images,
  SwatchBook,
  User,
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

/**
 * 地址**运行时才算得出**的条目的标记。目前只有一个：个人主页要
 * `creatorProfilePath(username)`，而 username 得等 `useMyProfile()` 回来。
 *
 * ⚠ 为什么这里是一个**标记**而不是 `(ctx) => string`：
 * 条目清单是**数据** —— 文档、测试、桌面轨和手机壳都要能同样地读它。放一个
 * 闭包进来，「谁负责喂 username」这件事就藏进了 constants，两套壳各自去凑参数，
 * 而「两份手工清单开始漂」正是这份文件存在的原因（见上方 ⛔）。所以标记留在
 * 数据里，解析集中在 `resolveShellNavItems()` 一支，两套壳都调它。
 */
export type ShellNavDynamicHref = 'creatorProfile'

export interface ShellNavItem {
  id: string
  /** 静态地址。⚠ `null` = 地址要等运行时，见 `dynamicHref`。 */
  href: string | null
  /** 有这个标记时 `href` 必须是 `null`，地址由 `resolveShellNavItems()` 算。 */
  dynamicHref?: ShellNavDynamicHref
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

/** 解析动态地址要的运行时事实。还没回来的一律 `null`，⛔ 不给空串。 */
export interface ShellNavRuntime {
  /** 当前用户的 username。`null` = 未登录 / 资料还没载回。 */
  username: string | null
}

/**
 * 地址已经确定的条目 —— **只有它能进渲染**。`href` 收窄成 `string`，所以
 * 「username 还没回来就渲染成 `/u/undefined`」在类型上就写不出来。
 */
export interface ResolvedShellNavItem extends Omit<
  ShellNavItem,
  'href' | 'dynamicHref'
> {
  href: string
}

export interface ResolvedShellNavSection extends Omit<
  ShellNavSection,
  'items'
> {
  items: readonly ResolvedShellNavItem[]
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
  {
    id: 'storyboard',
    href: ROUTES.STORYBOARD,
    icon: BookOpen,
    labelKey: 'Navbar.links.storyboard',
    match: 'prefix',
  },
  /**
   * 我的主页（D11 ④，2026-09-20 owner 确认）。头像不再是它的快捷方式 ——
   * 头像改开账号菜单，一件事只留一个家，所以它下沉成一条常规导航项。
   * 地址等 username，未就绪时 `resolveShellNavItems()` 直接**不产出**这一项。
   */
  {
    id: 'profile',
    href: null,
    dynamicHref: 'creatorProfile',
    icon: User,
    labelKey: 'Navbar.links.profile',
    match: 'prefix',
  },
] as const

/** 工具 —— 最高频任务就是在这几个之间来回切，整套设计围绕它优化。 */
export const SHELL_NAV_TOOLS: readonly ShellNavItem[] = [
  {
    id: 'image',
    href: ROUTES.STUDIO_IMAGE,
    icon: ImageIcon,
    labelKey: 'StudioTools.tools.image.label',
    activePaths: [ROUTES.STUDIO, ROUTES.STUDIO_IMAGE],
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
    id: 'canvas',
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
 * 把清单解析成「地址已定」的条目。动态地址算不出来的条目**整条丢掉** ——
 * 这是 D11 ④ 定的确定表现：宁可这一项晚一帧出现，也不给一个点了跳
 * `/u/undefined` 的死链接（未登录的访客本来也没有个人主页）。
 */
export function resolveShellNavItems(
  items: readonly ShellNavItem[],
  runtime: ShellNavRuntime,
): readonly ResolvedShellNavItem[] {
  const resolved: ResolvedShellNavItem[] = []
  for (const item of items) {
    const { href, dynamicHref, ...rest } = item
    if (!dynamicHref) {
      if (href) resolved.push({ ...rest, href })
      continue
    }
    if (dynamicHref === 'creatorProfile' && runtime.username) {
      resolved.push({ ...rest, href: creatorProfilePath(runtime.username) })
    }
  }
  return resolved
}

/** 分段版。桌面轨整段渲染，走这支；手机壳按段取 `SHELL_NAV_GO` / `_TOOLS`。 */
export function resolveShellNavSections(
  runtime: ShellNavRuntime,
): readonly ResolvedShellNavSection[] {
  return SHELL_NAV_SECTIONS.map((section) => ({
    ...section,
    items: resolveShellNavItems(section.items, runtime),
  }))
}

/** 一个条目在当前路径下是否激活。桌面与移动必须用同一个判定，别各写各的。 */
export function isShellNavItemActive(
  item: ResolvedShellNavItem,
  pathname: string,
): boolean {
  const paths = item.activePaths ?? [item.href]
  return paths.some((path) =>
    item.match === 'prefix'
      ? pathname === path || pathname.startsWith(`${path}/`)
      : pathname === path,
  )
}
