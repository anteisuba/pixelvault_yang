/**
 * 素材文件夹树的缩进刻度（层数不限，owner 2026-10-09）。
 *
 * 每个面沿用自己原来第 0 / 1 层的位置（`basePx` = 最外层，`stepPx` = 每深一层），
 * 再往下按同一步长继续缩；超过 `FOLDER_TREE_MAX_INDENT_DEPTH` 层就不再往里缩 ——
 * 左栏只有 236 宽，缩到底名字就没地方了（层级仍看得出：▸ 与搜索里的父路径）。
 *
 * ⚠ 缩进是按层算出来的数，只能走行内 `style`（Tailwind 4 不收任意值类名）。
 */
export const FOLDER_TREE_INDENT = {
  /** 素材页左栏 / 抽屉（原 `pl-1` / `pl-6`）。 */
  sidebar: { basePx: 4, stepPx: 20 },
  /** 加入文件夹面板（原 `pl-1` / `pl-6`）。 */
  addPanel: { basePx: 4, stepPx: 20 },
  /** 栏收起后的范围胶囊弹层（原 `pl-2` / `pl-6.5`）。 */
  scopePopover: { basePx: 8, stepPx: 18 },
  /** ⋯ 菜单「移到…」子菜单（菜单项自带 `px-2`）。 */
  menu: { basePx: 8, stepPx: 12 },
  /** 素材选择器左栏（原 `6 + depth * 10`）。 */
  picker: { basePx: 6, stepPx: 10 },
} as const

export type FolderTreeIndentSurface = keyof typeof FOLDER_TREE_INDENT

/** 再深就不再往里缩的层（最外层 = 0）。 */
export const FOLDER_TREE_MAX_INDENT_DEPTH = 5

/**
 * 左栏的 Eagle 式交互（owner 2026-10-09 选「像 Eagle」，原型 `8BdQmDyx2yNwpB592ZLYa2`）。
 *
 * - 拖动一个夹：指针压在一行**中间**（上下各留 `edgeRatio`）= 放进去当子夹；压在
 *   上 / 下四分之一 = 排到这一行前 / 后（同一层）。
 * - 拖出 `activationPx` 才算拖 —— 点一下仍是打开这个夹。
 * - 压在一个收着、有子夹的夹中间停 `hoverExpandMs` 就自己展开，可以继续往深处拖。
 * - 触屏不拖：长按一行 `longPressMs` 弹出 ⋯ 菜单；手指挪出 `longPressSlopPx` 就算滑动、作废。
 */
export const FOLDER_TREE_DRAG = {
  edgeRatio: 0.25,
  activationPx: 4,
  hoverExpandMs: 650,
  longPressMs: 500,
  longPressSlopPx: 8,
  /** 拿起来的影子放大多少（同画布素材拖起那一档的手感，略收）。 */
  liftScale: 1.04,
} as const
