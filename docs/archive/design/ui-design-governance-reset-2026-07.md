# Task Packet: UI 设计治理重建

> 状态：**全局治理重建已完成并归档（2026-07-19）**
> 生效日期：2026-07-19
> 当前作用：保存本轮设计治理迁移的历史决策。长期规则以 `docs/brand-dna.md` 为准；Prompts 稳定边界已沉淀到 `docs/references/domains/prompts.md`，本文不进入默认阅读链。

## Goal

- 从零重建设计治理，让每个业务域拥有可辨识的页面语言，同时保留全站交互品质和工程底线。

## Non-goals

- 不删除或重写当前可运行 UI 代码。
- 不在讨论完成前生成全站设计或启动全站换皮。
- 不改 Canvas、LoRA 当前在飞业务与 UI；两域业务收口后再设计。
- 不把现有页面外观当成新设计的默认答案。

## Task Scene / Type

- UI design governance · docs · product boundary

## 当前有效规则

### 全局不变量

- 可访问性、键盘可达、焦点管理、`prefers-reduced-motion`。
- 响应式行为、自适应命中区、触屏软键盘策略。
- i18n 三语、状态反馈、错误/空态、不支持的能力不伪装。
- 类型安全、语义 token、可维护性和隐私边界。

### 薄品牌脊柱

- 全局统一：PixelVault 名称与标识、应用壳、导航行为、文案语气、图标体系、反馈语义和交互品质。
- 域级可定义：字体表达、颜色、材质、几何、阴影、密度、布局和动效性格。
- 一致性来自产品身份与行为，不来自全站穿同一套皮肤。

### 组件复用原则

- 共享组件统一行为、API、状态模型、可访问性和响应式。
- 不强制共享页面皮肤；业务域可以通过 variant、slot 和域/page token 完整覆盖外观。
- 先在页面中证明模式有效，再提取共享组件；不预先为了统一而抽象。

## 已确认决策

1. **先废止视觉规则，不删除运行代码。**
2. **特色归业务域。** Canvas、LoRA、Studio Image/Video/Audio、Assets、Cards、Prompts、Gallery、Homepage 可拥有各自语言；同域内部保持一致。
3. **旧视觉条款整体暂停。** 暖纸、炭墨、房间隐喻、颜料纪律、统一圆角、pill、panel chrome、固定动效等均不再约束新设计。
4. **旧文档仅作历史证据。** 不得从旧版 `brand-dna` 内容、`archive/design/direction.md`、旧施工稿或当前代码外观推导新页面造型；现行 `brand-dna.md` 只提供治理边界。
5. **逐域确认。** 业务目标与情绪 → 三个结构方向 → 选一个关键切片 → 真机验证 → owner 确认 → 扩展实现。
6. **试点顺序修订。** Canvas 与 LoRA 等业务收口；第一设计试点改为 Prompts。
7. **Prompts/Gallery 边界修订。** 公共配方发现归 Gallery；Prompts 只负责个人配方管理。具体后续删除范围见 `references/domains/prompts.md`。
8. **Prompts 类型采用独立路由。** 目标为 `/prompts/image`、`/prompts/video`、`/prompts/lora`、`/prompts/audio`；类型不再是同页卡片筛选。各路由拥有独立配方结构，只共享搜索、保存、版本、复用和送往创作域等行为。
9. **类型页以已有配方为主。** 首要任务是查找、打开和复用已保存配方；新建/编辑是第二任务，不默认进入空白编辑器，避免与 Studio 创作入口重叠。
10. **四类配方不是一个通用配置的变体。** Image、Video、LoRA、Audio 各自定义字段、依赖、信息层级和页面设计；共享层只包含导航、身份元数据、搜索、保存、版本和复用行为。某类型不负责的字段不得以隐藏、禁用或“高级参数”形式混入。
11. **首个页面设计只讨论 `/prompts/image`。** 先完成 Prompts 域定义，再围绕 Image 配方的浏览、打开与复用提出三个结构方向；Video、LoRA、Audio 分别另开设计轮次，不把 Image 的布局复制过去。

## Prompts 试点：已确认输入

- 删除页面顶部“我的模板”层级；页面直接进入个人配方工作区。
- 把类型导航提升到页面最上层；类型不是卡片筛选条件，而是不同配方结构的入口。
- 已确认的独立责任输入：
  - Image：Prompt、Negative Prompt；**不使用也不展示 LoRA 字段**。
  - Video：Prompt、引用文件、Video 自有参数。
  - LoRA：Prompt、Negative Prompt、底模、挂载 LoRA、LoRA 自有参数。
- 这些不是一份 universal Recipe schema 的可选区块；每条路由需要单独完成域定义和页面设计。
- Audio 的配方结构以及 `/prompts` 默认落点尚未确认；不再保留“全部类型混排”作为默认信息架构。
- 以上是信息架构输入，不是视觉稿；下一步先定义 Prompts 域，再讨论视觉性格。
- 类型页必须先服务已有配方的浏览与复用；具体使用列表、卡片、分栏或其他结构留到三个概念方向阶段比较。

## 页面设计流程

1. 明确该域负责什么、不负责什么，以及最高频用户任务。
2. 明确页面对象、信息层级和关键交互；先解决与其他域的职责冲突。
3. 定义该域的设计性格、三个标志性组件和明确禁区。
4. 提出三个结构明显不同的概念方向，不以换色充当方向差异。
5. owner 选择后只做一个关键切片，验证桌面、移动端与交互态。
6. 方向成立后才写入 `references/pages/<page>.md` 并进入实现。

## 阶段 0 落地结果

- `docs/brand-dna.md` 已重写为薄品牌脊柱、设计权力分层与域级确认流程，不再保存全站皮肤答案。
- `docs/scenes/ui-page.md`、`docs/scenes/ui-marketing.md` 已改为“域定义 → 三方向 → 关键切片 → owner 确认 → 实现”的硬门流程。
- `docs/checklists/ui.md` 与 `docs/forbidden.md` 已删除统一圆角、pill、固定 chrome、固定配色/材质/动效等造型验收，只保留 UX、工程与设计流程底线。
- `docs/references/frontend.md` 只记录实现事实、token 分层与共享行为契约；当前组件外观不是跨域模板。
- 旧方向与全局手写字体计划已移入 `docs/archive/design/`，不得进入默认阅读链。
- Canvas、LoRA 的当前施工文档只约束本轮业务收口与回归；业务完成后的视觉改版必须重新走现行流程。

## Read First

- `AGENTS.md`
- `docs/WORKFLOW.md`
- 本文件
- `docs/references/product.md`
- 正在讨论业务域的 `docs/references/domains/<domain>.md`
- 实际页面代码（只作为业务与实现事实源，不作为视觉目标）

## Allowed File Scope

- 当前讨论期：`docs/**`。
- 页面实现必须在 owner 拍板关键切片后另立 task packet。

## Forbidden File Scope

- 当前讨论期不改 `src/**`、`prisma/**`、API、service、provider、计费和权限。
- 不动 Canvas、LoRA 在飞任务包与实现。

## Open Questions

- Prompts 域的核心对象、页面心智模型，以及与 Gallery/Studio 的最终责任边界。
- `/prompts/image` 的完整配方契约、最高频任务与信息层级。
- 四类路由共用哪些行为组件；外观默认不跨类型继承。
- `/prompts/image` 的设计性格、三个结构方向和第一个关键切片。
- Audio 配方结构与 `/prompts` 默认落点留到各自定义轮次，不阻塞 Image 试点。

## Acceptance Criteria

- 旧视觉规则不会再被 Agent 当作新 UI 的硬约束。
- 每个业务域可独立形成视觉辨识度，且同域内部一致。
- 共享组件保留行为一致性，但不锁死域级外观。
- Prompts 试点完成 owner 确认后，才进入代码实现。

## Validation / Evidence

- 讨论期仅做文档一致性检查与引用搜索。
- 每次拍板追加到“已确认决策”或对应域文档；未确认内容留在 `Open Questions`。

## Documentation Sync

- 当前活动记录：本文件。
- 稳定业务边界：`docs/references/product.md`、`docs/references/domains/prompts.md`、`docs/references/domains/gallery.md`。
- `docs/status.md` 记录治理文档已落地；没有运行时实现变化。

## Last Verified

- 2026-07-19 · owner 逐项确认设计治理重建原则；阶段 0 文档硬废止完成，下一轮从 Prompts 域定义开始。
