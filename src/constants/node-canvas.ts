/**
 * 画布渲染代际（第三期 · 画布 C3c-③d 之后）。
 *
 * ③d 已翻转：画布只有 v4 一条渲染路径，`NODE_COMPONENTS` 与十个 legacy 节点
 * 组件一并下线。常量留着只为让「画布是 v4」这件事在代码里有一个可搜的名字，
 * ⛔ 不是运行时可切的设置项，也永远不会再有 false 分支。
 */
export const NODE_CANVAS_RENDER_V4 = true
