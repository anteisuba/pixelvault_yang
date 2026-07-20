# 画布 · owner 诉求 × 现有计划对账（2026-07-16）

> **性质**：Opus 4.8 调查段产出。**不是新方案** —— 画布已有完整在飞计划，本文档只做「owner 诉求 → 现有计划」的映射对账，防止重复设计。
> **结论先行**：画布**不缺规划、缺推进**。owner 这次提的诉求 ≈95% 已被现有三份文档覆盖，且部分已在 `codex/canvas-modular-redesign` 实现（PR #205 已 merge）。**下一步是推进现有切片，不是切 Fable 从头设计**（这点与 LoRA 相反）。
> **施工事实源**（本文档不取代它们）：`canvas-modular-redesign-2026-07.md`（总计划）· `canvas-module-function-catalog-2026-07.md`（功能目录）· `references/pages/node-canvas.md`（视觉施工基准）。

---

## 1 · owner 诉求 → 现有计划映射

owner 在 project-map.md 画布分支写的：学习 haivis-canvas / 整理初始状态 / 功能明确分化（助手·编辑图片·生成视频·管理资源=卡片收集）/ 澄清"不是 1:1 对标 haivis（它没视频）"。逐条对账：

| owner 诉求                           | 已覆盖在                                     | 现有 ID/位置                                                          | 在飞状态                   |
| ------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| 功能分化 · **助手**                  | module-function-catalog §6 助手 AST          | AST-S01~S04 / X01~X04                                                 | A1+AS1 **已实现**(codex)   |
| 功能分化 · **编辑图片**              | catalog §2 图片 IMG 六项编辑                 | IMG-E01 超分/E02 去背/E03 元素提取/E04 局部重绘/E05 扩展/E06 图层分解 | E1 **已实现** · E2 partial |
| 功能分化 · **生成视频**              | catalog §3 视频 VID                          | VID-S/G/O 全线                                                        | V2 **已实现**(codex)       |
| 功能分化 · **管理资源(卡片)**        | node-canvas §6 业务模型 v3.1 + CAN CastTray  | CAN-C01/C02 · 卡匣四分区 · S5a~S5f 分片                               | 分片进行中                 |
| **初始状态整理**                     | node-canvas §3 空态 + 业务模型 v3.1          | upload-first（废除 role picker 空态）· NodeCanvasEmptyGuide           | 计划中                     |
| **haivis 学习**（空间/CSS/助手）     | 总计划 Goal + node-canvas §3.1 九条 + Axis A | W0 分栏 / S1 surface / A1 助手 rail（均 P0）                          | W0/A1 **已实现**(codex)    |
| **不是 1:1 对标（有视频/节点特有）** | 总计划已是设计前提                           | "保留暖炭/纸卡/石绿/卡匣/吞噬/导演流，不复制白板；视频分工继续成立"   | 已内建                     |

> 结论：七条诉求里，六条**已在现有计划内**（多条已在 codex 分支实现）。owner 的澄清（不是对标、有视频）恰恰是总计划的既定前提，方向一致。

---

## 2 · 在飞进度对账（2026-07-14 执行状态）

`codex/canvas-modular-redesign` 分支状态：

- **已实现**：I3（图片编辑基础）· E1（图片编辑能力片一）· V2（视频）· A1（助手 rail 分栏）· AS1（助手能力）· R1（关系/吞噬）。
- **partial**：E2（图片编辑能力片二，未完）。
- **待 owner 视觉 QA**：S6。
- node-canvas 视觉分片：S1 tokens / S2 papercard / S3 stamps / S4 chrome 多处 ✅；S5a~S5f（卡匣/吞噬/卡类型/手势）进行中。

> 也就是说：画布的"助手分栏""图片编辑""视频""吞噬/卡匣"这些你要的功能分化，**引擎和 UI 大多已经落在分支上了**，不是待设计状态。

---

## 3 · 真正的新 gap（唯一需要新设计的）

**角色卡三层聚合**（owner 在画布"管理资源" + 资产"文件夹×卡片融合"两处都提到，是同一设想）：

> 角色卡升级成"一个角色的图/视频/音频/3d 聚合容器" → 场景/项目再聚合多张卡。

- 现有画布计划的 CastTray/卡匣是 **character/background/voice/videoRef 四分区**（服务画布内的装配），**不是**跨域的"多模态聚合容器 + 场景/项目层级"。
- 这个诉求**跨 画布 × 资产(/assets collection·project) × 卡片(/cards)** 三个域，**超出画布单域计划范围**。
- **建议**：不塞进画布 modular-redesign，单独拉一张跨域信息架构施工图（与 project-map.md 资产分支的判断一致）。这一条才是"需要 Fable 设计"的部分。

---

## 4 · 下一步建议（画布 ≠ LoRA）

- **画布主线 = 推进，不是重造**。下一步是推进 `canvas-modular-redesign` 的下一个切片（补完 E2 / 过 S6 视觉 QA / 推进 S5x 卡匣手势），归**执行**（Sonnet/Codex），**Fable 角色很小**——node-canvas.md 视觉施工基准已极详尽，只在个别未定视觉稿才需要 Fable。
- ⚠ **别让 Fable 从头设计画布**：会和 codex 分支已实现的东西撞车、重复劳动。要动画布，先对现有切片 ID（W0/S1/A1/E1/E2/S5x），推进而非新建。
- **唯一进 Fable 的画布相关设计** = §3 角色卡三层聚合（且它其实是跨域架构，建议和资产/卡片域合并考虑，不算纯画布）。
- **执行归属待 owner 理**：画布重构目前在 `codex/canvas-modular-redesign` 推进；memory 曾记"画布归 Claude 端到端"。谁接着推 owner 定，但计划本身是连续的。

---

## Source of Truth

- 现有计划（施工以它们为准）：`canvas-modular-redesign-2026-07.md` · `canvas-module-function-catalog-2026-07.md` · `references/pages/node-canvas.md` · `canvas-image-edit-convergence-2026-07.md`。
- 对标证据：`references/ui-inspiration/haivis-canvas-2026-07.md`（owner 2026-07-13 已核验标注）。
- 代码：`src/components/business/node/**`（含已存在的 CanvasImageEditWorkspace / CastDock / IngestDragLayer 等）。

## Last Verified

- Date: 2026-07-16 · Method: 读 node-canvas.md + canvas-modular-redesign + canvas-module-function-catalog + node 组件清单，比对 owner project-map 画布诉求。未改产品代码。
