# Task Packet: 画布间改版 S3 — 盖章状态系统（NodeStatusBadge → 章）

> 上游施工图：`docs/references/pages/node-canvas.md` §4 / §5 / §9-S3 / §10。
> 分工：Fable 出包（2026-07-10），Sonnet 执行。S1+S2 已 commit（`2b4906a4`）。

## Goal

- 节点状态 badge 从「圆角胶囊」改为「盖章」视觉：描边矩形 + 微倾 + 制片语言文案（待拍/拍摄中/已收/NG…），8 个状态全映射，纸卡/深 chrome 两种环境自适应。

## Non-goals

- 不做审阅循环「过/重拍」章式按钮（Board 期接入，§4 已注明）。
- 不引入手写体（S6）；不动 NodeShell 其他部分；不动详情面板结构。

## Task Scene / Type

- UI（scenes/ui-page.md · 画布域）· checklist = `docs/checklists/ui.md`

## Read First

- 施工图 §4（章表）§5（石绿落点②）§10；`docs/forbidden.md` UI 节 + CI/CD 节（dev server 在跑）

## Source of Truth（已侦察）

- `src/components/business/node/nodes/NodeStatusBadge.tsx`（36 行：h-7 rounded-xl 胶囊 + STATUS_COLORS + queued spinner / running pulse）
- `src/constants/node-tokens.ts` `STATUS_COLORS`（8 态类映射）
- `src/constants/node-types.ts` `NODE_STATUS_IDS`：idle / queued / ready / running / done / failed / stale / disabled（**8 态，比施工图 §4 的 6 档多 ready/disabled**）
- i18n：`StudioNode.statuses`（zh/en/ja 三语现有 8 个 key）

## 状态→章 完整映射（8 态定稿，执行按此表）

| 状态     | 渲染                   | 章文 zh / en / ja         | 配色（变量类，纸/深自适应）                                                           | 动效             |
| -------- | ---------------------- | ------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| idle     | **不渲染**（素卡无章） | —                         | —                                                                                     | —                |
| queued   | 章                     | 待拍 / Standby / 待機     | `text-node-muted border-current`                                                      | Loader spin 保留 |
| ready    | 章                     | 就绪 / Ready / 準備完了   | `text-node-foreground border-current`                                                 | 无               |
| running  | 章                     | 拍摄中 / Rolling / 撮影中 | `text-node-paint border-current`（石绿，§5 落点②）                                    | pulse 点保留     |
| done     | 章                     | 已收 / Wrapped / 収録済み | `text-node-foreground border-current`                                                 | 无               |
| failed   | 章                     | NG / NG / NG              | `text-node-status-failed-fg border-node-status-failed`（真红，沿用现有 failed token） | 无               |
| stale    | 章                     | 过期 / Stale / 期限切れ   | `text-node-subtle border-current`                                                     | 无               |
| disabled | 章                     | 停用 / Disabled / 無効    | `text-node-subtle border-current`                                                     | 无               |

- 配色原则：章 = 描边 + 同色文字 + **透明底**（§4「结构表达」）；用 `text-node-*` 变量类 → S2 的 `.node-card-paper` 作用域内自动变炭墨系、深 chrome（详情面板等）自动浅色系，**不写两套**。
- en 章文用制片行话（Standby/Rolling/Wrapped/NG）；ja 对应（待機/撮影中/収録済み/NG）。允许微调措辞但三语必须同步提交、语义一致。

## 改动清单（精确）

1. **NodeStatusBadge.tsx**：
   - `status === idle` → `return null`（idle 无章；消费方无需改动，грep 确认没有依赖 badge 占位撑高的布局——若 header 高度塌陷，给 header 侧最小高而不是留假章）。
   - 胶囊 → 章：`rounded-xl` → **直角**（`rounded-none`，印章语言；若目检生硬可用项目最小圆角档并在报告说明）；加 `border`（1px，来自配色列）；透明底（删 STATUS_COLORS 里的 bg-\* 底色类）；微倾 `-rotate-2`（标准档，禁任意值）；`h-7 px-2.5 text-xs font-semibold uppercase tracking-nav-dense` 保留。
   - queued spinner / running pulse 结构保留。
2. **node-tokens.ts `STATUS_COLORS`**：按映射表重写为「描边章」类组（透明底 + text/border 对）；grep `STATUS_COLORS` 全部消费者，若详情面板/inspector 也消费，确认新章类在深 chrome 环境可读（变量系统应自动成立，截图证明）。
3. **i18n 三语**：`src/messages/{zh,en,ja}.json` 的 `StudioNode.statuses` 8 个值按映射表更新（先 grep 确认该 ns 仅画布域消费，若被非画布页消费 → 停下报告）。⚠ 本片 **允许改 `src/messages/**`**（覆盖 S1/S2 包的禁区默认值，仅限 `StudioNode.statuses` 这一个 ns）。
4. **微倾细节**：章容器 `-rotate-2`；勿对 header 整行旋转；overflow 检查（旋转后不被 `overflow-hidden` 裁角——NodeShell Root 是 `overflow-visible`，header 若有裁切放宽到章不裁）。

## Allowed File Scope

- `nodes/NodeStatusBadge.tsx`（+ 其 test 若有）· `src/constants/node-tokens.ts` · `src/messages/{zh,en,ja}.json`（仅 StudioNode.statuses）
- 消费面断言更新的 `.test.tsx`（逐条点名）
- 施工图 §9 S3 行标注 ✅；§4 表若有细化（8 态全表）回写

## Forbidden File Scope

- 其余一切（api/prisma/services/NodeShell 主体/详情面板结构）；⚠ 不 kill 3000、不 build、源码只用 Edit/Write、不 commit

## Acceptance Criteria

- 画布上：idle 卡无章；queued「待拍」、ready「就绪」、done「已收」为炭墨描边章微倾；running「拍摄中」石绿章；failed「NG」红章。EN/JA 切语言章文对应。
- 详情面板等深 chrome 环境中章为浅色描边可读（截图证明）。
- lint / 全量 tsc / 全量 vitest 绿（i18n key 变更可能波及断言，更新逐条点名）。

## Validation / Evidence

- 三件套（红线同前，不 build）。
- chrome 实跑截图：纸卡上四种章（就绪/完成态项目里现成可看，queued/running 如无实例说明即可）+ 详情面板内章 + EN 语言切换一张。
- i18n 一致性：`i18n-check` 有对应校验就跑（`npm run` 里找），没有则 grep 三文件 key 齐全。
- 报告含手动验证步骤。

## Documentation Sync

- 施工图 §9 S3 ✅ + §4 回写 8 态全表；status.md 与归档由 Fable 收尾。
