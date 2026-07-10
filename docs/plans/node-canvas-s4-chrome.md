# Task Packet: 画布间改版 S4 — Chrome 换皮（failed 真红收尾 + 片名条 + minimap 蓝图 + 工具条核查）

> 上游施工图：`docs/references/pages/node-canvas.md` §3 / §4（已知发现）/ §5 / §9-S4。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。S1+S2 已 commit（`2b4906a4`），S3 完成待 commit。
> ⚠ **范围裁剪**：原 §3 的「剧本笺」（StudioNodeAssistantDock/AssistantConversation 换皮）**移出本片挂账** —— 该文件是 assistant-ux 在飞批的主战场，避免跨批次同文件纠缠；待该批收口后另行成片。

## Goal

- 四件事：① failed 真红 token 迁移收尾（S3 遗留债）② 顶栏项目名改「片名条」+ 添加节点纸色反相丸 + 导航徽标石绿（§5 落点⑤）③ minimap 蓝图化 ④ 工具条 v1 残留核查（预期近零改动）。

## Non-goals

- **不碰** `StudioNodeAssistantDock.tsx` / `AssistantConversation.tsx`（挂账，理由见上）。
- 不动空态（S6）、不动吞噬/卡匣（S5）、不改任何交互行为。

## Read First

- 施工图 §3（顶栏/工具条/minimap 行）§4 已知发现（failed 对比度）§5（石绿落点⑤）；forbidden UI+CI/CD 节

## Source of Truth（已侦察）

- failed 定值：`globals.css` L350–351 `--node-status-failed: #3a1e1e` / `-fg: #f09595`（旧暗枣红胶囊配色）；消费者 = NodeMediaInspector / AgentNode（死类型，被动跟随）/ NodeMediaPreview / NodeShell（failed 边框 + 删除按钮 hover `bg-node-status-failed/40 + text--fg`）/ node-tokens.ts STATUS_COLORS
- `CanvasTopBar.tsx`：容器 L93（panel/95 深 chrome，保持）；徽标 L98（size-9 bg-panel-inner）；项目名按钮 L111（panel-soft 底 + panel-inner 边）；下拉菜单 L132+（深 chrome，**不动**）；添加节点主钮在文件更下方（自行定位）
- `CanvasMiniMap.tsx`：ReactFlow `<MiniMap>` props L20–25（nodeColor/maskColor/bgColor 走 panel 变量）
- `CanvasBottomDock.tsx`：已全走 panel 系变量（S1 自动变暖）；激活态反相 L98

## 改动清单（精确）

### 1. failed 真红迁移（第一优先）

- `:root`：`--node-status-failed: #e5484d`（真红本体：章描边/章文字/failed 卡边框都用它）；`--node-status-failed-fg` 语义收窄为「红底上的前景」，定值由确定性计算给出（消费场景 = 删除按钮 hover 的 `bg-node-status-failed/40` 混合底，深 chrome 与纸面两种环境下前景对比都需 ≥4.5:1；两环境无法一值兼得就在 `.node-card-paper` 作用域覆盖）。
- `.node-card-paper` 作用域（globals.css S2 已有的类）追加：`--node-status-failed: <纸面深红>`（对 `#ebe5d8` ≥4.5:1，确定性计算，起点参考 `#a32d2d` 附近）+ 需要时的 `-fg` 覆盖。
- `node-tokens.ts` STATUS_COLORS failed 行：改 `border-node-status-failed text-node-status-failed`（章=描边+同色字，与其他 7 态语言一致）。
- **node-danger 别名收尾**（globals L310 注释挂账的 strangler）：grep `node-danger` 全部引用，≤10 处则全部改引 `node-status-failed` 并删 `--node-danger` 定义+映射；>10 处只做上述定值、报告缓行。
- 验收数值：章描边/文字在深 chrome（`panel-inner #221f1b`）与纸面（`paper #ebe5d8`）双向 ≥4.5:1；failed 卡边框 ≥3:1（非文字）。

### 2. 顶栏片名条（CanvasTopBar.tsx）

- 项目名按钮（L111）→ **片名条**：`bg-node-card-paper`、名字 `text-node-card-ink`、hover `bg-node-card-paper-strong`、边框去掉或 `border-node-card-line`；chevron `text-node-card-ink-muted`；focus ring 保留。⚠ 按钮内若有时间戳/次级字继承浅色变量，需局部换 `card-ink-muted`（这里没有 S2 的作用域类，变量不会自动反转——**逐元素显式换类**）。
- 添加节点主钮 → **纸色反相丸**：`bg-node-card-paper text-node-card-ink hover:bg-node-card-paper-strong`（原深色丸样式替换；聚焦环保留）。
- 导航徽标（L98）：icon 色换 `text-node-paint`（§5 落点⑤，底保持 `panel-inner`）；确定性核对石绿对 `panel-inner` 对比（装饰性图标 ≥3:1 即可，不达标微调为在深底可读的处理方式并报告）。
- 下拉菜单、「N 个节点」chip、右侧图标钮组、容器：**不动**（深 chrome 是设计）。

### 3. minimap 蓝图（CanvasMiniMap.tsx + globals.css）

- 新增 2 支 token（`:root` + `@theme inline`）：`--node-blueprint-bg: #101820` · `--node-blueprint-line: #2e4a5e`（施工图 §3 建议值，可按目检微调但须回写）。
- `<MiniMap>`：`bgColor=var(--node-blueprint-bg)`；节点改**线框感**——`nodeColor` 用 blueprint-bg（或半透明）+ `nodeStrokeColor=var(--node-blueprint-line)` + 合适 `nodeStrokeWidth`（ReactFlow MiniMap API 实查）；`maskColor` 改 blueprint-bg 系混合；容器 border 换 `border-node-blueprint-line/40`。
- 判据：左下角小窗呈「深青蓝图纸 + 青线框节点」，与画布暖炭形成材质区分；节点位置仍可辨。

### 4. 工具条核查（CanvasBottomDock.tsx）

- 预期近零改动：确认无 v1 残留色（amber/emerald/lime 类）、激活态反相（`bg-node-foreground text-node-canvas`）保留即可；发现残留才动手，并逐条点名。

## Allowed File Scope

- `CanvasTopBar.tsx` / `CanvasMiniMap.tsx` / `CanvasBottomDock.tsx`（+ 各自 test 断言更新，逐条点名）
- `src/app/globals.css` · `src/constants/node-tokens.ts`
- failed/node-danger 消费面 grep 出的引用替换（NodeShell / NodeMediaPreview / NodeMediaInspector / AgentNode 等，仅 class/token 名替换）
- 施工图 §9 S4 行 ✅、§3 minimap 行回写定值、§4 已知发现标记已修复

## Forbidden File Scope

- `StudioNodeAssistantDock.tsx` / `AssistantConversation.tsx`（挂账！）· api/prisma/services/messages
- ⚠ 不 kill 3000、不 build、源码只用 Edit/Write、不 commit

## Acceptance Criteria

- failed：NG 章纸面/深底双向可读（数值达标）；failed 卡红边、删除按钮 hover 红态正常；`node-danger` 收尾或明确缓行理由。
- 顶栏：项目名为纸条炭字、添加节点为纸色丸、徽标 icon 石绿；下拉菜单等其余保持深 chrome。
- minimap：蓝图纸质感落地，token 化无魔法值散落。
- lint / 全量 tsc / 全量 vitest 绿。

## Validation / Evidence

- 三件套（红线同前，不 build）+ 对比度确定性数值表（failed 双环境 / 徽标石绿）。
- chrome 截图：顶栏片名条特写 / minimap 蓝图 / failed 态制造或说明（无实例时用 DevTools 强制状态类截图）。
- 报告含手动验证步骤。

## Documentation Sync

- 施工图同步（见 Allowed）；status.md 与归档由 Fable 收尾。
