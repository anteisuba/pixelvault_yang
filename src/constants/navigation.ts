import {
  Archive,
  AudioLines,
  BookOpen,
  Box,
  FileText,
  IdCard,
  Image as ImageIcon,
  Images,
  ScanSearch,
  Sparkles,
  SwatchBook,
  Video,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'

import { ROUTES } from '@/constants/routes'

/**
 * 全局导航的**唯一**条目清单（施工基准 `docs/references/pages/app-shell.md` §6）。
 *
 * ⛔ **不许再出现第二份清单。** 桌面侧栏和移动轨曾各自手抄一份，结果漂了：
 * 桌面有「敬请期待」组（增强 / 解析 / 故事），移动轨没有 —— 那三个入口在小屏
 * 直接不可达。任何断点、任何形态，条目都从这里取。
 *
 * 图标是 2026-08-18 owner 确认的一套（§7）。换图标前先读那一节：选型依据是
 * ①拆散方块系（改版前 11 个里有 4 个由方块构成，16px 下轮廓互撞）
 * ②拉平笔画密度 ③语义直给 —— 不是「换个好看的」。
 */

/** 激活判定：`exact` 只认自己，`prefix` 连子路由一起认。 */
export type ShellNavMatch = 'exact' | 'prefix'

export interface ShellNavItem {
  id: string
  href: string
  icon: LucideIcon
  /** 完整 i18n 路径，消费方用 `useTranslations()`（不带命名空间）解析 */
  labelKey: string
  /** 除 href 外还算激活的路径 */
  activePaths?: readonly string[]
  match?: ShellNavMatch
}

export interface ShellNavSection {
  id: 'go' | 'tools' | 'locked'
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

/** 敬请期待 —— 折叠在工具组末尾。⚠ 收起态整行不渲染（§6）。 */
export const SHELL_NAV_LOCKED: readonly ShellNavItem[] = [
  {
    id: 'enhance',
    href: ROUTES.STUDIO_ENHANCE,
    icon: Sparkles,
    labelKey: 'StudioTools.tools.enhance.label',
    match: 'prefix',
  },
  {
    id: 'analyze',
    href: ROUTES.STUDIO_ANALYZE,
    icon: ScanSearch,
    labelKey: 'StudioTools.tools.analyze.label',
    match: 'prefix',
  },
  {
    id: 'storyboard',
    href: ROUTES.STORYBOARD,
    icon: BookOpen,
    labelKey: 'Navbar.links.storyboard',
    match: 'prefix',
  },
] as const

export const SHELL_NAV_SECTIONS: readonly ShellNavSection[] = [
  { id: 'go', labelKey: 'Navbar.groupLabel', items: SHELL_NAV_GO },
  { id: 'tools', labelKey: 'StudioTools.groupLabel', items: SHELL_NAV_TOOLS },
] as const

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
