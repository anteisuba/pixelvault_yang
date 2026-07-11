# 设计稿：视频节点引用 / 卡片 / token —— Seedance 落地重设计

> 状态：**设计稿待 owner 逐节拍板**（2026-07-11）。触发：owner 质疑「@名字 token 传给 Seedance 是否真生效」，联网核验揭示 off-spec，反推卡片/token/节点设计。
> 上游事实源：Seedance 2.0 reference-to-video 官方契约（fal 官方页 + 一致性/身份漂移实测指南，2026-07-11 核验）。
> 关联：不影响吞噬/卡匣交互（已 commit）；本稿改的是**视频节点的引用送法 + 发送序列化 + 视频节点 UI**。

## 0. 拍板记录

**Seedance 事实（核验）**：

1. 引用**只认位置 token** `@Image1`/`@Image2`/`@Video1`/`@Audio1`（对应 image_urls/video_urls/audio_urls 数组顺序）；**不认自定义名字**，角色靠文字说明。
2. 每个身份最多 **2 张参考图、角度接近**（6 张收到 2 张，后续镜头漂移降 ~60%）；每图关联一个「身份槽」（条件注意力防串味）。
3. 容量：图 ≤9 · 视频 ≤3 · 音频 ≤3 · 合计 ≤12 文件。
4. 多角色同帧支持（各自参考图，同时维持多身份）。

**owner 决策（2026-07-11）**：

- 主图 = 每张卡（每个身份）**1 张，用户指定**（默认送 1 张；Seedance ≤2 的余量留作「可选加送 1 副图」口子，MVP 不强制）。
- token 用 **`@Image1`（英文位置）**。
- 视频节点 UI 改「管理素材」面板，取代现「参考素材五分区」。
- 卡片抽象**保留**（= Seedance 身份槽），不舍弃；舍弃的只是「把卡里所有图倒给 Seedance」。

## 1. 三层 token 模型（核心）

| 层         | 用什么                                  | 谁看               | 谁产                          |
| ---------- | --------------------------------------- | ------------------ | ----------------------------- |
| **创作层** | `@弗洛洛`（名字 token）                 | 用户 / 编辑 prompt | MentionInput chip（现状保留） |
| **翻译层** | 名字 → 位置（按 image_urls 顺序编号）   | 无（发送那一刻）   | 发送序列化（新增/改造）       |
| **传输层** | `@Image1`（位置 token）+ 名字降括号说明 | Seedance           | video-request-builders        |

用户全程看 `@弗洛洛`；Seedance 收 `@Image1`。名字是「创作语言」，位置是「传输语言」，中间一层翻译。**音频/视频现状已是此模式**（chip @Audio1 + 名字说明），图片对齐即可。

## 2. 卡片模型精修（= Seedance 身份槽）

- **卡片 = 一个身份/主体**（角色/场景/画风/道具/自定义）= Seedance 一个身份槽。抽象正确，保留。
- **主图（新增概念）**：卡片收藏多图供人组织/换用，但**只有用户指定的 1 张「主图」真送 Seedance**（★ 标记）。Seedance 每身份 ≤2 图，故留「可选再指定 1 张副图一并送」的口子，MVP 默认只送主图。
- **声音**：打包在角色卡里是组织方便；发送时走**独立 audio 槽**（@AudioN），不占图槽。
- 收藏的非主图：仅用于人快速换主图 / 未来备选，不送 Seedance。

## 3. 发送序列化规则（正确性核心）

1. **只送「已引用」**：prompt 里 @ 到的素材才进 payload（截图「已引用 4 / 已连接 18」的分野 = 送/不送的分野）。已连接未引用 = 可选素材盘，不发。→ 顺带解决容量 + 「未引用图 Seedance 用不用」的不确定（压根不发）。
2. **名字→位置翻译**：把 prompt 里的 `@弗洛洛`/`@长麻花馆` 按其主图在 image_urls 的落位，替换成 `@Image1`/`@Image2`；同时在 prompt 相应处或图例注入名字说明「@Image1 是弗洛洛，保持外观」。
3. **主图入 image_urls**：每个已引用卡 → 其主图（1 张，可选 +1 副图）按引用顺序推入 image_urls。
4. **多身份**：多个已引用角色 → 各自主图各占一个身份槽，prompt 分别 @ImageN 说明（Seedance 支持多身份）。
5. **容量护栏**：已引用**图** > 9 时提示用户取舍（Seedance 图上限）；合计文件 > 12 同理。
6. **音频/视频**：维持现状（@AudioN/@VideoN 位置 + 名字说明），已正确。

> 待确认：token 语言用英文 `@Image1`（owner 已定）；但**中文 prompt 里内嵌英文 @Image1** 是否影响 Seedance 的中文理解——建议实现后做一次实测抽查（非阻塞）。

## 4. 视频节点 UI（管理素材面板，取代五分区）

对齐 owner 截图：

- **左侧引用条**：已引用素材横排（角色/场景/镜头/声音…），每个一张缩略图 + 名字 + `@token` + 类型 + 强调线；「＋」插入。
- **右侧「管理素材」抽屉**（点「管理素材」开）：`已连接 N` 全量素材列，`全部 / 角色 / 场景 / 镜头 / 声音` 类型 tab + 搜索（名称或 token）；每行 缩略图 + 名字 + 类型 + `@token` + 状态（**已引用 / 插入**）+ ⋮。
- **创意指令区**：prompt 编辑，@名字 chip 内嵌（现 MentionInput 保留），底部计数「已引用 N / 已连接 N · 字数/2000」。
- **右栏参数**（模型/时长/分辨率/比例/生成音频/seed）：现状保留。
- 现「参考素材五分区（角色/场景/镜头/动作/旁白 slot）」→ 由上面的引用条 + 管理素材抽屉取代。

## 5. 与现有实现的改动面（反推）

| 面                                  | 现状                                  | 目标                                                                                   |
| ----------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| MentionInput 序列化                 | 图片 = `@名字`                        | 创作层仍 `@名字`；**新增发送翻译**把已引用 @名字 → @ImageN                             |
| `buildShotReferenceLegend`          | 图例「图N = 名字」中文，body 仍 @名字 | 改为 body 内 @名字→@ImageN 替换 + 「@ImageN 是名字」说明；或保留图例但 body 用 @ImageN |
| `video-request-builders` (Seedance) | image_urls 收全部收割图               | 只收「已引用卡的主图（+可选副图）」，按引用顺序；prompt 已翻译                         |
| 卡片数据                            | referenceAssets 无主图标记            | 加 `primaryAssetId`（主图指定，向后兼容可选字段）                                      |
| 收割 harvest                        | 倒全部上游图                          | 每卡取主图（1，+可选1）                                                                |
| 视频节点 detail UI                  | 参考素材五分区                        | 管理素材面板（§4）                                                                     |

> **V-1 执行更正（2026-07-11，见 §9）**：上表 / §8 写的 `buildShotReferenceLegend` 是
> **命名笔误**——那个函数服务的是 `shot`（storyboard 静态镜头图）节点，走任意图片模型，
> 不是本稿要修的 Seedance **视频**节点。视频节点装配时实际调用的图例函数是同文件里的
> `buildVideoReferenceLegend`（`isVideoMediaNode` 分支），V-1 改的是它 + 新增的翻译层，
> 一字未动 `buildShotReferenceLegend`（其模型没有 @ImageN 契约，硬套会引入新 bug）。

## 6. 实现切片（拍板后转任务包）

- **V-1 发送翻译层（正确性优先）**：只送已引用 + 名字→@ImageN 翻译 + 主图入 image_urls + 容量护栏。**这片是修 bug，最高优先**，可先于 UI 单独上。
- **V-2 主图概念**：卡片 `primaryAssetId` + 详情面板指定主图 UI（★）。
- **V-3 视频节点 UI**：管理素材面板取代五分区。
- 每片全量 tsc+vitest；V-1 建议真机 A/B（@名字 vs @Image1 同素材出图）验证生效。

## 7. 待 owner 拍板的决策点

1. 主图：MVP 只送 1 张（owner 已定）；是否要「可选加送 1 副图」口子（Seedance ≤2），还是彻底只 1 张。
2. 图例形态：body 直接把 @名字 换成 @ImageN（干净但 chip 与 body 不一致），还是 body 留 @名字 + 末尾「图例：@ImageN=名字」让 Seedance 自己对（保留可读性，赌模型跟图例）。**推荐前者**（body 换 @ImageN + 括号名字，最贴官方例子）。**V-1 已落地：两者都要**——body 内联 + 图例也对齐成 @ImageN 前缀，见 §9 决策 2（图例的「角色/场景/特写」kind 词是 body 内联版本没有的额外信息，双写比二选一更抗漂移）。
3. 切片顺序：V-1（修 bug）先上，还是等 UI 一起？**推荐 V-1 先上**（当前 @名字 大概率没生效，是线上正确性问题）。**已执行**，见 §9。

## 8. Source of Truth

- Seedance 契约：fal `bytedance/seedance-2.0/reference-to-video` 官方页 · seedanceai.cc 一致性指南 · crepal.ai 身份漂移（2026-07-11 核验）。
- 现状代码：`components/business/node/composer/MentionInput.tsx`（@名字序列化）· `lib/node-workflow-graph.ts buildShotReferenceLegend`（图例）· `services/providers/fal/video-request-builders.ts buildSeedanceReference`（image_urls 组装）· `services/prompts/seedance-prompt-plan.service.ts`（@AudioN/@VideoN 正确先例）。

## 9. V-1 实现记录（2026-07-11，Sonnet 执行，任务包 `docs/plans/node-video-v1-token-translation.md`）

**改了什么**：新增 `src/lib/node-video-prompt-translation.ts`（`buildReferenceImageIndexByName` +
`translatePromptTokensToPositional`，纯函数，复用 `MentionInput.tsx` 已导出的 `parseMentions` 做
token 切分）；`StudioNodeWorkbench.tsx` 装配点（`handleGenerateMediaNode`，isVideoMediaNode 分支）
在组 `finalPrompt` 前用它们把 `mergedPrompt` 里的 `@名字` 翻译成 `@ImageN（名字）`；
`NODE_STUDIO_VIDEO_REFERENCE_LEGEND.imagePrefix` 从 `'图'` 改成 `'@Image'`（`videoPrefix`/
`audioPrefix` 不动）。创作层（节点 `data.prompt` / MentionInput 渲染）完全不变，只有发送那一刻的
`seedanceReadyPrompt` 副本变了。

**决策 1 —— 函数命名更正**：§5/§8 写的 `buildShotReferenceLegend` 是笔误，实际改的是
`buildVideoReferenceLegend`（见 §5 更正注）。

**决策 2 —— 图例形态**：选「两者都要」而非二选一。Body 内联括号名字（`@Image1（弗洛洛）`）+ 图例
也把前缀从 `图` 换成 `@Image`（`@Image1：角色「弗洛洛」`）。理由：图例的 kind 词（角色/场景/特写）是
body 内联版本没有的信息，Seedance 官方指南强调「身份靠文字说明」，双写是同一 token 的两次独立强化，
不是冗余矛盾（两处都用 `@ImageN`，不会打架）。

**决策 3 —— 「1 图/卡」不用额外做**：核查后发现视频节点的图收割路径（`harvestUpstreamImageUrls` /
`harvestUpstreamImageReferences` / `harvestUpstreamCloseupUrls`）每个上游身份节点本来就只读
`getNodeMediaUrl(node.data)`（单一 `imageUrl`/`mediaUrl` 字段）——**当前数据模型里一张身份卡本来就只有
一张图**，「多图收藏选主图」是 §2 设想的未来态（`primaryAssetId` 字段还不存在）。V-1 范围内没有代码要
改；主图 picker UI 仍留给 V-2。

**决策 4 —— 「只送已引用」维持不做**：按任务包指示留给 V-3（配 UI），未改动发送集合的构成逻辑。

**发现但不在本片修的问题**（供 V-2/V-3 或单独排查参考）：`@VideoN` token 并非在所有语境下都是字面
英文——`use-video-composer.ts` 的 `autoName('video', slot)` 走 `t('videoComposer.autoName.video')`
i18n，zh 环境下渲染成 `@视频1`（非字面 `@Video1`），与 `@AudioN`（硬编码英文，恒定 `@Audio1`）不对称。
`video-request-builders.ts` 的 `promptReferencesVideo()` 用正则 `/@Video[1-9]\b/` 检测，中文环境下大概率
不命中，从而触发已有的兜底前缀注入（`buildVideoReferencePrefix`）——这条兜底本身能兜住，所以视频引用目前
不是"丢绑定"的错误，但和音频的处理方式不一致，值得后续统一。任务包明确要求"不碰"，故只记录不改。
