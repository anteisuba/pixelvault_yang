import '@xyflow/react/dist/style.css'
import '@/app/canvas.css'

/**
 * 画布（Node 导演台）路由的样式边界。
 *
 * 这一层存在的唯一理由是**把画布的 CSS 关在画布路由里**：
 *   - `canvas.css` 173 KB 的域皮肤，2026-09-03 前由根 `layout.tsx` import，
 *     等于进每一个路由的首屏 CSS；而唯一渲染它的是本路由那一颗
 *     `StudioNodeWorkbench`（画布组件全在 `components/business/node/`）。
 *   - `@xyflow/react/dist/style.css` 同理，原先写在 `globals.css` 的
 *     `@import` 里 —— React Flow 也只有画布用。
 *
 * 顺序有意是先 xyflow 再 canvas.css：域皮肤要能覆盖 React Flow 的默认值，
 * 和它们原来在 globals.css / 根 layout 里的先后一致。两份都排在根 layout 的
 * `globals.css` 之后，`.node-*` 规则仍在级联最后一位（零 cascade 变化）。
 *
 * ⚠ 画布皮肤里有一小部分留在 `globals.css` 的脊柱上（8 个 `--node-*` 定值 +
 * `.node-canvas-panel-motion`）—— 它们有画布域外的消费者，两处文件头注都记着
 * 原因，别搬回来。
 */
export default function StudioNodeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
