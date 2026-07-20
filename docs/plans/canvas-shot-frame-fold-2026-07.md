# 镜头/首帧收编为「图片 + 分类」— 影响评估 + 切片计划

> 状态：**影响评估**（2026-07-19，opus 调查产出，owner 真机反馈"镜头和首帧完全可以用图片来代替，图片分类里有个镜头和首帧就行"后立为切片）。评估先行，实施待 owner 看过评估拍板。
> 关联：`canvas-relationship-v3-2026-07.md`（画布关系/节点线）· `references/pages/node-canvas.md` · `node-workflow-migrate-image-roles.ts`（已存在的 legacy→unified 迁移）。

## -1. 分类的真正目的（owner 2026-07-19 澄清 · 本切片的第一需求）

**分类不是给人看的组织标签，是 prompt 语义。** owner：「分类的作用是，写 prompt 的时候直接引用这个 token 后，Seedance 那边可以直接知道这个图片的名字**以及分类**。」

即：@token 引用 → 发送时自动图例产出「图N = 名字（分类）」→ Seedance 收到"这张图叫什么、是什么用途（镜头/首帧/角色/场景/服装/道具…）"。这套机制 **R3-6 已建**（`buildReferenceAssetLegendEntries` 把 referenceAsset 的分类打进 `buildShotReferenceLegend`/`buildVideoReferenceLegend`，格式「图N = 名字（分类）」）。

**对本切片的硬要求**：镜头/首帧收编为 role 后，被 @token 引用时**图例必须照样吐出「名字（镜头/首帧）」**——所以 role 方案要补一步：**role=shot/frame → 图例分类标签映射**（镜头/首帧），与其它 imageCategory 图片（角色/场景/服装/道具/自定义）走同一份图例格式。这样"所有被引用的图都带名字+分类进 Seedance"这个 owner 心智模型在全类型统一成立，不只镜头/首帧。

## 0. 结论先行

**方向与现有架构一致，不是从头造。** 统一 `image` 节点 + `role`（character/background/shot/frame/closeup）**早已存在**——`node-workflow-migrate-image-roles.ts` 就是把 legacy 独立类型（characterImage/backgroundImage/shot/frameImage）迁移成 `image`+role；连接矩阵 `node-connection-rules.ts` 已处理 `image role=shot`（L133-137）。owner 的"镜头/首帧=图片+分类"= **把独立的 `shot`/`frameImage` 类型退役、统一走 `image`+role，在 UI 上以"分类"呈现**。剩下的是收口 + 感知层统一，不是造引擎。

⚠ 但"role"（节点语义角色，驱动连接/收割/管线）与"imageCategory"（参考素材分类，驱动图例）是**两套东西**，owner 说的"分类"要落在哪一套是本评估的核心分叉（见 §3）。

## 1. shot/frame 现在是什么

|      | 独立类型（legacy）         | 统一 image + role  | 生成行为                                                                   |
| ---- | -------------------------- | ------------------ | -------------------------------------------------------------------------- |
| 镜头 | `NODE_TYPE_IDS.shot`       | `image` role=shot  | 从 shotText + 角色/场景参考生成单张镜头图（收割上游 character/background） |
| 首帧 | `NODE_TYPE_IDS.frameImage` | `image` role=frame | 生成关键帧（`isKeyframeNode` 认；喂视频卡的关键帧槽）                      |

两者**已经**能以 `image`+role 存在（migrate 脚本产物），独立类型是历史兼容 + 部分创建入口仍在用。

## 2. 影响面（grep 实测，~50 文件引用 shot/frameImage/role）

按"必须改 / 兼容保留 / 只读核对"分三档：

**必须改（创建入口 + 感知层）**

- `constants/canvas-add-catalog.ts`：添加菜单里"镜头图/首帧"当前创建独立类型 → 改为创建 `image`+role=shot/frame。
- `StudioNodeWorkbench.tsx` / `node-presentation.ts`：节点分发与呈现里对 shot/frameImage 的分支收敛到 image+role。
- `ShotNode.tsx` / `FrameImageNode.tsx`：已是"有图走 LooseImage、无图走 NodeMediaPreview"的薄壳（ShotNode 已这样），frame 对齐；最终可退役为 image role 分发。
- add-menu / 空态文案：镜头/首帧作为图片"分类"呈现（文案 + 图标）。

**引擎已兼容（核对不改或小改）**

- `node-connection-rules.ts`：已处理 `image role=shot`（收 character/background）；frame 作为 leaf 已处理。核对 seedance 矩阵对 image-role-shot/frame 的接受与 legacy 一致。
- `node-workflow-graph.ts`：`harvestUpstreamImageReferences`（shot 收割）/ `isKeyframeNode`（frame 认关键帧）——已认 role 与 legacy 双路（S5d 的 imageCategory frameStart/frameEnd 兼容已在）。核对全覆盖。
- `node-workflow-migrate-image-roles.ts`：迁移已存在，存量卡加载即转 image+role，**旧存档零风险**。

**只读核对（测试 + 详情）**

- `node-detail/registry.ts` + `ShotInspector`/`FrameImageInspector`/`FrameDetailBody`：详情按 role 分发，核对 image role=shot/frame 命中正确 body。
- 各 `.test.ts`（connection-rules/graph/migrate/add-catalog…）：断言随类型退役更新。

## 3. 核心分叉（owner 拍板点）："分类"落 role 还是 imageCategory？

| 方案                 | 落点                                                          | 优点                                                                            | 代价                                                                                                                                             |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A · role（推荐）** | 镜头/首帧 = `image` role=shot/frame，UI 把 role 呈现为"分类"  | 与连接矩阵/收割/关键帧引擎**天然对齐**（role 本就驱动它们）；退役独立类型即收编 | role 是有限枚举，"分类"扩展性弱（要新分类得加 role）                                                                                             |
| B · imageCategory    | 镜头/首帧 = 普通 image（role=loose）+ imageCategory=镜头/首帧 | 分类可自由扩展（走 NODE_STUDIO_REFERENCE_ROLES + 自定义）                       | imageCategory 现在只驱动**图例**，不驱动连接/收割/关键帧——要让镜头图能喂视频、首帧当关键帧，得把这些引擎改成认 imageCategory，**引擎改动大得多** |

**我的推荐 = A**：owner 要的核心价值是"少两个节点类型、统一成图片"，role 方案直接复用已建引擎（连接/收割/关键帧全认 role），退役独立类型即达成；"分类"在 UI 层把 role=shot/frame 展示成「镜头」「首帧」标签即可。B 的自由扩展性在这里用不上（镜头/首帧是固定的制片语义，不是用户自定义分类），却要重写引擎认 imageCategory，得不偿失。

## 4. 切片拆分（拍 A 后交 Sonnet，一次一片全绿）

- **SF-1 添加入口收编**：canvas-add-catalog「镜头图/首帧」改创建 `image`+role=shot/frame（不再建独立类型）；add-menu 文案/图标把它们呈现为图片的"分类"；独立类型创建入口退役。存量与 legacy 解析不动（migrate 脚本兜底）。
- **SF-2 感知层统一**：节点分发/呈现/详情分发里 shot/frameImage 分支收敛到 image+role；核对 ShotNode/FrameImageNode 薄壳可退役或保留为 role 分发。
- **SF-3 引擎全覆盖核对 + 测试**：connection-rules/harvest/isKeyframeNode 对 image role=shot/frame 与 legacy 完全等价的回归测试；类型退役后的断言更新。
- **SF-2b 图例分类映射（§-1 硬要求，第一优先）**：镜头/首帧 role 被 @token 引用时，`buildVideoReferenceLegend`/`buildShotReferenceLegend` 吐「图N = 名字（镜头/首帧）」——补一份 `role → 图例分类标签` 映射（复用 `NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS` 或平行常量），与 imageCategory 图片同格式同管线。单测断言镜头/首帧引用后的图例文本含分类。**这条是 owner 澄清的核心目的，比类型退役更优先**——即使类型退役后置，图例带分类也要先成立。
- **SF-4（可选）死类型清理**：`shot`/`frameImage` enum 值随 composer/agent 一起进 S6 死类型清理（保留 legacy 解析，删创建路径）。

## 5. 风险与红线

- **旧存档零漂移**是硬指标：migrate-image-roles 已把 legacy 转 image+role，加载即兼容；本切片只动"新建路径"，不动解析。
- 视频管线（镜头图喂 seedance、首帧=关键帧槽）必须回归测试等价——SF-3 的核心。
- 数据层 additive/兼容，不删 enum 值（只删创建入口），走 S6 再清。
- UI-only 呈现改动守画布现皮肤（2026-07-19 皮肤限定：本轮实现皮肤不外泄、非未来身份）。

## 6. Source of Truth

- 现有统一 role 架构：`node-workflow-migrate-image-roles.ts` · `node-connection-rules.ts` · `constants/node-types.ts`（role 枚举）。
- 添加入口：`constants/canvas-add-catalog.ts`。
- 收割/关键帧：`lib/node-workflow-graph.ts`（harvestUpstreamImageReferences / isKeyframeNode）。

## 7. Last Verified

- 2026-07-19 · opus grep 实测 shot/frameImage/role 影响面（~50 文件）+ 确认 migrate-image-roles 迁移与 connection-rules image-role-shot 已存在。未改产品代码，纯评估。
