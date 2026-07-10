# Task Packet: 画布间改版 S1 — token 层落地（暖炭桌面 + 纸卡 token 组 + 石绿生成键）

> 上游施工图：`docs/references/pages/node-canvas.md`（唯一施工基准，§2 token / §9 切片表）。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。完成后本包按文档生命周期删除/归档。

## Goal

- 画布 token 层完成 v2 制片桌迁移第一片：4 个 chrome token 调暖、新增 10 支纸卡/颜料 token（只定义不消费，`--node-paint` 除外）、生成键从 emerald 换石绿、`--node-lipsync` 删除。

## Non-goals

- 不动任何组件布局/结构/交互（S2+ 的事）；不消费 `--node-card-*` token（S2 才用）。
- 不做端口 `-on-paper` 变体（S2）。
- 不 commit / push（owner 核对后决定）。

## Task Scene / Type

- UI（scenes/ui-page.md · 画布域）· checklist = `docs/checklists/ui.md`

## Read First

- `docs/references/pages/node-canvas.md` §2（token 表）§5（石绿落点）§9（S1 行）§10（Do Not Break）
- `docs/forbidden.md` UI 节 + CI/CD 节（⚠ dev server 正在跑）
- memory 无需读，本包自足

## Source of Truth

- `src/app/globals.css`：`:root` node 段（L286 起）+ `@theme inline` 映射（L24 起）
- `src/constants/node-studio.ts`：`NODE_STUDIO_CANVAS.background`（点阵网格配置，L10 起）
- 引用面（已侦察）：`node-success` → `VideoComposer.tsx:700` · `CharacterImageInspector.tsx:96` · `VideoMergeInspector.tsx:336` · `NodeCardControls.tsx:148` + globals.css 定义/映射；`node-lipsync` → 仅 globals.css

## 改动清单（精确）

1. **globals.css 调值**（`:root` node 段）：
   - `--node-canvas: #0b0b0a` → `#14120f`
   - `--node-panel: #1a1a1a` → `#191612`
   - `--node-panel-inner: #2a2a2a` → `#221f1b`
   - `--node-panel-soft: #202020` → `#1c1915`
2. **globals.css 新增**（`:root` node 段 + `@theme inline` 各加一份映射 `--color-node-*`）：
   `--node-card-paper: #ebe5d8` · `--node-card-paper-strong: #e0d8c8` · `--node-card-paper-soft: #f4efe4` · `--node-card-ink: #26231e` · `--node-card-ink-muted: #5f594e` · `--node-card-ink-subtle: #8a8070` · `--node-card-window: #1b1917` · `--node-card-line: #c9c0ab` · `--node-paint: #3D8A6B` · `--node-paint-fg: #ebf3ee`
3. **生成键换石绿**：上列 4 个组件文件里 `node-success` 全部换 `node-paint`（bg/border/text 同名对应）；随后删 globals.css 的 `--node-success` 定义与 `--color-node-success` 映射。**全仓 grep `node-success` 兜底为零**（含测试与 e2e，侦察只扫了 src/）。
4. **生成键文字对比度复核（不许心算拍死）**：石绿 `#3D8A6B` 比 emerald 深，现文字 `text-node-canvas`（近黑）可能临界。用确定性工具（node 脚本算 WCAG 相对亮度）比较 `#14120f` vs `#ebf3ee` 在 `#3D8A6B` 上的对比度，取达标者（目标 ≥4.5:1；两者都不达标则把 `--node-paint` 微调至一档达标的明度，并在报告中给出新值以便回写施工图）。
5. **删 lipsync**：globals.css `--node-lipsync` 定义（约 L298）+ `--color-node-lipsync` 映射（约 L33）；全仓 grep 兜底为零。
6. **点阵网格**：查 `NODE_STUDIO_CANVAS.background` 是否含颜色字段；若网格色是硬编码深灰，改为 `#26231e`（暖炭点阵）；若色来自 CSS/ReactFlow 默认，找到实际来源同步。判据：暖炭桌面上点阵可见但极淡。
7. **注释更新**：globals.css node 段头注释改写为「v2 制片桌（施工图 references/pages/node-canvas.md）：panel 系 = 深色 chrome；card-\* = 纸卡材质（S2 起消费）；paint = 石绿颜料」，保留/更新原 node-amber 历史注释。

## Allowed File Scope

- `src/app/globals.css` · `src/constants/node-studio.ts`
- 上列 4 个 `node-success` 引用组件（仅 class 名替换）
- 全仓 grep 出的其他 `node-success` / `node-lipsync` 引用（同性质替换/删除）
- `e2e/visual.spec.ts` 相关快照基线（见 Validation）
- `docs/references/pages/node-canvas.md`（仅 §9 S1 行标注完成日期；若 paint 调值则回写 §2.2）

## Forbidden File Scope

- `src/app/api/**` · `prisma/**` · `src/services/**` · Clerk / credit · `src/messages/**`
- 任何组件的结构/布局改动；`node-tokens.ts` 的 accent 体系（S2）
- ⚠ **不 kill 端口 3000、不 `npm run build`、不另起 dev 实例**（owner dev server 正在跑，并行 build 会毁 .next）

## Assumptions / Open Questions

- 已确认：吞噬/纸卡等大件在后续切片，本片纯 token；`--node-card-*` 定义后暂无消费者是预期状态（不要因 lint 报未使用而删除——CSS 变量不会报）。
- 若发现 `node-success` 在非「生成/成功」语义处被引用（侦察未见），停下来在报告中列出，不擅自定夺。

## Acceptance Criteria

- 画布页（`/zh/studio/node`）桌面与 chrome 色温可见转暖（截图对比），生成键为石绿。
- 全仓 `node-success` / `node-lipsync` 引用为零；新 token 10 支在 `:root` 与 `@theme inline` 各就位。
- 生成键文字对比度有确定性数值记录且 ≥4.5:1（或记录微调后的 paint 值）。
- lint 绿；**全量 tsc** 绿（后台跑 + 显式捕获 exit code，~4 分钟，禁超时跳过）；**全量 vitest** 绿（~4.5 分钟，token 值可能被测试断言，禁定向子集）。

## Validation / Evidence

- `npm run lint`；全量 tsc（后台 + exit code）；全量 vitest。**不跑 build**（dev server 在跑，以 lint+tsc 替代，报告中说明）。
- 视觉：claude-in-chrome 实跑 `localhost:3000/zh/studio/node`（HMR 热更后）截图：桌面色温 / 生成键石绿 / 点阵可见性。
- 视觉基线：`npx playwright test e2e/visual.spec.ts`（`reuseExistingServer: true` 复用 3000）。S1 色温变化预期撼动画布快照 → `--update-snapshots` 更新 **`-win32` 套**并在报告中点名每张更新的快照；darwin 套留待 Mac 端（双机基线规则）。非画布页快照若被波及 = 泄漏信号，停下报告。
- 报告含：改动清单 / 对比度数值 / 基线更新清单 / 手动验证步骤（进画布看哪三处）。

## Documentation Sync

- `docs/references/pages/node-canvas.md` §9 S1 行标「✅ 2026-07-10」；paint 若调值回写 §2.2。
- status.md 与本包归档由发包人（Fable）收尾，执行方不动。
