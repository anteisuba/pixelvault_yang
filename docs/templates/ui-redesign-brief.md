# UI 改版设计简报模板

> 用于把已完成事实审计和逐项结构确认的任务交给新的设计会话。常规设计不绑定固定模型；只有 owner 明确点名，或普通设计多轮仍无法收口时，才把同一份简报交给 Fable 升级探索。它只授权设计，不授权修改 `src/**`。若业务域、状态矩阵或关键结构仍未确认，先回到 `scenes/ui-page.md` 阶段 1–4，不要用本模板跳关。

## 任务与阶段

- 业务域：`<domain>`
- 页面/路由：`<page / route>`
- 当前阶段：`三个方向 / 关键切片 / 施工图 / 评审`
- 本轮目标：`<一句可验证目标>`
- 明确非目标：`不实现代码 / 不改业务契约 / 不新增能力 / ...`

## 必读顺序

1. `AGENTS.md` 或 `claude.md`
2. `docs/WORKFLOW.md`
3. `docs/scenes/ui-page.md`
4. `docs/brand-dna.md`
5. `docs/forbidden.md`
6. `docs/references/frontend.md`
7. `docs/references/product.md`
8. `docs/references/domains/<domain>.md`
9. 当前 active plan：`<path>`
10. 已确认 page 文档（若存在）：`<path>`
11. 当前功能施工文档（只读业务事实，不继承视觉）：`<path>`

## 事实与状态矩阵

- 核心用户：`<who>`
- 核心对象：`<what>`
- 最高频任务：`<job>`
- 默认入口：`<entry>`
- 输入 → 处理 → 结果：`<flow>`
- 必须覆盖的真实状态：
  - `<state 1>`
  - `<state 2>`
  - `<state 3>`
- 不支持且不得伪装的能力：`<unsupported>`

## 已确认结构契约

逐条从 active plan 复制，不要概括成“参考现有页面”。

1. `<always visible / on demand>`
2. `<primary / secondary hierarchy>`
3. `<empty / populated behavior>`
4. `<overlay / assistant / disclosure behavior>`
5. `<responsive behavior>`

## 参考证据及作用范围

| 证据               | 只用于说明             | 不得推导                   |
| ------------------ | ---------------------- | -------------------------- |
| `<image/path/url>` | `<局部结构/交互/气质>` | `<整页布局/配色/组件皮肤>` |

当前页面、历史截图、archive 与 UI inspiration 都是证据，不是新设计模板。

## 审美方法与禁区

- 参考的产品界面类型：`<product workspace / media browser / ...>`
- 借鉴的方法：`<task focus / typography / density / spatial rhythm>`
- 明暗、密度与情绪：`<tone>`
- 明确拒绝：`<marketplace waterfall / excessive pills / decorative material / ...>`
- 不复制：`<specific brand skin or layout>`

## 本轮交付

### 三方向阶段

使用同一组真实内容与状态矩阵输出 A/B/C：

- 每个方向一张桌面主状态图。
- 每个方向一张简化状态图，证明其他关键状态能进入同一骨架。
- 说明空间结构、信息比例、交互关系、优点、风险和适用行为。
- 三个方向必须结构不同；换色、换圆角或换卡片皮肤不算不同方向。
- 不选择最终方向，不写 page 文档，不修改代码；等待 owner 逐项反馈。

### 关键切片阶段

- 只深化 owner 已选方向中最能暴露风险的一个切片。
- 同时展示与该切片直接相关的空/有、开/关或桌面/移动状态。
- 标明确认图只约束哪些区域，不能自动升级为整页规范。

### 施工图阶段

- 前提：已存在 owner 确认的 `references/pages/<page>.md`。
- 输出组件边界、状态、响应式、token/variant 作用域、交互与验收说明。
- 不新增产品能力；发现契约缺口时停止并提出一个待确认问题。

## 授权边界

- [ ] 仅设计，不修改 `src/**`
- [ ] 不修改 API/provider/计费/权限/持久化契约
- [ ] 不把候选稿写成已确认 page 文档
- [ ] 不从现有组件皮肤推导全域视觉答案
- [ ] owner 明确选向和确认关键切片后再准备实现交接

## Owner 反馈记录

一次只记录一个决定：

| 日期     | 当前问题         | 推荐答案        | Owner 结论                    | 影响范围  |
| -------- | ---------------- | --------------- | ----------------------------- | --------- |
| `<date>` | `<one question>` | `<recommended>` | `<confirmed/rejected/revise>` | `<scope>` |
