/**
 * 画布渲染代际开关（第三期 · 画布 C3c-③c）。
 *
 * ⚠ 这不是功能开关，是**迁移顺序的闸**：③c 只翻转存储（hook 的 state 已经是
 * v4、库里写的也是 v4），画布仍旧由 v3 组件渲染 v4 的**投影视图**，所以 owner
 * 这一步看到的行为不变。③d 把这里改成 `true` 之后，v3 分支、`NODE_COMPONENTS`
 * 与 `projectV4ToV3View` 一起删 —— ⛔ 不留双分支，也不做成运行时可切的设置项。
 */
export const NODE_CANVAS_RENDER_V4 = false
