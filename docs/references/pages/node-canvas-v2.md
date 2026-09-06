# 助手友好的节点画布 · 施工基准 v2（node-canvas-v2.md）

> 状态：**第三期施工基准（2026-09-06 owner 定）**。约束来源：统一助手改版设计简报 §8c / §8c-2 / §8d + owner 三条画布拍板（画-1 / 画-2 / 画-3，收在 §11）。
> 与 [`node-canvas.md`](node-canvas.md) 的分工：那篇**只描述现状**（导演制片桌、吞噬、Cast 卡匣、纸卡外观），本篇是**目标态**。第三期落地后现状文与本文合并，不留两份。
> 与 [`assistant-shell.md`](assistant-shell.md) 的分工：面板 ↔ 画布的五条联动契约写在那边 §17，本文不重复。
> 分期：图片 → 视频 → **画布（本文）** → LoRA。C1 / C2 不依赖 v4 迁移，**可与第二期视频域并行起步**。
> ⚠ 带 `文件:行号` 的都是**现状事实**（2026-09-06 读码核过）；不带的是目标态。标「未确认」的没查证。

---

## 0. 定位 · 范围 / 非目标

**定位**：把画布从「一堆同构的方块 + 恒真连线」改成**以镜头为一等单元的、助手能读能改能撤销的制片台**——节点四顶层分子型、端口按具名槽、名字稳定可 `@` 寻址、助手的每一次改动在画布上可见可回滚。

**范围**：节点分类法与数据模型 · 两态渲染 · 视觉脊柱归位（§2.5）· 具名槽与连线规则 · 槽内版本轮播 · 稳定命名与快照 · 助手 op 集 · 自动排布 · 变更高亮与撤销 · 文本节点派生 · v4 迁移。

**非目标**：移动端（继续 `isMobile → return null`）；多人协作；素材库、项目记忆层、视频看片分析三条服务的接入——本文只在槽与 op 上给它们留接口，不设计它们。

---

## 0.1 域定义（2026-09-06 并入，原 `domains/canvas.md` 已删）

> 原 `docs/references/domains/canvas.md`（2026-07-19 调查稿）已删除，仍有效的业务事实浓缩在本节。已过时的部分（暗炭/纸卡/石绿皮肤、「Fable 三方向 + 关键切片」的设计流程、「尚未拍板」清单）**不带过来**：视觉方向以 §2.5 视觉脊柱归位为准，结构方向以本文为准。

### 域负责什么

Canvas 是 PixelVault 的北极星能力之一（与 LoRA 并列双核，见 [`../product.md`](../product.md)），定位是**长视频导演台**：把「剧本 → 分镜 → 逐镜生成 → 拼接」的可控流程放在一张无限画布上编排。三条核心承诺：

- **可控编排** — 不是「一句 prompt 出一个结果」，而是把创作拆成可见、可复用、可追溯的节点与关系。
- **一致性** — 角色、声音、场景、镜头规格靠身份单元 + 参考约束跨镜头保持稳定，不靠单一 prompt。
- **跨能力汇聚** — 图片、声音、参考视频、剧本文本作为素材汇入视频生成；画布负责它们如何被组织、绑定、送进生成请求。

具体责任：在无限画布上创建/排布/连接/编辑节点并维持视口与选择；承载导演工作流（剧本大纲 → 镜头 → 镜头图 → 视频镜头 → 合并长片）；组织跨模态素材的汇聚与绑定；维持资产复用（一个身份跨多镜复用）；把图结构编译为真实生成请求（收割上游成分 → 装配 payload → 创作名翻译成 provider 位置 token → 容量校验 → 图例注入）；承载画布助手；画布项目的创建/切换/命名/保存与刷新恢复（与 Assets 的 Project 归类文件夹是两回事）；保存产出谱系（lineage）使其可追溯并进入 Assets。

### 与相邻域的分工

| 相邻域       | 边界                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Studio Image | 通用/单次图片生成与专业图片编辑归 Studio；画布消费图片作为镜头素材，不复制完整图片工作台。                     |
| Studio Video | 轻量短片快速入口归 Studio；画布承接长视频/系列镜头/角色一致性/分镜/参考约束/片段合并。两边不合成一套拥挤表单。 |
| Studio Audio | 主力音频生成（TTS/试音/音效/音乐）归 Studio；画布只消费音频资产与音色身份作为视频成分。                        |
| LoRA         | LoRA 的发现/挂载/组合/训练归 LoRA 域；LoRA 可作画布节点或生成输入，画布内不复制 LoRA 编排。                    |
| Assets       | 长期归档/整理/批量/复用归 Assets；画布产出资产但不复制资产管理器，素材复用走既有 AssetSelector 入口。          |
| Cards        | 角色/画风/声音/背景卡的持久身份管理归 Cards；画布消费卡片并可就地新建/编辑局部，长期管理页不搬进画布。         |
| Prompts      | 持久化的个人配方与版本复用归 Prompts；画布只负责本次编排中的装配状态，用户明确保存后才成为配方。               |
| 执行基础设施 | Runner / provider / 队列 / 回调负责真实执行；画布只暴露已接通的能力，**不用 UI 伪装未支持的参数**。            |

**深浅两档是产品级契约**：Studio（Image/Video/Audio）= 轻量、单次、快速拿一个结果的入口；Canvas = 高级编排与连续制作。同一能力两处都在不是重复，是深浅两档——画布不吞并 Studio，也不降成通用白板。

### 未来 UI 必须保留的业务事实

- **生成链不可切断**：建图 → 收割上游成分 → 装配 payload（`assembleReferenceImagePayload` 等共享装配）→ @token 翻译 → 容量校验 → 图例注入。数据形状可以按本文改（四类节点 / 具名槽 / v4 迁移），但这条链不能断。
- **provider 契约保真**：Seedance 袋型合同（1 prompt + image_urls / audio_urls / video_urls）、上限（image 9）、@token 翻译、音频绑定名——UI 不得伪装或绕过真实 provider 能力。
- **一致性单位不退化**：「名字 + 出场图组 + 音色」整体参照、一卡多镜复用、每镜可覆写，是画布相对 Studio 的核心价值，不能退化成散图堆。
- **合法性事实源唯一**：连线合法性以 `node-connection-rules.ts` 为唯一事实源；呈现层查表，不反向影响合法性。
- **产出可谱系化**：画布产出保留足够 lineage 且能进 Assets，重构不切断持久化与回放路径。
- **全局品质底线继承**：可访问性、键盘可达、焦点管理、状态真实性、reduced-motion、ResponsiveOverlay、触屏软键盘、i18n 三语——见 `brand-dna.md`，画布不例外。

### 移动端

本文 §0 把移动端列为第三期**非目标**（继续 `isMobile → return null`）。owner 2026-09-03 拍过「降级，要做」并给了 375 配方（节点卡 `calc(100vw - 2rem)` 单指拖动 · 左侧竖排浮动工具栏 · composer 底部 vaul 抽屉 · 小地图折叠 · 底部 44px 工具条 · 助手 dock 与节点详情改 Sheet · 连线用「点端口 → 点目标端口」两步点击 · 不做框选/快捷键/右键菜单 · 验收 = 375 图能跑通「打开项目 → 输入 → 生成 → 看结果」）；该配方**不在第三期范围内，另行排期**，配方细节见 `../ui-defaults.md §6`。

---

## 1. 节点分类法

### 1.1 顶层四类

顶层沿用**已经存在的** `NODE_MEDIA_KIND_IDS = text / image / video / audio`（`src/constants/node-types.ts:141-152`）。这不是新造：现有 12 个 `NODE_TYPE_IDS`（`src/constants/node-types.ts:1-40`）已经在按 kind 分组消费，只是分组藏在 `NODE_*_NODE_TYPES` 几个数组里。新模型把 kind 提到 discriminator，把「这张图是什么」降为子型。

**一条贯穿全文的判断：子型 = 节点的身份，槽 = 它在某条边里的用途，两者不合并。** 反例就在 owner 的真实流程里：同一张关键帧既是 S02 的首帧，也可能作 S03 的构图参考——把「首帧」写成节点子型，复用就退化成复制。仓里已有同构的两层：节点自己的 `imageCategory`（`src/types/node-workflow.ts:452-455`，注释原文「这是节点的 OWN category」）vs 连上去之后的 `referenceAssets[].role`。本文把这两层正式化，并**删掉 `imageCategory` 里混进来的 `frame`**（它是槽义）。

### 1.2 子型表

| kind  | 子型         | 用途                                         | 必填             | 可选                                           | 缩略图来源                 | 可被生成          | 生成 route                                                                     |
| ----- | ------------ | -------------------------------------------- | ---------------- | ---------------------------------------------- | -------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| text  | `script`     | 全片剧本 / 叙事分段                          | `body`(md)       | `title`                                        | 无（首行标题 + 字数）      | ✅                | `/api/studio/node-script-doc`                                                  |
| text  | `shotNote`   | 单镜说明：visual / audio / cameraPerformance | `body`, `shotNo` | `title`                                        | 无                         | ✅                | `/api/script-breakdown` 或 `node-script-doc`                                   |
| text  | `rule`       | 规则 / 否定项 / 风格说明                     | `body`           | `source`, `recordedAt`                         | 无                         | ✅                | 同上                                                                           |
| image | `character`  | 角色设定图                                   | `url`            | `characterName`, `sourceRef`                   | 自身                       | ✅                | `/api/generate`                                                                |
| image | `background` | 背景 / 场景设定                              | `url`            | `sourceRef`                                    | 自身                       | ✅                | `/api/generate`                                                                |
| image | `shot`       | 镜头图 / 关键帧候选                          | `url`            | `shotNo`, `version`, `blocked`                 | 自身                       | ✅                | `/api/generate`                                                                |
| image | `reference`  | 外来参考：网图、原片截帧、风格校准图         | `url`            | `sourceRef`（七字段）                          | 自身                       | ❌（只上传/导入） | `/api/studio/web-image-import`、`/api/upload-image`                            |
| audio | `voice`      | 角色配音 / 音色参考                          | `url`            | `ownerName`, `sourceRef`, `cleanupMethod`      | 波形 + 时长条              | ✅                | `/api/generate-audio`                                                          |
| video | `shot`       | **一个镜头**：一次视频生成的完整配置与产物   | `shotNo`         | `url`, `duration`, `model`, 槽                 | 产物首帧；未生成时取首帧槽 | ✅                | `/api/generate-video`（长片 `/api/generate-long-video`）                       |
| video | `clip`       | 参考片段（原片裁切段）                       | `url`            | `sourceRef`, `role: continuation \| reference` | 抽帧                       | ❌                | `/api/node-workflow/upload-reference-video`                                    |
| video | `merge`      | 接片 / 合成成片                              | 上游 ≥2          | `mergeSettings`                                | 首帧                       | ✅                | `/api/node-workflow/merge-videos`（`src/lib/api-client/node-workflow.ts:231`） |

`sourceRef` = 溯源七字段（角色名 / URL / 发布者 / 时间码 / 用途 / 可信等级 / 是否允许继续作生成输入）。它同时喂 `assistant-shell.md` §2.10 候选网格卡的三字段。

### 1.3 镜头：容器节点 还是「视频节点 = 镜头」？

**候选 A：镜头做容器节点**（落地那两个零消费者的 schema 桩 `parentId` / `collapsed`，`src/types/node-workflow.ts:495-504`）。好处直白：镜头能整体折叠、整体拖动换序、容器内固定版式几乎白送，一镜多版本天然装得下。

**候选 B：视频节点即镜头 + 具名槽**。一个镜头 = 一个 `video.shot` 节点，首帧 / 尾帧 / 参考 / 语音 / 文本是它左侧的五个具名入口。

**选 B，理由三条。**

1. **语义对得上真实产物**：一镜就是一组 job，最终交付**一段视频**；容器会把「第 02 镜」和「第 02 镜那段视频」拆成两个对象，`@第02镜` 立刻歧义——而稳定 `@` 寻址是硬要求。
2. **成本不对称**：React Flow 的子节点坐标是**相对父节点**的，落地 `parentId` 等于把画布上所有绝对坐标逻辑推翻一遍（`src/constants/node-studio.ts:950-985` 的 `referenceSpawn` / `assistantSpawn` / `libraryPick` / `derivedImage` 四套落点全按绝对坐标算），还要新增容器 type、收纳/脱出手势、级联删除与级联撤销。这与工程原则 3「先端到端打穿最小链路」相悖。
3. **容器解决的两件事有更便宜的拿法**：**镜头带（shot lane）不是节点，是布局层的分组**——按 `data.shotNo` 派生的一条带标题的背景条（纯渲染，无 schema、无坐标系变更、无级联撤销）；一镜多版本改由**槽自己**装（§1.4）。

代价要写明：B 下没有节点级 `collapsed`，也**不做镜头带折叠**（owner 2026-09-06 定）。24 镜横排靠两件现成的东西够用——**节点收起态**（§2.1，每个节点默认就是一行摘要）+ **缩放 LOD**（§2.3，缩小到阈值以下只画标题与首帧）。⛔ 不为此再造一层「折叠 S05–S18」的带级状态：它要新增一份持久化的折叠态、一套带级快捷键、以及「折叠时助手改了带内节点怎么提示」的整条分支，换来的只是缩放已经能给的信息密度（Engineering Principles 2）。`parentId` / `collapsed` 两个桩因此**删除**（§9.3）。若日后需要真容器（如「场」高于「镜」的第二层），再单开——但那时也应该是 lane 的分层，不是 node 的父子。

**镜头五槽（固定，`video.shot` 节点）**：`firstFrame`（首帧，image，0..1）/ `lastFrame`（尾帧，image，0..1）/ `reference`（参考，image|video，0..N）/ `voice`（语音，audio，0..N）/ `text`（剧本或上下文，text，0..N）。

### 1.4 一镜多版本 = 槽内版本轮播（owner 拍板「画-1」，2026-09-06）

关键帧走到 v5、v6 是常态。v1 的默认答案（同带内多个候选节点、只有一张连着首帧槽）被否：**版本是槽的属性，不是节点的身份**——同一张图可以是 S02 的首帧第 5 版、同时是 S03 的构图参考，如果版本写进节点身份，复用又退化成复制；且 N 个候选节点各占一行快照，24 镜下上下文直接爆掉，而轮播只报一行。

**数据形状**：槽的绑定不再是「0..1 条边」，而是 `{ versions, cur }`。

```
SlotBinding = {
  slot: SlotId,
  versions: SlotVersion[],      // 有序，追加在尾
  cur: string | null,           // 当前版 versionId；空槽为 null
}
SlotVersion = {
  id: string,                   // versionId，稳定，改名/换序不变
  edgeId: string,               // 每个版本仍然是一条真边（源节点还在画布上）
  sourceNodeId: string,
  blocked: boolean,             // 停用：画叉，且不可设为当前
  blockedReason?: string,       // 例「首帧动作不自然」——直接进拒绝理由与规则薄卡
  addedAt: string,
}
```

`0..N` 的槽（`reference` / `voice` / `text`）**不做轮播**：它们本来就是多值并列。轮播只作用于 `firstFrame` / `lastFrame` 两个 0..1 槽（`image.character` 的 `text`、`audio.voice` 的 `timbre` 同理适用，实现共用一套 `SlotBinding`）。

**行为**：

- **当前版高亮**：槽格里显示 `cur` 那一版的缩略；左右两个 `‹ ›` 角标翻版，翻到的版本立刻预览但不改 `cur`——**要点一下「设为当前」才算改**（翻着看不该产生一次 undo 条目）。槽格右下角常驻 `3/5` 计数。
- **停用版打叉**：`blocked: true` 的版本缩略上盖 45° 叉 + 压暗，翻到它时「设为当前」禁用并给理由。这与 §3.3 的语义门是**同一条规则的两个出口**：拖线进槽被拒，和已在槽里被禁止设为当前，用同一份 `blocked` 与同一句理由。
- **新连入自动成为新版并设当前**：往已有内容的 0..1 槽再连一条 → 追加 `SlotVersion` 到尾、`cur` 指向它，旧版**不删边**。toast 一行「已加为第 6 版并设为当前 · 撤销」。
- **删版本** = `disconnect(edgeId)`：删的若是当前版，`cur` 回落到最近一个未停用版；都停用或已空 → `cur = null`，槽变虚线圈。
- **快照与 `@` 只报当前版 + 版本数**：`firstFrame ← [[node:i_kf02c5]] S02·首帧（当前 · 共 5 版）`。非当前版**不进快照**；`@S02·首帧` 解析到 `cur` 指向的源节点。
- **画布上的边**：只有当前版那条边**画实线**，其余版本的边收进槽内不画（否则 24 镜 × 6 版 = 一屏面条）。hover 槽格时非当前版的边以虚线短暂浮现。
- **只有当前版进生成载荷**：`generate` 组装 payload 时读 `cur`；`cur` 为空且该槽必填 → 生成前置校验失败，**不是静默用第一版**。

**新增两条 op**（并入 §5）：`set_slot_version(nodeId, slot, versionId)` · `mark_version_blocked(nodeId, slot, versionId, blocked, reason?)`。两条都是免费直做档——不花 credit、不删数据、inverse 是一个标量。`set_slot_version` 指向 `blocked` 版本时**拒绝并给理由**，与手动路径同一条校验。

---

## 2. 两态渲染

### 2.1 收起态（默认）

缩略图 + 卡外标题条 + 状态点。尺寸沿用现状的图片卡钳制：宽按媒体真实比例导出、夹在 `[180, 480]`、基准高 225（`src/constants/node-studio.ts:20-24`），纯图散节点默认 320（`src/constants/node-studio.ts:8`）。`video.shot` 因为要显示五槽，给固定宽 400；槽在左缘排成五个 20×20 的小格，**已连的槽格里直接显示上游缩略**，空槽为虚线圈。状态点：`idle / queued / running / done / error / awaiting_review`（后者复用现有 `mediaReview`，`src/types/node-workflow.ts:460-485`）。

### 2.2 展开态

预览（图 / 视频播放器 / 波形）+ Markdown 文本 + 参数 + 参考槽四段，**就地在画布上展开**，不再走 `NodeDetailPanel` 那张覆盖面板。展开宽 560、高自适应上限 720；超出走内部滚动。展开态**参与布局**：同一镜头带内其他节点向右让位（`--duration-base`）——覆盖面板之所以要退役，正是因为它把「看这个节点」和「看它和邻居的关系」变成互斥的两件事。

### 2.3 触发与 LOD

- 触发：双击卡面 / 单击「展开」角标 / `Enter`（选中时）/ 助手 op `collapse(false)`。同一时刻**最多一个展开态**，避免画布变成表单堆。
- LOD 与缩放（阈值未确认，需真机调）：`zoom < 0.35` → 只画色块 + 状态点；`0.35 ≤ zoom < 0.7` → 缩略图 + 标题，槽格合并成「3/5」计数；`zoom ≥ 0.7` → 完整收起态；展开态在 `zoom < 0.5` 时强制回落收起。
- 多选 / 框选：选中 ≥2 时**禁止展开**（`Enter` 改为「整理选中项」）；框选期间所有卡降到 peek 层以保帧率；多选高亮用描边不用底色，免得和 §7 的变更高亮撞。

### 2.4 文本节点的 Markdown

收起：首行作标题 + 「N 字 · M 段」。展开：默认**预览态**（渲染后的 Markdown，只读可复制），点「编辑」或 `Cmd+E` 切编辑态（等宽字体、软换行、无实时预览——双栏在 400–560px 宽里两边都不够用）。编辑态失焦即存并回预览。助手 `set_text` 落在这里，覆盖用户手写内容时走三选（追加 / 覆盖 / 保留，见 `assistant-shell.md` §6）。

### 2.5 视觉 = 全站脊柱（owner 2026-09-06 定）

**画布不再是浅色孤岛。** 字体三槽 / 颜色脊柱 / 圆角 / 阴影 / 动效 token 与助手面板同一套（`docs/references/ui-defaults.md`），`src/app/canvas.css` 里那套 `--canvas-*` 自建令牌世界**随第三期整体删除，不留兼容层**（工程原则 1）。这不是配色偏好问题：两套令牌并存，等于每加一个组件都要先判断「这里算画布还是算全站」，而对比度、暗色档、reduced-motion 各算各的。

**画布专属只保留两组**（其余一律用脊柱）：

| 保留                                                   | 用在哪                                          | 不许用在哪                              |
| ------------------------------------------------------ | ----------------------------------------------- | --------------------------------------- |
| 四族端口色（text / image / audio / video，**降饱和**） | 端口点填充 · 槽名前的 6px 方色标 · 边的族色描边 | ⛔ 卡面底色、卡边、任何面积填充、文字色 |
| 边三态（空闲 / 生成中脉冲 / 失败）                     | 边的 stroke 与那一条流光                        | ⛔ 卡上的状态点（状态点走脊柱语义色）   |

**元素配方**（直接写 Tailwind 类，不再新造 class）：

- 节点卡：`bg-card border rounded-lg shadow-md`；选中 `ring-2 ring-ring`（不是第二套描边色）；失败 `border-destructive`。
- 镜头带：`bg-muted/40 border border-dashed rounded-xl`，标题条 `text-sm text-muted-foreground`。
- 画布底：`--surface-sunken`（`src/app/globals.css:357`，全站三种浅底之一）+ 淡网格点（`radial-gradient` 1px / 24px，`--border` 40%）。
- 字号按 Tailwind 尺度（`text-2xs` / `text-xs` / `text-sm`），删掉画布私有的「只三级字号」表。
- `.dark` **只在槽内媒体与灯箱**（与 `ui-defaults.md §2.1` 同一条）：其余（卡、带、工具条、面板）跟随全站主题，不再有 `data-scheme='dark'` 这条画布私有的第二套暗色档。

**`canvas.css` 瘦身计划**（现状 4107 行、`var(--canvas-*)` 496 处引用，2026-09-06 实测）：

| 段                                                                | 现状行数 | 处置                                                                                                        |
| ----------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `:root` 画布 token 块（`:51-142`）                                | ~92      | **删**，只留四族端口色 + 边三态搬进 `globals.css` 的 `@theme inline`                                        |
| 纸卡材质 / 拖拽微倾 / 吞噬手势 / 监视器取景框（`:144-511`）       | ~369     | **删** 纸卡与监视器装饰（~250）；**留** ReactFlow 焦点环修正、边脉冲与进度 keyframes、reduced-motion（~90） |
| S0 `--canvas-*` 令牌地基（`:513-765`）                            | ~253     | **全删**（这就是那个自建令牌世界的主体）                                                                    |
| 圆角三档覆盖（`:766-800`）                                        | ~35      | **全删**（脊柱圆角直接生效）                                                                                |
| `data-scheme='dark'` 第二套暗色档（`:801-872`）                   | ~72      | **删** ~62，只留槽内媒体/灯箱那一小段                                                                       |
| S1 节点外壳 + 审阅模式 + 玻璃面板 + 主动作 + 连线（`:873-1830`）  | ~958     | **删** ~810（外壳、玻璃、主动作回落 Tailwind）；**留** 边的 stroke/热区与审阅条 ~150                        |
| S4 三族卡内视觉（`:1831-2376`）                                   | ~546     | **删** ~430；**留** 波形条与媒体窗比例 ~115                                                                 |
| S5 近场工具条 + S6 Cast 卡匣玻璃皮（`:2377-2465`）                | ~89      | **全删**（玻璃配方走面板脊柱）                                                                              |
| S7 节点详情模态（`:2466-3251`）                                   | ~786     | **全删**——§2.2 的就地展开取代 `NodeDetailPanel`，整块随组件下线                                             |
| S8 画布助手 dock 白面 + S11 浮动卡（`:3252-3517` / `:3544-3582`） | ~305     | **全删**——统一面板接管（`assistant-shell.md` §14 第四期删旧 dock）                                          |
| S9 启动骨架（`:3518-3543`）                                       | ~26      | 留 ~15                                                                                                      |
| S12 生成提示词框（`:3583-4107`）                                  | ~525     | **删** ~440；**留** `NodeToolbar` 跟随定位那部分 ~85                                                        |

**估算结论：保留 ~400 行（±100），删掉约 3700 行 / 90%。** 保留的只有两类：① ReactFlow 必需覆盖（焦点环、node/edge/minimap/controls 基础样式反制、`NodeToolbar` 定位）；② 边动画 keyframes 与 reduced-motion 降级。
**验收口径**：删完之后 `grep -c 'var(--canvas-' src/app/canvas.css` 必须为 0，且全仓 `grep -rn -- '--canvas-' src/` 只剩零命中——**留一个就是留了兼容层**。

---

## 3. 端口与连线规则

### 3.1 现状与要改的

现在每个节点**恒定一进一出、不分槽**（`src/components/business/node/nodes/NodeShell.tsx:336-352`，左 target 右 source 各一个 `Handle`），且 `canConnectNodeTypes` **第一行就 `return true`**（`src/lib/node-connection-rules.ts:128`），下面那套按角色的准入矩阵是死代码。恒真是 2026-07-28 owner 为了消灭「静默连不上」有意做的取舍，注释里也写明代价是丢了「连得上就一定被用到」这条纪律。

**本文恢复规则，但必须同时兑现那条注释开出的前提：拒绝要有可见理由**——不合法的入口在拖线时就不点亮（连不上之前就看得见），落空时给一行 toast 说明原因，而不是回到静默失败。

### 3.2 具名端口表

| 节点                              | 入口槽（左，自上而下）                                                                                                        | 出口（右）                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `text.*`                          | `source`（0..N，任意 kind，「从这些素材写文本」）                                                                             | `out`(text)                                 |
| `image.character`                 | `reference`(0..N image) · `closeup`(0..N image) · `voice`(0..N audio) · `text`(0..1)                                          | `out`(image)                                |
| `image.background` / `image.shot` | `reference`(0..N image) · `text`(0..1)                                                                                        | `out`(image)                                |
| `image.reference`                 | —（叶子源）                                                                                                                   | `out`(image)                                |
| `audio.voice`                     | `text`(0..1，台词) · `timbre`(0..1 audio)                                                                                     | `out`(audio)                                |
| `video.shot`                      | `firstFrame`(0..1 image) · `lastFrame`(0..1 image) · `reference`(0..N image\|video) · `voice`(0..N audio) · `text`(0..N text) | `out`(video) · `tailFrame`(image，产物末帧) |
| `video.clip`                      | —                                                                                                                             | `out`(video)                                |
| `video.merge`                     | `clip`(2..9 video)                                                                                                            | `out`(video)                                |

`video.shot.tailFrame` 出口是为接续镜设的：S02 的末帧直连 S03 的 `firstFrame`。**做，但排在第三期**（owner 2026-09-06 定），且**不新写抽帧服务**——走现有那条抽帧线加一个参数：

- 计划：`planVideoFrames()`（`src/lib/video-frame-plan.ts:54`）现在只有「把片长切 N 段各取段中点」一种策略，末帧要的是一个**显式时间戳档**（`duration - ε`）。加参数、`planVersion` 进位，⛔ 不改中点策略的既有取值。
- 抽取：`src/lib/video-frame-capture.ts` 按计划在客户端抽，原样复用。
- 落库：`persistVideoFrameSet()`（`src/services/video-frames/video-frame-set.service.ts:122`）服务端**复算同一份计划再逐帧核对时间戳**——这条确定性纪律是加参数时的硬约束：参数必须进计划本身，任何「客户端自己多抽一张末帧」的走法都会当场核不上。
- 调用方 `src/services/vision/video-analysis.service.ts:96` 是现成的接线处。

⚠ 未核实：`t = duration` 附近的 seek 跨浏览器行为（`video-frame-plan.ts:44-46` 的注释点名了这个坑），ε 取多少要实测定。

### 3.3 合法矩阵（源 kind × 目标槽）

| 目标槽 \ 源                 | text | image                                | audio | video |
| --------------------------- | ---- | ------------------------------------ | ----- | ----- |
| `firstFrame` / `lastFrame`  | ✗    | ✓                                    | ✗     | ✗     |
| `reference`（image 家族）   | ✗    | ✓                                    | ✗     | ✗     |
| `reference`（`video.shot`） | ✗    | ✓                                    | ✗     | ✓     |
| `voice`                     | ✗    | ✗                                    | ✓     | ✗     |
| `text`                      | ✓    | ✗                                    | ✗     | ✗     |
| `timbre`                    | ✗    | ✗                                    | ✓     | ✗     |
| `closeup`                   | ✗    | ✓（subtype = reference / character） | ✗     | ✗     |
| `clip`（merge）             | ✗    | ✗                                    | ✗     | ✓     |
| `source`（text）            | ✓    | ✓                                    | ✓     | ✓     |

额外一条**语义门**（不是 kind 门）：`image.shot` 带 `blocked: true` 时连 `firstFrame` 被拒并给理由「该素材已判失败，不能作首帧」——这是规则薄卡（`assistant-shell.md` §10）在画布上的落地点。

### 3.4 交互

- **拖线**：从任一出口拖出时，画布上所有合法入口槽点亮（描边 + 微放大 `--duration-fast`），非法槽降到 30% 不透明；松手落在非法处 → 边不建立 + toast 一行理由。
- **连上后显示在槽内**：`firstFrame`/`lastFrame`/`reference`(image) → 20×20 缩略；`voice` → 12px 波形条 + 时长；`text` → 首行 12 字摘要 + `⋯`；`reference`(video) → 抽帧缩略 + 时长角标。槽内内容点击 = 高亮并平移到源节点（不是打开，避免误操作）。
- **断开**：hover 槽出 `×`；或选中边按 `Delete`。
- **加版本**：往已有内容的 0..1 槽再连一条 → 追加为新版本并设为当前（§1.4），旧边保留，toast 给 undo（不弹确认，因为可撤销）。
- **容量**：`0..N` 的实际上限跟模型走（`resolveReferenceAssetLimit`，`src/constants/node-studio.ts:742`；`getMaxReferenceImages`），超限时该槽在拖线阶段就不点亮。
- **助手 `connect` 参数形状**：`{ source, sourceHandle?: 'out' | 'tailFrame', target, slot }`。`slot` 必填；服务端只吐 op，槽合法性在客户端 `resolve()` 阶段校验，非法 op 变成一条失败步进 ToolGroup，**不静默丢**。

---

## 4. 稳定命名与 `@` 寻址

### 4.1 现状的坑

`buildFallbackNodeNames`（`src/lib/node-display-name.ts:133`）自己的注释写得很清楚（`:125-131`）：序号按传入列表顺序算，**增删节点就重新编号**，「一旦这个名字要被写进会留存的地方（@ 提及会把字面文本存进 prompt），调用方必须先把名字盖回节点」。也就是说今天的 `@参考视频2` 会静默指向另一个节点。

### 4.2 规则

- **格式**：`S<两位镜号>·<子型标签>[<序号>]`。例：`S02·首帧`、`S02·镜头图3`、`S02·语音`、`S02·剧本`。无镜号的散节点：`<子型标签><序号>`，例 `参考图4`。角色 / 背景类若有专有名，专有名优先：`角色·西格莉卡`。
- **创建即持久化**：任何路径新建节点（手动、右键、助手 `add_node`、派生）都在同一次状态提交里写 `data.displayName`。禁止再出现「显示时才编号」。
- **可改名，改名不改 id**：`data.displayName` 是显示层；边、op、快照一律用 `id`。`@` 文本写入 prompt 时同时写 `[[node:<id>]]` 锚（现状快照已经是这个形状，`src/services/node/node-assistant.service.ts:152`），显示层再按 id 反查当前名——**改名后历史消息里的 @ 跟着更新**，不留死引用。
- **冲突**：新建时同名 → 自动追加序号；用户手动改成已占用的名 → 就地拒绝 + 提示「S02·首帧 已被占用」（不静默加后缀，那会让用户以为改成功了）。
- **镜号变更**（拖镜头换序）→ 名字里的 `S<nn>` 段**自动跟随重排**，用户自定义的后半段保留：`S02·西格莉卡近景` 移到第 5 位后变 `S05·西格莉卡近景`。

### 4.3 `@` 选择器在画布域列什么

分三组，每组内按「最近改动」降序：① **当前镜头**的五槽 + 该镜产物；② 最近生成 / 最近改动的 12 个节点（带缩略图）；③ 全画布搜索（按名字与 prompt 片段）。选中后成带缩略图的 chip（与图片域同一组件）。歧义时助手反问并列缩略图单选。

### 4.4 快照序列化格式（目标态）

现状：每节点一行、**没有边**、上限 32 且不排序取前 N（`src/lib/node-assistant-context.ts:155-181` · `src/constants/node-studio.ts:234` · `src/services/node/node-assistant.service.ts:152`）。没有边意味着助手看不见「谁挂在谁的首帧上」，这在镜头模型下是致命的。目标态：

```
# 镜头
S02 [[node:v_02]] video.shot · running · 7s · seedance-2.5 · 16:9
  firstFrame ← [[node:i_kf02c5]] S02·首帧 (image.shot, done, 当前 · 共 5 版)
  reference  ← [[node:i_ctrlwide]] 控制室广角 (image.reference, done)
  voice      ← [[node:a_sig]] S02·语音 (audio.voice, done, owner=西格莉卡)
  text       ← [[node:t_02]] S02·分镜 (text.shotNote)
  prompt: 以新首帧锁定人物、饰件、服装及体积感。7 秒连续中近景…
# 散节点
[[node:i_kf02a4]] kf02-action-v4 (image.shot, blocked: 首帧动作不自然)
```

- 收起态节点 = 一行摘要；展开态或选中的节点多带 prompt / 参数两行。
- **边内联在目标节点下**（`slot ← 源`），不单列 edges 段——镜头模型下边几乎都是「进某个槽」，内联比另起一段省 token 且更好读。跨镜边（`tailFrame → firstFrame`）额外单列一段 `# 接续`。
- **排序**：先按镜号升序，散节点最后。
- **分层快照，取代节点数硬上限**（owner 2026-09-06 定）：现状的 32 上限与「提到 64」的想法都作废——24 镜 × 平均 4 个节点 ≈ 96，任何一个固定数字都要么盖不全要么爆上下文。改成按**与当前镜的距离**分两档：

  | 档   | 范围                                                                      | 送什么                                                                    |
  | ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
  | 完整 | 当前镜 + 相邻两镜（前一镜 / 后一镜）· **选中的节点** · **最近改动的节点** | 整段结构：镜头行 + 五槽的 `slot ← 源` + prompt / 参数                     |
  | 标题 | 其余所有镜头                                                              | **一行**：`S07 [[node:v_07]] video.shot · done · 6s`，不带槽、不带 prompt |

  选中与最近改动的镜头**升为完整档**，即使它离当前镜很远——用户正看着/刚改过的那个，就是他下一句话要说的那个。

- **不设节点数硬上限**：分层已经把 24 镜的成本压到「3 镜完整 + 21 行标题」，再叠一个数字上限只会在长片项目上制造一种「模型以为自己看全了」的新失败。⛔ 不做「取前 N」。
- **降级顺序与省略提示**：完整档按镜号升序在前，标题档紧随其后；若某一镜因为槽极多导致单镜结构仍然超长，先降它的 prompt 行，再降参数行，最后才把它降到标题档，并在末尾写一行 `S05 已降为标题行（结构过长）`——让模型知道自己没看全。落地时 `NODE_STUDIO_ASSISTANT_LIMITS.maxNodes`（`src/constants/node-studio.ts:227` 起，`maxNodes` 在 `:234`，现值 32）从「节点数上限」改成「标题档的行数上限」，⛔ 不再用它截断完整档。

---

## 5. 助手 op 集（目标态）

现状 10 条（`src/constants/node-assistant-ops.ts:36-73`）：`add_node / connect / rename / set_prompt / set_image_category / set_model / set_params / attach_asset / set_review_state / generate`——**没有 delete / disconnect / move / collapse**，也就是助手能建不能拆、能连不能断。目标表（与三档确认、checkpoint 对齐）：

| 组   | op                                                                                           | 档                                     | inverse（撤销形状）                                          | 自动落                 |
| ---- | -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| 读   | `read_canvas(scope: viewport\|shot\|selection\|all)`                                         | 免费                                   | —                                                            | ✅                     |
| 读   | `find_node(query, kind?, subtype?, shotNo?)`                                                 | 免费                                   | —                                                            | ✅                     |
| 结构 | `add_node(kind, subtype, shotNo?, position?)`                                                | 免费                                   | `delete(id)`                                                 | ✅                     |
| 结构 | `connect(source, sourceHandle?, target, slot)`                                               | 免费                                   | `disconnect(edgeId)`（替换时 = 恢复旧边）                    | ✅                     |
| 结构 | `disconnect(edgeId)`                                                                         | 免费                                   | `connect(旧三元组)`                                          | ✅                     |
| 结构 | `delete(id)`                                                                                 | **需确认档**（就地卡，可勾「不再问」） | `add_node` + 全量 data 快照 + 边列表 + 各槽 `versions`/`cur` | ❌                     |
| 结构 | `set_slot_version(id, slot, versionId)`                                                      | 免费                                   | `set_slot_version(旧 versionId)`                             | ✅                     |
| 结构 | `mark_version_blocked(id, slot, versionId, blocked, reason?)`                                | 免费                                   | `mark_version_blocked(旧布尔 + 旧 reason)`                   | ✅                     |
| 结构 | `move_to_shot(id, shotNo)`                                                                   | 免费                                   | `move_to_shot(id, 原 shotNo)`                                | ✅                     |
| 结构 | `reorder_shot(from, to)`                                                                     | 免费                                   | 反向 `reorder_shot`                                          | ✅                     |
| 结构 | `collapse(id, bool)`                                                                         | 免费（纯视图）                         | 反向布尔                                                     | ✅（不进 undo 栈，§7） |
| 内容 | `set_text(id, body, mode)`                                                                   | 覆盖手写 → 三选                        | `set_text(旧 body)`                                          | 视 mode                |
| 内容 | `set_prompt(id, prompt, mode)`                                                               | 同上                                   | 同上                                                         | 视 mode                |
| 内容 | `set_field(id, field, value)`（`shotNo`/`characterName`/`ownerName`/`sourceRef`/`blocked`…） | 免费；`blocked` 例外 → 需确认          | `set_field(旧值)`                                            | 多数 ✅                |
| 内容 | `attach_asset(target, slot, sourceNodeId)`                                                   | 免费                                   | `disconnect`                                                 | ✅                     |
| 内容 | `set_model(id, modelId)`                                                                     | 免费                                   | `set_model(旧)`                                              | ✅                     |
| 内容 | `set_params(id, params)`                                                                     | 免费                                   | `set_params(旧)`                                             | ✅                     |
| 内容 | `rename(id, name)`                                                                           | 免费                                   | `rename(旧名)`                                               | ✅                     |
| 审阅 | `set_review_state(id, url, state)`                                                           | 免费                                   | `set_review_state(旧)`                                       | ✅                     |
| 花钱 | `generate(id)`                                                                               | **硬确认**，执行留客户端               | 结果不删，只回参数                                           | ❌                     |

⛔ **没有 `collapse_lane`**：镜头带不折叠（§1.3），`collapse` 只作用于单个节点的两态。

**三条纪律**：

1. `attach_asset` 载荷里**只有节点引用没有 URL**——现状注释已经说明理由（`src/constants/node-assistant-ops.ts:63-69`：让模型写 URL 等于让它编地址），新增的 `connect` / `disconnect` 沿用。
2. 每条 op 必须能算出 inverse，否则不进自动落集合；`delete` 的 inverse 需要整份 data 快照 + 边列表 + 各槽 `versions`/`cur`，够贵，所以它不自动落。
3. `generate` 依旧是唯一扣 credit 的 op，服务端只吐 op、执行在客户端。**这道结构性钱闸不能动。**

**`delete` 的确认形态（owner 拍板「画-2」，2026-09-06）**：不降为免费直做（助手一句话就能删掉一整镜），也不做弹窗——与花钱卡**同形的就地卡**，长在对话流里而不是盖住画布。卡上必须写清**删除影响**（不是只写节点名）：

```
删除 S02·镜头（video.shot）
  槽内容 4 项：首帧 1 · 参考 1 · 语音 1 · 文本 1
  连带删除 5 条边（含 tailFrame → S03.firstFrame 这条接续）
  [ ] 本会话此类不再问
  [取消]  [删除]
```

「不再问」作用域 = **同会话 + 同类动作（`delete`）**，勾了之后这一会话内的删除直接过；换会话失效，**不写进用户设置**。理由：连删 12 个空节点不该点 12 次；而跨会话记住「随便删」是一个太便宜的权限。批量删（多选后一次 `delete`）算**一张卡一次确认**，卡上列总数与总边数，不是 N 张卡。

---

## 6. 自动排布

- **几何**：镜头带横排 = 时间轴。每条带宽 = `max(带内内容宽, 480)`，带间距 **80px**；带高按内容自适应，带顶 32px 是标题条（`S02 · 有人还在 · 7s · ●running`，⛔ 无折叠角标，§1.3）。带内两行：**上行文本**（`text.*`，横排，卡宽 320）、**下行媒体**（`video.shot` 居中，首帧 / 尾帧 / 参考 / 语音的源节点按槽顺序排在它左侧一列，行距 24px）。槽顺序固定：首帧 → 尾帧 → 参考 → 语音 → 文本（与 §3.2 端口自上而下同序，**画布上「左边这一摞的顺序」= 「槽的顺序」，两处不许各排各的**）。
- **新镜头插入**：在 `S02` 与 `S03` 之间插入 → 新带占 80px 间隙并把右侧整体推开（`--duration-slow` transform），后续镜号自动 +1，名字按 §4.2 跟随重排。
- **拖镜头换序**：抓带标题条横拖，其余带实时让位显示落点；松手后重排镜号 + 重命名 + **一次** undo 记录（整次换序是一步，不是 N 步）。
- **散节点区域**：镜头带下方留一条「未归镜」区（虚线上边界），所有 `shotNo` 为空的节点自由摆放，位置沿用现有四套落点常量（`src/constants/node-studio.ts:950-985`）。助手 `add_node` 不带 `shotNo` 时落这里，带 `shotNo` 时落对应带内并按槽顺序插位。
- **「整理」按钮语义**：只重排**镜头带内**的节点到标准版式（不动散节点的自由位置、不动带的顺序、不动任何数据），一次 undo 可回。这条边界要写死：整理是布局操作，**绝不能顺手改 `shotNo` 或删边**——否则用户不敢按它。

---

## 7. 变更高亮与撤销

- **高亮三件套**：① 被改节点 2px 描边 + 外发光，`--duration-reveal` 淡入；② 右上角**变更角标**（小圆点 + 改动项数，hover 出「模型 · 提示词 · 首帧」三行）；③ 新建/改动的**边脉冲**——沿边跑一次流光，**只跑一次不循环**（循环动画在 24 镜的画布上是灾难）。`prefers-reduced-motion` 下三者全部降为静态描边 + 角标。
- **持续时间**：高亮**不自动消失**，一直挂到用户在该轮 checkpoint 薄卡上点「知道了」，或开始下一轮对话。理由：真实工作节奏是「助手改完 → 去别的屏核对 → 回来看」，定时消失等于逼人盯着。
- **与 checkpoint 薄卡联动**：hover 薄卡 → 该轮涉及的节点在画布上齐亮 + 视口自动 `fitView` 到包围盒（缓动，不跳变）；点薄卡某一行 → 只亮那一个并展开它。点「撤销」→ 按 §5 的 inverse **逆序**回滚，高亮消失，落一条系统行「你撤销了：××（助手已知晓）」。
- **undo 栈与助手批次**：现状是内存栈、`past/future` 两数组、`slice(-49)` 即 50 步、刷新即失（`src/hooks/node/use-node-workflow.ts:887-891` · `:981`）。目标态两条：① **助手的一轮 = 一个 undo 条目**（不是 N 条）——否则用户按一次 `Cmd+Z` 只回退了「设模型」，画布处在半改状态，比不撤更糟；实现上助手批次以事务方式 push 一次。② 纯视图 op（`collapse`）**不进 undo 栈**。持久化 undo 栈本文不做（⚠ 未确认：需要与 `NodeWorkflowProject.state` 的整图 blob 写入节奏一起想，见 §9）。

---

## 8. 从文本节点派生

文本节点右键 / 悬浮工具条五个动作。每个动作：新建节点 → 建边 → 定位 → 决定是否确认。

| 动作       | 生成什么                                                                | 连什么边                                           | route                 | 确认                                                                                  |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| 出镜头图   | `image.shot`（继承文本的 `shotNo`）                                     | 文本 `out` → 图片 `text` 槽                        | `/api/generate`       | **硬确认**（花钱），卡上显示模型 / 张数 / 预估 credits                                |
| 出视频     | `video.shot`（继承 `shotNo`）；若同带已有首帧候选则一并连上             | 文本 `out` → 视频 `text` 槽；候选图 → `firstFrame` | `/api/generate-video` | **硬确认**                                                                            |
| 做角色设定 | `image.character`，`characterName` 取文本里被选中的那段（无选中则反问） | 文本 `out` → 角色 `text` 槽                        | `/api/generate`       | **硬确认**                                                                            |
| 做背景设定 | `image.background`                                                      | 文本 `out` → 背景 `text` 槽                        | `/api/generate`       | **硬确认**                                                                            |
| 问助手     | 不建节点                                                                | 无                                                 | —                     | 免费直做：把该文本作 `@chip` 插进输入框并聚焦（**不自动发送**——自动发是替用户做决定） |

**一条真实走法**：`S02·分镜`(text.shotNote) →「出视频」→ 新建 `S02·镜头`(video.shot) → 助手计划卡列五阶段 → 用户在待定项里选 `kf02-control-v5`（而非已停用的 `kf02-action-v4`）→ `connect(i_kf02c5, v_02, 'firstFrame')` → `attach_asset(v_02, 'reference', i_ctrlwide)` → `attach_asset(v_02, 'voice', a_sigrika_clean)` → `set_prompt` 走覆盖三选 → checkpoint 薄卡「已改 4 项」→ 硬确认卡 → `generate`。全程画布上只有一个新节点、四条新边，四条边各自落在具名槽里、槽格里直接看得见首帧缩略与语音波形。

---

## 9. 数据模型与迁移

### 9.1 新 Zod discriminated union（草案）

现状 `NodeWorkflowNodeDataSchema` 是一个扁平 `passthrough()` 大对象（`src/types/node-workflow.ts:201-480`），80+ 字段共存，`voice*` 与 `merge*` 与 `image*` 挤在一起，谁属于谁只能靠注释。改成：

```
NodeBase   = { id, position, displayName, status, shotNo?, note?, createdAt }
TextData   = { kind:'text',  subtype:'script'|'shotNote'|'rule', body, title? }
ImageData  = { kind:'image', subtype:'character'|'background'|'shot'|'reference'|'result',
               url?, model?, prompt?, negativePrompt?, params?, sourceRef?, blocked?,
               characterName?, version?, mediaReview? }
AudioData  = { kind:'audio', subtype:'voice'|'ambience',
               url?, ownerName?, voiceProfile?, sourceRef?, cleanupMethod?, durationSec? }
VideoData  = { kind:'video', subtype:'shot'|'clip'|'merge',
               url?, model?, prompt?, negativePrompt?, videoMode?, params?,
               mergeSettings?, sourceRef?, clipRole?, mediaReview? }
NodeData   = z.discriminatedUnion('kind', [Text, Image, Audio, Video])
Edge       = { id, source, sourceHandle:'out'|'tailFrame', target, slot: SlotId, data? }
SlotBinding= { slot, versions: [{ id, edgeId, sourceNodeId, blocked, blockedReason?, addedAt }], cur }
             // 挂在目标节点上（§1.4）；边是事实，binding 是「这个槽当前用哪条边」的指针
```

关键差异：① `discriminatedUnion` 取代 `passthrough`——`passthrough` 是今天字段能随手长出来的原因，也是死字段的温床。② 边**必须有 `slot`**（现状边没有槽概念）。③ `mood` 只是 `background` 的一个字段（`src/types/node-workflow.ts:209`），不升格。

### 9.2 v4 迁移策略

按工程原则 1：**一次性回填，不留兼容层、不留读路径垫片。**

1. 写 `scripts/migrate-node-workflow-v4.ts`：读全部 `NodeWorkflowProject.state`（`prisma/schema.prisma:239-254`，整图 JSON blob），按 §9.3 处置表把每个节点映射成新 union，边补 `slot`（按旧的 `referenceAssets[].role` 与目标类型推导，推不出来的落 `reference`），产出 `{ version: 4, nodes, edges }` 写回 DB。
2. **迁移保险 = R2 自动备份，无 UI、无人工过目**（owner 拍板「画-3」，2026-09-06）：脚本对**每一个** `NodeWorkflowProject` 的**第一步**就是把 v3 的 `state` 原样（未做任何映射的 JSON）传上 R2，**传成功才继续改写**，失败即中止该项目并计入失败清单。不做影子字段 `state_v4`、不做 diff 报告等 owner 过目、不做「导出为 v3」按钮——三样都是给一次性脚本加 UI。
   - 上传入口：`uploadToR2()`（`src/services/storage/r2.ts:247`）。**不走** `generateStorageKey`（`src/services/storage/r2.ts:35`）——它只认 `IMAGE|VIDEO|AUDIO|MODEL_3D` 四种 outputType，装不下备份 JSON；key 在脚本里自己拼：`backups/node-workflow-v3/<projectId>/<ISO8601 时间戳>.json`（同一项目重跑不互相覆盖）。
   - 备份保留 **90 天**，到期由 R2 生命周期规则自动清理；90 天内可按 projectId 找回任一次迁移前的原样 v3。
   - 每个项目改写后就地校验（节点数 / 边数 / 无法映射项计数），任一项不等即回滚该项目并从备份还原。
3. 回填跑完并验证后，**才**删掉旧 enum 与读路径垫片（`node-workflow-migrate-planner.ts`、`node-workflow-migrate-voice-clip.ts`）。**顺序不能反**：`src/constants/node-types.ts:9-11` 那段警告写得很清楚——`NodeWorkflowStateSchema.nodes` 是 `z.array()` **无逐项 `.catch()`**，一个存量 `composer` 节点就能让整份 parse 失败、兜成空状态、用户看到空画布且**静默无报错**，下一次防抖写入就把空状态持久化。**先删 enum 再迁移 = 全量数据不可恢复丢失。**
4. `state` 顶层加 `version: 4`；读到 `version !== 4` **直接抛错并阻止写入**（不是兜空），把静默清空这条路彻底封死。

### 9.3 legacy 12 type 处置表

| 旧 type                 | 处置                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `composer`              | **删**（渲染组件 2026-08-02 已删，用户早就看不到）——迁移时整节点剥除，等价于现状 planner 垫片的行为                                                                                                                     |
| `agent`                 | **删**，同上                                                                                                                                                                                                            |
| `shotText`              | → `text` / `subtype: shotNote`（有 `shotNo` 时）或 `script`                                                                                                                                                             |
| `shot`                  | → `image` / `subtype: shot`                                                                                                                                                                                             |
| `characterImage`        | → `image` / `subtype: character`                                                                                                                                                                                        |
| `backgroundImage`       | → `image` / `subtype: background`                                                                                                                                                                                       |
| `frameImage`            | → `image` / `subtype: shot` + 该图连去的边 `slot = firstFrame`（「首帧」是槽义不是身份，§1.1）                                                                                                                          |
| `image`（统一图片节点） | → `image`，`subtype` 由 `data.role` 直取（`character`/`background`/`shot`；`frame`→`shot` + 槽；`closeup`→`reference` 并连 `closeup` 槽；role 缺失→`result`）                                                           |
| `voice`                 | → `audio` / `subtype: voice`；`voiceClipUrl` → `url`，`voiceSampleUrl` / `voiceReferenceAudioUrl` 两个 deprecated 字段在迁移里**合流后删除**（它们今天不能删只是因为读路径先 parse 后 migrate，一次性回填不受这条约束） |
| `seedance`              | → `video` / `subtype: shot`；`videoMode` 保留                                                                                                                                                                           |
| `videoReference`        | → `video` / `subtype: clip`                                                                                                                                                                                             |
| `videoMerge`            | → `video` / `subtype: merge`                                                                                                                                                                                            |

另删：`parentId` / `collapsed` 两个零消费者的桩（`src/types/node-workflow.ts:495-504`，§1.3 选了 lane 方案）；`imageCategory` 的 `frame` 取值（转成边的 slot）。

---

## 10. 分期

**画布 = 第三期**（图片 → 视频 → **画布** → LoRA），与 `assistant-shell.md` §14 对齐，不再讨论。位置在视频域之后、LoRA 之前，理由是事实不是偏好：视频域第二期要做的「视频参考槽（首帧/尾帧/参考视频）」在数据层**就是画布的槽**——两处各做一套等于立刻分叉。故 **C1 / C2 不依赖迁移，可与第二期视频域并行起步**。

**第三期的最小纵向链路**（这五件齐了才算跑通，缺一件都不是「能端到端跑的最小版本」）：

1. 四类节点的 **discriminated union**（§9.1，取代 `passthrough` 大对象）
2. **槽端口与连线矩阵**（§3.2 / §3.3，含拖线点亮与拒绝理由）
3. **视频节点即镜头**（§1.3 五槽 + §1.4 槽内版本轮播）
4. **时间轴排布**（§6 镜头带横排 + 整理 + 拖带换序）
5. **v4 迁移脚本**（§9.2，含 R2 自动备份与顺序纪律）

**文本节点派生动作（§8）排第二批**——它建立在 1–5 之上（派生要先有子型、有槽、有落点），且每个动作都撞硬确认，不是打穿链路必需的一环。

每片一条最小纵向链路（能端到端跑，不横向铺）：

- **C1 · 槽与规则**：`video.shot` 五槽 + 具名端口 + 拖线点亮 + 槽内显示 + `connect(slot)`。数据层先只加边的 `slot` 字段（可与旧 data 并存一小段，**仅这一处例外**，因为 v4 大迁移要等 C3）。验收：手动把一张关键帧拖进 S02 首帧槽，槽里看得见缩略。
- **C2 · 稳定名 + 快照带边**：创建即写 `displayName`、`@` 选择器、快照按镜号排序 + 边内联 + **分层快照**（§4.4：当前镜与相邻两镜完整、其余一行标题、不设节点数上限）。验收：对助手说「把 `@S02·首帧` 换成 kf02-control-v5」，它能一次改对。
- **C3 · v4 迁移 + 子型**：discriminated union + 一次性回填 + legacy 清除 + 镜头带布局与整理。验收：24 镜项目迁移后节点数/边数零丢失。
- **C4 · 助手 op 补全与变更轨**：`delete` / `disconnect` / `move_to_shot` / `reorder_shot` / `set_text` / `set_field` + 高亮三件套 + checkpoint 联动 + 批次级 undo。验收：跑通 §8 那条全流程并一键撤销。
- **C5 · 两态渲染与 LOD**：就地展开取代 `NodeDetailPanel`、Markdown 编辑/预览、缩放 LOD（也是「不做镜头带折叠」的兑现处，§1.3）。（放最后：最贵且最不阻塞别的。）

**`tailFrame` 出口（§3.2）挂在 C4** —— 它是接续镜的入口，但依赖抽帧计划加显式时间戳档，与 op 补全同批做，不进 1–5 的最小链路。

---

## 11. owner 三条画布拍板（2026-09-06）

| #        | 拍板                                                                                                                                 | 覆盖了什么                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **画-1** | **一镜多版本 = 槽内版本轮播**：一个槽内多版本可左右翻，当前版本高亮，停用版本打叉；**快照只报当前版 + 版本数**                       | 覆盖 v1「同带内多个候选节点、只有一个连着槽」的默认答案。选轮播 = 版本是**槽的属性**不是节点的身份；同时把上下文成本从 N 个节点压到一行（§1.4） |
| **画-2** | **`delete` op = 需确认档，就地卡可勾「不再问」**：不降为免费直做，但确认卡与花钱卡同形（就地、不弹窗），勾选后同会话内同类删除直接过 | `delete` 的 inverse 要整份 data 快照 + 边列表，够贵；但连删 12 个空节点不该点 12 次（§5）                                                       |
| **画-3** | **v4 迁移保险 = 脚本改写前自动备份每个项目的 v3 JSON 到 R2，无 UI**：不做「导出为 v3」按钮，不做影子字段人工过目                     | 备份是脚本第一步且失败即中止；`state` 顶层写 `version: 4`，读到 `version !== 4` **直接抛错阻止写入**（静默清空这条路必须封死）（§9.2）          |

另有一条同日拍板写在 §2.5：**画布皮肤并入全站脊柱**，`--canvas-*` 令牌世界随第三期整体删除，不留兼容层。

---

## 附：成熟产品对照

- **ComfyUI Subgraph / Group**（2025-08 正式发布）：选中一组节点折成单个节点，支持嵌套，且可以在不进入子图的情况下从参数面板编辑子图暴露出来的 widget。与本文相关的一条：**折叠后仍要能改里面的关键参数**——这正是 §2.2 展开态要「预览 + 文本 + 参数 + 槽」四段齐全的理由，而不是折叠即黑盒。
- **Krea Nodes + Node Agent**：端口**按数据类型着色**，从任一端口拖出会直接列出「能接的节点」；Node Agent 读画布、规划管线、连线、跑任务。对应本文 §3.4 拖线点亮合法入口（Krea 是「拖出即列候选」，比只点亮更进一步，可作 C1 之后的增量）与 §5 的 op 集。
- **Weavy（现 Figma Weave）**：每个节点是一个离散操作，**上游变了下游自动重跑**。本文有意**不**抄这条——每一次生成都花 credit 且要人点，自动重跑会直接烧钱；改成 §7 的「上游变了 → 下游节点角标提示『输入已变』」，重跑仍由人触发。
- **Freepik Spaces / Flora**：两家都把 **Text Node 作为一等节点**，印证把文本升为四顶层之一、并让它能派生媒体节点（§8）的方向。
- **Runway Workflows**：分 Input / Model / **LLM 节点**，并可把整条工作流存成模板复用。「LLM 作为图里的一个节点」本文暂不采纳（助手是面板），但「工作流存模板」值得留作 C5 之后的候选：24 镜每镜配置高度同构。

来源：[ComfyUI Subgraph docs](https://docs.comfy.org/interface/features/subgraph) · [Krea Nodes 用户指南](https://www.krea.ai/docs/user-guide/features/nodes) · [Krea Node Agent](https://www.krea.ai/blog/ai-workflow-agent) · [Weavy Workflows](https://www.wireflow.ai/blog/weavy-workflows) · [Freepik Spaces](https://www.freepik.com/spaces) · [Flora Canvas](https://flora.ai/product-canvas) · [Runway Workflows](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows)

---

## Source of Truth

- 节点类型与常量：`src/constants/node-types.ts` · `src/constants/node-studio.ts` · `src/constants/node-assistant-ops.ts`
- 数据契约：`src/types/node-workflow.ts` · `prisma/schema.prisma:239-254`（`NodeWorkflowProject.state` 整图 blob）
- 连线与渲染：`src/lib/node-connection-rules.ts` · `src/components/business/node/nodes/NodeShell.tsx` · `src/hooks/node/use-node-workflow.ts`
- 快照与助手：`src/lib/node-assistant-context.ts` · `src/services/node/node-assistant.service.ts`（第四期删）
- 皮肤：`src/app/canvas.css`（第三期瘦身 90%）· `src/app/globals.css` · `docs/references/ui-defaults.md`
- 现状描述：[`node-canvas.md`](node-canvas.md) · [`canvas-workbench.md`](canvas-workbench.md) · [`canvas-skin.md`](canvas-skin.md)（域定义已并入本文 §0.1）

## Last Verified

- **2026-09-06 · 本文新建**：owner 定第三期画布按本文重做（四类节点 + 子型 · 具名槽端口与合法矩阵 · 槽内版本轮播 · 稳定命名与带边快照 · op 集补全 · 时间轴自动排布 · v4 迁移 + R2 自动备份 · 皮肤并入全站脊柱）。所有 `文件:行号` 于本日读码核过；四处与设计稿不符已就地订正：`NODE_TYPE_IDS` 在 `node-types.ts:1-40`（不是 33-58）· `buildFallbackNodeNames` 在 `node-display-name.ts:133`（注释 `:125-131`，不是 110-131）· `NodeShell` 双 Handle 在 `:336-352`（不是 328-355）· `NODE_ASSISTANT_OP_IDS` 在 `node-assistant-ops.ts:36-73`（`:75` 起是 `NODE_ASSISTANT_OPS` 数组）。`canvas.css` 4107 行 / `var(--canvas-*)` 496 处引用为本日实测。**代码未动，只写文档。**
