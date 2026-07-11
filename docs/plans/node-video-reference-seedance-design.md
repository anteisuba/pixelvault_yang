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
5. **多张参考图 = 多个位置槽**（2026-07-12 补核）：一个角色 2 张图 = @Image1+@Image2，prompt 里说「都是弗洛洛」把它们归到同一身份。
6. **图↔音绑定 = prompt 里同名，无结构参数**（2026-07-12 补核）：`@Image1（弗洛洛）` + `@Audio1（弗洛洛）` → 靠共享名字「弗洛洛」让模型认「这脸配这声」；且 Seedance **用 @Image1 肖像驱动 @Audio1 口型**（图管画面也管 lip-sync）。→ 现设计已天然做到（audioBindings 带名 + V-1 图片翻译带名），名字是跨模态绑定胶水，不用加参数。
7. **多角色同时 lip-sync 是弱项**（2026-07-12 补核）：单角色短句最稳；多人对话建议分镜各出一条再拼，或 prompt 每句点名说话人。影响「多角色配音怎么用」，不影响绑定机制。

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
- **多图 = 多槽（§0-5）**：一张卡若送 >1 图（主图 + 可选副图），它们各占一个位置槽（@Image1+@Image2），归到同一身份靠 prompt 说明（见 §3-4）。故「一卡一 @名字」在传输层展开为「一身份 1-2 槽」，卡片是身份聚合、槽是 Seedance 原子——两层不 1:1，翻译层负责展开。
- **图↔音同名绑定（§0-6）**：角色卡的**图和音是同一身份**——发送时二者都挂该角色名（图 `@Image1（弗洛洛）` + 音 `@Audio1（弗洛洛）`），Seedance 靠共享名认「这脸配这声」并用肖像驱动口型。**设计含义**：角色卡里图与音的名字必须一致（同一角色名），这是跨模态绑定的唯一胶水；现状已做到（audioBindings 带名 + V-1 图片翻译带名），卡片模型不需为此加字段。

## 3. 发送序列化规则（正确性核心）

1. **只送「已引用」**：prompt 里 @ 到的素材才进 payload（截图「已引用 4 / 已连接 18」的分野 = 送/不送的分野）。已连接未引用 = 可选素材盘，不发。→ 顺带解决容量 + 「未引用图 Seedance 用不用」的不确定（压根不发）。
2. **名字→位置翻译**：把 prompt 里的 `@弗洛洛`/`@长麻花馆` 按其主图在 image_urls 的落位，替换成 `@Image1`/`@Image2`；同时在 prompt 相应处或图例注入名字说明「@Image1 是弗洛洛，保持外观」。
3. **主图入 image_urls**：每个已引用卡 → 其主图（1 张，可选 +1 副图）按引用顺序推入 image_urls。
4. **多身份 / 多图归并（§0-4/5）**：多个已引用角色 → 各自主图各占一个身份槽，prompt 分别 @ImageN 说明；**同一角色送多图（主+副）时**，翻译层把它们的 @ImageN **一并挂同名**并在 prompt 说「@Image1 @Image2 都是弗洛洛」，让 Seedance 归到一个身份槽（Seedance 支持多身份，也支持一身份多图）。
5. **图↔音同名绑定（§0-6）**：同一角色的图与音发送时**挂同一个角色名**（`@Image1（弗洛洛）` … `@Audio1（弗洛洛）`）——这是让 Seedance 认「图音同角色 + 肖像驱动口型」的唯一机制，无结构参数。翻译层保证图侧带名（V-1 已做），音侧 audioBindings 已带名，二者名字须一致。
6. **容量护栏**：已引用**图** > 9 时提示用户取舍（Seedance 图上限）；合计文件 > 12 同理。
7. **多角色 lip-sync 限制（§0-7）**：Seedance 多角色同时对口型是弱项——UI/助手层建议引导单角色短句；多人对话提示「分镜各出一条再拼」或每句点名说话人。属**使用引导**，不改发送机制。
8. **音频/视频**：维持现状（@AudioN/@VideoN 位置 + 名字说明），已正确。

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

> **V-2 执行更正（2026-07-12，见 §9）**：上表「卡片数据」写的 `primaryAssetId`
> 字段名是**设计期占位**——实际落地时发现 §2 设想的「一卡多图」已经存在
> （`referenceAssets` 是 S5c/S5d 就有的收藏数组，非 V-2 新引入），侦察结论详见
> §9。实际字段是 `NodeWorkflowReferenceAssetSchema.isPrimary?: boolean`（挂在
> 每个 referenceAsset 条目上，而非节点级的 id 指针）——原因是 V-2 唯一能安全动
> 的落点（`CharacterImageReferenceControls` 的 `onChange(referenceAssets)`）已经
> 是这条数组本身的读写通道，绕开了一个被并行会话（音色封面批）占用、本片禁碰的
> 文件（`NodeMediaInspector.tsx`）。

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

## 10. V-2 实现记录（2026-07-12，Sonnet 执行，任务包 `docs/plans/node-video-v2v3-master-panel.md`）

**侦察结论（V-2 第一步，决定实际改动面）**：V-1 决策 3 说「一张身份卡本来就只有一张图」，
指的是**视频收割路径**只读 `getNodeMediaUrl`（单一 `imageUrl`/`mediaUrl`）；但卡片**自己的数据
模型**其实早已支持一卡多图——`referenceAssets`（`NodeWorkflowReferenceAssetSchema`，S5c/S5d 引入）
是角色/背景档案面板（`CharacterImageInspector`/`BackgroundImageInspector` → `NodeMediaInspector`
`referenceGalleryMode="gallery"` → `CharacterImageReferenceControls`）里早就在用的收藏图集，最多
`NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems`（3）张，`IdentityCollectorCard`（画布折叠卡）
的缩略图网格也已经在合并展示 `mediaUrl` + `referenceAssets`。**结论**：属于任务包给的「多图已存在」
分支，做完整的 ★ 指定 UI，而非「加字段但无处放」的退化版。

**改了什么**：

1. `types/node-workflow.ts`：`NodeWorkflowReferenceAssetSchema` 加 `isPrimary?: boolean`（每条
   referenceAsset 自带的 ★ 标记，可选，additive）。
2. `lib/node-workflow-graph.ts`：新增 `getNodePrimaryMediaUrl(data)`——解析顺序 = 被 ★ 的
   referenceAsset → `getNodeMediaUrl`（旧存档 = 首图，行为不变）→ `referenceAssets[0]`（补一个
   既有缺口：纯融合卡[无 mediaUrl，图全在 referenceAssets]此前对视频收割贡献为 0，现在贡献首图，
   只增不减）。`harvestUpstreamImageUrls`（视觉参考图循环）/ `harvestUpstreamCloseupUrls` /
   `harvestUpstreamImageReferences`（镜头节点收割）/ `harvestUpstreamVideoImageReferences`
   （视频图例映射表，V-1 翻译层的查找源）四处从 `getNodeMediaUrl` 换成 `getNodePrimaryMediaUrl`——
   最后一处是必要的一致性修复：图例表原来仍按裸 `mediaUrl` 建键，一旦 ★ 图 ≠ mediaUrl，
   `buildReferenceImageIndexByName` 的按 URL 查找就会命中失败，V-1 的名字→@ImageN 翻译会悄悄
   失效。
3. `hooks/node/use-video-composer.ts`：`referenceTokens` 里角色/背景/镜头卡自身 + 其 closeup 的
   `mediaUrl` 取值、以及 `hasReferenceInputs` 的存在性判断，同步换成 `getNodePrimaryMediaUrl`——
   否则 composer 面板的缩略图/图N 槽位角标会显示与实际发送不一致的旧图，且纯融合卡会被误判为
   「无参考输入」从而选错模型变体。
4. `CharacterImageReferenceControls.tsx`（gallery 模式）：每个图集项加 ★「设为主图」toggle
   （hover 才出现，和已有 拆出/删除 同排）+ 常显主图角标（不依赖 hover，右上角绿底 `★ 主图`）。
   通过既有的 `onChange(referenceAssets)` 通道回写，**没有新增任何 prop 穿透 `NodeMediaInspector`**
   （见下方“为什么不是 `primaryAssetId`”）。
5. `IdentityCollectorCard.tsx`（画布折叠卡）：缩略图网格里匹配 `getNodePrimaryMediaUrl` 结果的那张
   叠一个小 ★ 角标，仅在该卡总图数 > 1 时渲染（单图卡没有可辨识的意义）。
6. i18n 三语：`StudioNode.characterImage.reference.{setPrimary,unsetPrimary}` +
   `StudioNode.dossier.primaryBadge`。
7. 测试：`lib/node-workflow-graph.test.ts` 新增 `getNodePrimaryMediaUrl` 四个用例（★ 优先于
   mediaUrl / 无 ★ 回退 mediaUrl / 纯融合卡回退首个 referenceAsset / 全空返回 undefined）+
   `harvestUpstreamImageUrls`/`harvestUpstreamImageReferences` 各一个「送 ★ 图而非 mediaUrl」用例。

**决策 1 —— 字段落在 `referenceAssets[].isPrimary`，不是节点级 `primaryAssetId`**：任务包给了
两个选项。选前者的唯一原因是**并行约束**——`NodeMediaInspector.tsx` 是当前工作区另一个并行会话
（音色封面批）在改的文件，任务包明确写「绝不碰这些」；而 `<CharacterImageReferenceControls
mode="gallery" value=... onChange=.../>` 的渲染调用恰好在 `NodeMediaInspector.tsx` 内部，是唯一能
把新 UI 接到「哪张图是主图」这件事上的落点。节点级 `primaryAssetId` 需要 `NodeMediaInspector` 多传
两个 prop（`primaryAssetId` + `onSetPrimaryAsset`）才能打通，做不到；而 `isPrimary` 挂在
referenceAsset 自己身上，只需要 `CharacterImageReferenceControls` 内部改造它已经拥有、且完全不经过
`NodeMediaInspector` 改动的 `onChange(referenceAssets)` 回写通道即可生效。副作用：卡片自己的
`mediaUrl`（若存在）**没有** ★ 入口——它在身份档案面板里本来就是不可见/不可交互的（
`identityAssetsOnly` 隐藏了那块独立预览区），所以维持"不可见=不可选"是一致的，没有制造新的死角。

**决策 2 —— 空白默认解析成"首图"，且首图定义扩到 referenceAssets[0]**：任务包写"旧存档无此字段=
默认取首图为主图，不炸"。`mediaUrl` 优先（= V-1 之前的送法，零回归）；但当 `mediaUrl` 为空
（S5c 融合建的卡本就没有 mediaUrl，图全在 referenceAssets）时，新加的 `assets[0]?.url` 兜底让这类卡
第一次真正给视频贡献一张参考图——之前它们静默贡献 0 张。这是一次只增不减的行为改动，非本片本该改的
范围之外的东西，但和「主图」概念本身强相关，且不改就是明知故犯地放过一个刚发现的真实缺口，故随手修。

**Chrome 实测**（localhost:3000，项目「鸣潮」，角色卡「青雷」——参考图 1/3，来源=画布融合，验证前
无 mediaUrl 场景恰好现成）：点 ★ → 常显「★ 主图」绿色角标出现 → 刷新整页（强制服务端重新拉取项目、
过 Zod parse）→ 角标仍在，证明 `isPrimary` 字段被正确持久化到云端存档且旧 schema parse 不炸 → 再次
点击 ★ 取消 → 角标消失，恢复项目原状（未遗留测试痕迹）。未做真实生成请求（会消耗 provider 额度/
真实费用），"发送只取主图"这一段改动改走单测覆盖（见上）而非线上实跑。

**V-3 的起点（已勘查，供下一 session 直接续接，不必重新调研）**：

- `DepartmentStrip.tsx` 只有一个真实消费者——`VideoComposer.tsx`（另有其自身 test 文件）；
  `StudioNodeWorkbench.tsx` 里出现的一处 "DepartmentStrip" 只是注释提及，不是 import。五分区可以
  安全整体退场，不会波及其他面。
- "已引用/已连接" 的计算源已经是 `use-video-composer.ts` 的 `referenceTokens`（含
  `imageSlotIndex`/`audioSlotIndex`/`videoSlotIndex` + `token`/`label`），V-3 只需要在其上叠一层
  "该 token 的 `token` 是否出现在当前 prompt 里"（复用 `MentionInput.tsx` 导出的 `parseMentions`）
  即可拿到已引用集合，不需要另起数据源。
- "只送已引用" 的迁移策略建议：以"prompt 里是否出现至少一个可命中的图片类 @token"为总闸——一个
  都没有 → 维持现状（送全部已连接图，V-2 前的行为，零回归）；只要出现一个 → 才切换成"只送被 @ 的
  那些"。这样旧项目/从未用过 @ 语法的用户不会被静默丢参考图，同时把面板里"已引用 N / 已连接 M"的
  数字差本身作为可见的、非静默的提示。audio_urls/video_urls 按设计 §3 决策 6"维持现状"不纳入这次
  过滤（仍是全部已连接直送 + 已有的 @AudioN/@VideoN 兜底前缀注入）。
- 复用优先：覆层用 `src/components/ui/responsive-dialog.tsx`（`ResponsiveDialog*`，用于"可浏览的
  库"——AssetSelectorDialog 就是这么做的，"管理素材"抽屉的形状和它同类）而不是
  `responsive-popover.tsx`（后者按项目约定专用于工具栏 chip / 快速配置，抽屉级的搜索+tab+长列表
  不是它的场景）。

## 11. V-3 实现记录（2026-07-12，Sonnet 执行，任务包 `docs/plans/node-video-v2v3-master-panel.md`）

**改了什么**：

1. **新增 `src/components/business/node/composer/ReferenceManagerPanel.tsx`**（取代
   `DepartmentStrip.tsx`，后者连同其 `.test.tsx` 已删除）：
   - **已引用条**：始终可见，只渲染 `referencedTokenIds` 命中的 token（复用既有
     `ReferenceTokenChip` 做缩略图+hover 预览+点击插入，未重造），hover 出现 × 断连（沿用
     DepartmentStrip 的 `Link2Off` 图标交互）。空态两档：完全无连接→`references.emptyDept`；
     有连接但都未引用→新态 `references.stripEmptyHint`。
   - **管理素材抽屉**：`ResponsiveDialog`（非 `ResponsivePopover`，见 §10 起点已定）+
     `已连接 N` 计数 + 4 类型 tab（全部/角色/场景/声音 对齐截图字面；**镜头 tab 吸收了
     shot/keyframe/closeup/video 四种 kind**，见决策 1）+ 搜索（IMEAwareInput，名称或
     token 子串匹配）+ 每行（缩略图/名字/类型/@token/状态/⋮）。
   - **每行状态**：已引用→静态徽章；可插入未引用→「插入」按钮（点击即 `onInsert`，是老项目
     "第一次引用"的实际入口）；不可插入（未命名/keyframe/未就绪音色/纯视频兜底）→复用
     `ReferenceTokenChip` 同款提示文案（`unnamedHint`/`keyframeHint`/`voiceNotReadyHint`/
     `videoAutoHint`）。
   - **⋮ 菜单**（`DropdownMenu`）：定位画布（`onLocate`）、断开连接（`onRemove`，仅
     `edgeId` 存在时）、角色行专属「添加音色」（仅无 `boundVoice` 时）/「添加特写」（恒显）——
     一比一保留 DepartmentStrip 的 `CharacterVoiceBadge`/`＋特写` 能力，只是从"常驻卡面"搬进
     "行内菜单"。
   - **Tab 工具条 ＋ 添加**：DepartmentStrip 每卡一个 ＋ 的能力原样保留，落在抽屉 tab 顶部
     （角色/场景各一个添加按钮；镜头 tab 因合并了两种 nodeType，给两个按钮"添加镜头图"/
     "添加参考视频"；声音 tab 一个"添加配音"；全部 tab 不显示，避免类型歧义）。
   - **容量护栏**（V-3b，§3 决策 6）：条下方一行警告，`已引用图数 > getMaxReferenceImages(当前模型)`
     才出现，模型未选时不猜数字直接不显示——UI 提示而非发送硬截断（见决策 3）。
2. **`src/hooks/node/use-video-composer.ts`**：新增 `referencedTokenIds`（`Set<string>`）
   计算并入返回值——用 `token.token`（去掉 `@`，**不是** `label`，见决策 2）建 name→ids 表，
   对节点自己的 `prompt` 字段跑 `parseMentions`，命中的 token 名字反查回 id 集合。纯读，
   不改 `referenceTokens` 本身的形状。
3. **`src/components/business/node/composer/VideoComposer.tsx`**：`DepartmentStrip` 换成
   `ReferenceManagerPanel`；prompt 编辑器下新增「已引用 N / 已连接 M · 字数/max」计数行
   （字数上限复用既有 `PROMPT_ENHANCE.MAX_INPUT_LENGTH`=2000，未新增 magic number）；新增
   `maxReferenceImages`（读 `getMaxReferenceImages(data.model.adapterType, data.model.modelId)`）
   传给面板做容量护栏。
4. **`src/lib/node-video-prompt-translation.ts`**：新增纯函数 `filterReferencedImages`
   （V-3b 核心）——见决策 4。
5. **`src/components/business/node/StudioNodeWorkbench.tsx`**（`handleGenerateMediaNode`，
   isVideoMediaNode 分支）：在 `referenceLegend`/`imageIndexByName` 计算前插入
   `referencedFilter = filterReferencedImages(mergedPrompt, referenceImages, videoImageRefByUrl,
videoImageAutoNamePrefix)`，派生 `effectiveReferenceImages`；图例构建、发送翻译、
   `videoHasReferenceInputs` 判定、请求体 `referenceImages` 字段全部从原始 `referenceImages`
   换成 `effectiveReferenceImages`。`referenceImages`（未过滤原集合）保留不动，继续供
   `isShotImageNode` 分支使用（V-3b 明确不碰 shot 节点）。
6. i18n 三语同步：`videoComposer.references` 下新增 `counter`/`charCount`/`stripEmptyHint`/
   `manageButton`/`manageTitle`/`manageDescription`/`searchPlaceholder`/`tabs.*`/
   `addButtons.*`/`managerEmpty`/`statusReferenced`/`statusInsert`/`rowMenu`/`rowLocate`/
   `rowRemove`/`capacityWarning`；删除随 DepartmentStrip 一起退场、已无消费者的死键
   `driftHint`/`driftReplace`/`count`/`slotBadgeImage`/`slotBadgeAudio`/`slotBadgeVideo`/
   `facetFace`/`facetCloseup`/`facetVoice`/`add`（裸键）/`voiceBadge`/整个 `departments` 对象
   （逐一 grep 确认零消费者才删，见决策 5）。三语键集合已脚本核对一致（81 键/语言）。
7. 测试：新增 `ReferenceManagerPanel.test.tsx`（21 例，覆盖已引用条/抽屉 tab/搜索/行状态/
   ⋮ 菜单/tab 添加按钮/容量护栏）+ `node-video-prompt-translation.test.ts` 追加
   `filterReferencedImages` 6 例（含"迁移红线两态"+"自动命名跨过滤重编号"这个专门设计防回归的
   用例）+ `use-video-composer.test.ts` 追加 `referencedTokenIds` 4 例。重写
   `VideoComposer.test.tsx` 里假设旧五分区结构的用例（`departments.*` region、
   `references.emptyDept` 计数 5/3、直接点卡内 ＋）为新面板等价路径（开抽屉→切 tab→点行内
   插入/添加按钮），删除"五卡空态"整卡测试（职责已转移到 `ReferenceManagerPanel.test.tsx`）。
   `DepartmentStrip.test.tsx` 随组件一并删除。

**决策 1 —— 镜头 tab 合并 4 种 kind，非字面 5 tab 对齐 DepartmentStrip 的五部门**：任务包给的
owner 截图文字描述只列了「全部/角色/场景/镜头/声音」4 个非全部 tab，比 DepartmentStrip 的五部门
（角色/场景/镜头/**动作**/旁白）少一个"动作"（视频引用）。为了不丢失视频引用的可发现性（§9 D 的
`@视频N` 内联引用是已交付能力），把 `video` kind 并入"镜头"tab（镜头图与参考视频都是"画面/运镜"
类，非角色非场景），`keyframe`/`closeup` 也并入镜头 tab（同属"画面"范畴，此前也挂在镜头/角色卡）。
Tab 工具条因此在镜头 tab 给两个添加按钮而非一个。**这是无法从纯文字描述消歧的一处解读**——如果
owner 截图实际展示的是字面 5 个平级 tab（含独立"动作"tab），这里需要拆分调整，是本片最值得
owner 核对截图复核的一点。

**决策 2 —— `referencedTokenIds` 用 `token.token` 而非 `label` 做名字匹配**：起初想当然用
`label`（人看的名字），核对 `VideoComposer.tsx` 的 `handleTokenInsert`/`mentionTokens` 才发现
实际插入 prompt 的名字是 `refToken.token.replace(/^@/, '')`——对角色/场景/镜头这个等于
`label`（token 本就是 `@${label}`），但对语音/视频是**位置串**（`Audio1`/`视频1`，与
`label`/`voiceName` 无关）。若按 `label` 匹配，语音/视频类 token 永远判不出"已引用"（因为
prompt 里出现的是 `@Audio1` 不是语音的显示名）。已用单测锁死这条（"matches a voice by its
POSITIONAL @AudioN token, not its display label"）。

**决策 3 —— 容量护栏是 UI 提示，不改发送路径的截断顺序**：`referenceImages`（workbench 里）在
V-3b 之前就已经 `.slice(0, maxReferenceImages)` 截断在先、"是否已引用"判断在后。理论上更精确的
顺序是"先按引用过滤、再按上限截断"，这样用户引用的 5 张不会因为连接了 15 张而被无关顺序挤掉。
但改截断顺序会牵动 `referenceImages` 这个变量在 `isShotImageNode` 分支的复用（§3 决策 8 明确
"维持现状"不碰 shot），拆分两条独立数组增加的改动面/风险超过本片收益，故按最小改动实现：容量护栏
只做**可见的 UI 警告**（面板读 `getMaxReferenceImages` 与已引用图数比较），送法本身的顺序不变。
记录在案，供 owner 判断是否值得开一个后续小片专门修正顺序。

**决策 4 —— `filterReferencedImages` 直接复用 `buildReferenceImageIndexByName` 算 FULL 索引，
过滤后的 `imageIndexByName` 不重新调用它、而是手工按过滤后顺序重新编号**：如果对"过滤后的
`referenceImages`"重新跑一遍 `buildReferenceImageIndexByName`，未命名引用的回退名字
（`autoNamePrefix[kind] + (过滤后下标+1)`）会因为下标随过滤变化而漂移，导致用户在 prompt 里
打的 `@场景2`（基于 composer 显示的、过滤前的完整下标）在过滤后对不上重新计算出的新回退名字
（可能变成 `@场景1`），翻译层查无匹配、静默失效。已用单测锁死（"auto-named reference keeps
matching after narrowing shifts its position"）——这是本片最容易踩的隐蔽 bug，专门留了测试
防回归。

**决策 5 —— 借机清理死 i18n 键**：DepartmentStrip 退场后，`driftHint`/`driftReplace`/`count`/
三个 `slotBadge*`/三个 `facet*`/裸键 `add`/`voiceBadge`/整个 `departments` 对象在全代码库
grep 确认零消费者（逐键搜索过，非猜测）。任务包未明确要求清理死键，但留着会话导航到这些键会
误判"仍在用"，顺手删除三语同步，比留着更符合"长期建模优先"。

**迁移策略实测**（对照任务包"老项目不静默丢"验收点）：`filterReferencedImages` 的护栏条件是
"prompt 里一个可命中的图片 @name 都没有 → 直接返回原始 `referenceImages`（`filtered:false`）"，
与 V-2 前"送全部已连接"字节级一致——不是"送空数组再报错"，是真正的零回归维持现状。已用两个专门
单测覆盖（"no @-mention hits any known image name"、"an empty prompt keeps the full set"）。

**未做/已知限制**（供后续片参考，非本片范围）：

- 决策 1 的 tab 归类是文字描述下的合理猜测，需 owner 用真实截图复核；
- 决策 3 记录的"容量护栏只警告不改送法顺序"是有意的最小改动，非缺陷；
- 抽屉内 `DropdownMenuContent` 走 Radix Portal 到 `document.body`，不在本组件 `dark` 容器的
  DOM 祖先链内，若 App 处于浅色主题，⋮ 菜单浮层可能不是强制深色（轻微视觉不一致，非功能问题，
  真机验证时请留意）；
- "只送已引用"目前只覆盖 `image_urls`；`audio_urls`/`video_urls` 按 §3 决策 6 明确维持现状
  （全部已连接直送），未纳入本片过滤范围，与设计稿一致，非遗漏。
