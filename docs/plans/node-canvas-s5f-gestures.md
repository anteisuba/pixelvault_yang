# Task Packet: 画布间改版 S5f — 手势完备片（画布吞噬全覆盖 + B2 增强三件套）

> 权威依据：施工图 `docs/references/pages/node-canvas.md` §6.0 手势总表（owner 拍板）+ §6.3（增强三件套规格）+ §8（动画数值定稿）。
> 分工：Fable 出包（2026-07-11），Sonnet 执行。S1–S5d 已全部进 main（`5b8cdfe1` 等），工作区干净。

## Goal（两组）

**A · 画布实体拖拽吞噬全覆盖**（模型 v3.1 手势总表的实现缺口，owner 点名）：

| 拖拽源（画布节点）                          | 合法目标                             | 现状                            |
| ------------------------------------------- | ------------------------------------ | ------------------------------- |
| 收集器卡（image role=character/background） | 镜头图卡 / 视频卡                    | ❌ 只是移动（owner 点名的缺口） |
| 音色（voice）                               | 收集器卡（听觉身份）/ 视频卡（旁白） | ❌                              |
| 参考视频（videoReference）                  | 视频卡                               | ❌                              |
| 散图（image 无 role）                       | 收集器卡                             | ✅ S5d 已有                     |
| 散图 → 视频/镜头卡（直接参考/关键帧）       | 视频卡 / 镜头图卡                    | ❌ 补上                         |

- 全部复用现有机制：`onNodeDragStop` 命中检测（S5d 的 `elementsFromPoint` 栈式路径，扩大源类型判定）+ `canConnectNodeTypes` 合法性（含 sourceRole/targetRole 解析）+ 建边走 `onConnect` 原路径 + 三拍动画（`use-cast-ingest` 同一份 keyframes）+ 被吃后按「有下游引用即隐藏」自然退场。
- 拖到空白 = 正常移动节点（现状不变）；命中非法目标 = 咬不动（摇头 + 原因气泡，复用 S5b 逻辑）。
- ⚠ 音色→收集器卡的边方向注意：现有矩阵是 `voice → character`（音色进角色），命中后建边方向按矩阵，不要建反。

**B · 增强三件套 + 把手热区**（§6.3 拍板，S5b 挂账）：

1. **磁吸**：拖拽中（卡匣拖拽与画布节点拖拽两种）所有合法目标微亮（石绿 outline 弱档）；指针阈值半径内最近目标张口满档（1.08）。
2. **快投模式**：CastCard hover 浮出投放钮（触屏长按 `NODE_STUDIO_INGEST_QUICK_THROW.longPressMs`）→ 合法目标全亮 + 序号角标、已含 ⊘ 半透明、点一个投一个连续投、Esc/点空白退出、顶部一行模式提示（i18n 三语）。
3. **张口预览**：张口时目标上方迷你清单「图集×N · 音色 · @名字（参考位 n/m）」；上限从模型能力契约可得才显示 n/m；超限整行红并与咬不动联动。
4. **把手热区**：卡匣折叠时，拖拽中的实体接近把手 → 横匣自动临时展开（松手/取消后回折叠态）。

## 红线（同 S1–S5d 全套，不再赘述细则）

- 数据层零改动（连 schema 都不该动这片）；渲染退场只准 hidden；禁空数组。
- dev server 3000 不碰；lint + 全量 tsc（后台+exit code）+ 全量 vitest；Edit/Write only；不 commit；禁任意值；禁 Math.random；messages 只动画布 ns 三语同步。
- 动画数值照 §8 定稿；新曲线/常量进 `motion.ts`/`node-studio.ts` 具名。

## Allowed File Scope

- `StudioNodeWorkbench.tsx` / `use-cast-ingest.ts` / `IngestDragLayer.tsx` / `CastDock.tsx` / `CastCard.tsx`（+tests）
- 新手势 hook/组件可新建（画布域目录）
- `src/constants/{node-studio,motion}.ts` · `globals.css` · messages 三语（quickThrow/preview ns）
- 施工图 §9 S5f 行新增 ✅ + §6.3 偏差回写

## Acceptance / Validation

- 五条拖拽源各自可演示（吞噬三拍 + 被吃隐藏 + 拆出可逆）；快投连点多镜；磁吸可感；张口预览清单正确（含超限红）；折叠把手热区展开。
- 三件套全绿 + chrome 实跑取证（各手势至少一证，项目「鸣潮」）+ F5 一致性 + 手动验证步骤 + 偏离事项。
- 上下文吃紧按 A → B 顺序交付，不压缩验证。

## Documentation Sync

- 施工图回写；status.md 与归档由 Fable 收尾。
