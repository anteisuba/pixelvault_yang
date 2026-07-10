# Task Packet: 画布间改版 S2 — NodeShell 纸卡化（场记卡 + 深窗 + 成分栏 + 端口纸面校准）

> 上游施工图：`docs/references/pages/node-canvas.md` §2.3 / §3 / §5 / §9-S2 / §10。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。S1 已完成（token 全就位，`--node-paint #3e8c6c`）。

## Goal

- 画布节点卡从深灰面板变成**纸质场记卡**：纸面卡身 + 片头条 + 深窗媒体区 + 成分栏（只读）+ 端口纸面校准 + 拖拽微倾 + 石绿选中环。一片做完，画布上每张卡肉眼可见变成「纸卡」。

## Non-goals

- 不动 NodeStatusBadge 视觉（S3 章）；不动顶栏/工具条/minimap/助手 dock（S4）；不做吞噬手势/连线退场（S5b，本片连线与端口照常渲染）；不删死类型（S6）。
- 不动详情面板（NodeDetailPanel 系）与 Inspector 系 —— 本片只管画布上的紧凑卡。

## Task Scene / Type

- UI（scenes/ui-page.md · 画布域）· checklist = `docs/checklists/ui.md`

## Read First

- `docs/references/pages/node-canvas.md` §2.2/§2.3（token）§3（组件表）§5（石绿落点）§10（Do Not Break）
- `docs/forbidden.md` UI 节（⚠ 禁 Tailwind 任意值）+ CI/CD 节（⚠ dev server 在跑）

## Source of Truth

- `src/components/business/node/nodes/NodeShell.tsx`（壳：Root/Header/Body/Footer，250 行）
- `src/components/business/node/nodes/NodeMediaPreview.tsx`（媒体卡通用体，包 NodeShell）
- `src/constants/node-tokens.ts`（NODE_ACCENTS：iconPlate/iconText/selectedRing/dot/dotRing）
- `src/app/globals.css`（S1 已就位的 `--node-card-*` / `--node-paint`；`--node-port-*` 5 支 L327–331）
- 消费面：NodeShell 由 NodeMediaPreview / SeedanceNode / VoiceNode / ImageRolePicker / AgentNode / ComposerNode 引用；ImageNode→NodeMediaPreview 间接

## 指定实现策略（架构决定，不要偏离）

**容器级 CSS 变量覆盖**：卡内 281 处 `text-node-foreground / bg-node-panel-inner / …` 不逐处改。在 globals.css 新增两个作用域类：

```css
/* 场记卡作用域：深面板语义在卡内反转为纸面（strangler 局部反转） */
.node-card-paper {
  --node-panel: var(--node-card-paper);
  --node-panel-inner: var(--node-card-paper-strong);
  --node-panel-soft: var(--node-card-paper-soft);
  --node-foreground: var(--node-card-ink);
  --node-muted: var(--node-card-ink-muted);
  --node-subtle: var(--node-card-ink-subtle);
}
/* 深窗作用域：媒体区回到深底浅字（作品发色区） */
.node-card-window {
  --node-foreground: #e8e6de;
  --node-muted: #9a988f;
  --node-subtle: #6f6a63;
}
```

- `.node-card-paper` 挂 NodeShell Root `article`；`.node-card-window` 挂 NodeMediaPreview 的媒体容器（bg 用 `bg-node-card-window` + 恢复浅字）。
- ⚠ 验证前提：Tailwind v4 的 `bg-node-panel` 编译为 `var(--color-node-panel)` → `var(--node-panel)`，容器覆盖 `--node-panel` 即生效 —— 动手前先在 DevTools 手工验证这条级联成立，不成立立即停下报告（fallback 方案再议，不要自作主张换路线）。
- NodeToolbar（选中浮出工具条）在 article 内，随卡纸化 = 预期行为（纸片工具条，视觉统一）。

## 改动清单（精确）

1. **globals.css**：新增上述两个作用域类（放既有 node 样式段附近，带指向施工图的注释）。
2. **NodeShell.tsx Root**：
   - `article` 加 `node-card-paper` 类；`rounded-2xl` → `rounded-md`（6px，禁任意值）；`bg-node-panel` 保留（被变量覆盖后即纸面）。
   - 边框：未选中 `border-node-panel-inner/80` → `border-node-card-line`（hover `border-node-card-ink-subtle`）；**选中环统一石绿**：`selected` 分支改 `border-node-paint/70 ring-2 ring-node-paint/60`，**不再消费 `accent.selectedRing`**（§5 落点③）；failed 红边、overridden 虚线保留（虚线色 `border-node-card-ink-subtle`）。
   - 拖拽微倾：globals.css 加 `.react-flow__node.dragging .node-card-paper { rotate: 1deg; }`（含 transition，release 归位；先确认 ReactFlow 拖拽态 class 名，若非 `.dragging` 用实际名）。
3. **NodeShell.Header 片头条**：header 加 `bg-node-panel-inner rounded-t-md`（覆盖后=paper-strong）+ `border-b border-node-card-line`；徽章/标题色靠变量覆盖自动成炭字。
4. **NodeShell.Footer**：`border-t` 色 → `border-node-card-line`。
5. **成分栏（只读）**：NodeShell Root 在 Header 后新增可选 slot（建议 `NodeShell.Ingredients` 或 shell 内建，按现有组合模式选择）：`nodeId` 存在时从 ReactFlow store 读入边（`target === nodeId`），渲染上游节点 chip 行（类型图标 + 节点显示名，最多 4 个，溢出「+N」；空则不渲染整行）。S2 纯展示（title 提示「来自上游连线」），无点击行为。样式：`paper-soft` 底小丸 + ink-muted 字。
6. **端口纸面校准**：
   - globals.css 新增 5 支 `--node-port-*-on-paper`（+@theme 映射）。用确定性脚本（S1 同款 WCAG 计算）从现值（`#6f6a86 / #5f7a73 / #856a72 / #647386 / #6f6a86`）**同色相加深**至对纸面 `#ebe5d8` 对比 ≥3:1 的最小偏移值。
   - `node-tokens.ts` NODE_ACCENTS：`dot` / `dotRing` / `iconText` 换 on-paper 变体类；`iconPlate` 淡底 `/20` 在纸面效果由截图目检，若徽章看不清改 `/30`。
   - NodeShell Handle：`ring-node-canvas` 环与实心/描边结构不变（连线仍在，S5b 才退场）。
7. **NodeMediaPreview**：媒体容器挂 `node-card-window` + `bg-node-card-window` + `rounded-sm`（4px）；空态/生成中图标色在深窗内已被恢复为浅字（验证）；若有生成进度条 → 石绿 `bg-node-paint`（§5 落点②）。
8. **逐卡目检修偏差**：chrome 实跑逐个节点类型截图（image 各 role / voice / seedance / videoMerge / videoReference / shotText），修正变量覆盖漏网点（如卡内 hardcode 深色、`text-node-canvas` 用作反相字的场合——石绿生成键深字属正确用法勿动）。修正原则：优先局部换 `card-*` 类，禁止为单点改全局 token。

## Allowed File Scope

- `src/components/business/node/nodes/**`（NodeShell / NodeMediaPreview / 各节点卡的偏差修正 + 对应 `.test.tsx` 断言更新）
- `src/components/business/node/composer/**`（仅卡内偏差修正）
- `src/constants/node-tokens.ts` · `src/app/globals.css`
- `docs/references/pages/node-canvas.md`（§9 S2 行标注完成；on-paper 定值回写 §2.3）

## Forbidden File Scope

- `src/app/api/**` · `prisma/**` · `src/services/**` · `src/lib/node-connection-rules.ts` · `src/messages/**`
- `node-detail/**` · `inspector/**`（除非第 8 条目检发现卡内直接渲染的 inspector 片段必须跟改——先报告再动）
- ⚠ 不 kill 3000、不 build、不另起 dev；源码只用 Edit/Write；不 commit

## Assumptions / Open Questions

- 变量覆盖级联在 Tailwind v4 下成立（动手前 DevTools 验证，见指定策略）。
- AgentNode / ComposerNode 是死类型（S6 删），本片被动跟着纸化即可，不专门修它们的偏差。
- 测试里断言旧类名（`bg-node-panel` / `rounded-2xl` 等）的用例：更新断言为新类并在报告点名，禁止删测试。

## Acceptance Criteria

- 画布上全部节点卡为纸质场记卡：纸面卡身 + 更深一档片头条 + 深窗媒体区 + 炭字；选中 = 石绿环；拖拽中卡微倾 1° 松手归位。
- 视频/合并节点片头条下可见成分栏 chip（上游连线派生，只读）；叶子节点无成分栏行。
- 端口在纸卡缘对比 ≥3:1（附确定性数值）；连线照常可见可用。
- 深窗内空态图标/文字为浅色可读；石绿生成键不受影响。
- lint 绿；全量 tsc 绿（后台 + exit code）；全量 vitest 绿（更新的断言逐条点名）。

## Validation / Evidence

- lint / 全量 tsc / 全量 vitest（红线同 S1：不 build）。
- 对比度脚本输出：5 支 on-paper 端口色 + ink on paper + card-line 边可见性数值。
- chrome 实跑截图：①整画布全景 ②单卡特写（片头条/成分栏/深窗）③选中态石绿环 ④拖拽微倾（gif 或前后帧）⑤各节点类型逐卡目检清单。
- playwright：画布无既有基线（S1 已确认）；首页 fail 为 assistant-ux 批次已知问题，照旧不更新、不误归因。
- 报告含手动验证步骤（owner 进画布看哪五处）。

## Documentation Sync

- 施工图 §9 S2 行标「✅ + 日期」；§2.3 回写 on-paper 5 支定值。
- status.md 与本包归档由 Fable 收尾。
