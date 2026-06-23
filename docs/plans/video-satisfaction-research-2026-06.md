# 视频满意度提升 — 候选功能调研底稿（2026-06-22）

> **来源**：竞品(LibTV / Krea / Updream)画布实测 + 6 线并行调研工作流（web how-to + 代码库 grounding，77 万 token / 222 次工具调用）。
> **性质**：只读调研，**不改代码**。本文为后续立项底稿。
> **目标**：生成一条「满意的视频」。满意度卡点分四类——**一致性 / 导演控制 / 廉价迭代 / 成片打磨**，外加跨切面的**闭环反馈**。
> **直连偏好**：owner 偏好直连官方 API 而非 FAL（见 memory `feedback-prefer-direct-api`）；下文每项标注直连可行性。

---

## 0. 摘要与优先级

### 0.1 调研改写的关键预判（最有价值的部分）

| 原预判                     | 调研实测                                                                                                                             | 影响                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 镜头续接要从头接首尾帧     | **`last_frame_chain` 已在 worker 端到端跑**；火山 adapter 已发 `first_frame`、已解析 `last_frame_url`、默认 `return_last_frame=true` | 一致性第一杀手的解法比想象近，缺的只是「下放到画布节点」 |
| 三视图要新做               | **multiview service 已就绪**，只是当前只服务 image-to-3D                                                                             | 接到角色节点 ≈ 0.5–1 天                                  |
| 导演台是「重武器放最后」   | **竞品实测是 2D 相机参数化，不是重型 3D 骨骼摆位**；多数闭源模型不吃 ControlNet                                                      | 从 L 降到 S-M(1-2天)，与运镜预设合流                     |
| 草稿/变体要做引擎          | **Fast/标准双档 + seed 闭环全在位**                                                                                                  | 对我们几乎是纯前端                                       |
| 音乐/环境音要新接 provider | **ElevenLabs Music/SFX 复用现有 ElevenLabs key/adapter**，商用许可干净                                                               | 直连、低成本                                             |
| 转场加在 videoMerge        | **fal `ffmpeg-api/compose` 不暴露转场字段（硬约束）**                                                                                | dissolve/fade 必须换渲染后端                             |
| 仅重跑下游不难             | **stale 状态定义了却全仓没人 set，且无下游遍历原语**                                                                                 | 最重、最易出 bug，放后                                   |

### 0.2 优先级总览

**🟢 第一波（高杠杆 + 主要复用现有原语，天级，全程直连）**

| 功能                  | 满意度杠杆 | 量级                             | 直连           |
| --------------------- | ---------- | -------------------------------- | -------------- |
| 镜头续接（末帧→首帧） | 一致性#1   | 末帧获取 easy(1-2天) / 全链 ~1周 | 火山 ✅        |
| 草稿→成片两段式       | 迭代成本   | easy S-M(1-2天)                  | 火山 ✅        |
| 角色三视图一键出      | 一致性     | **S(0.5-1天)**                   | Gemini/火山 ✅ |
| credit 预估（简版）   | 迭代信心   | S(0.5-1天)                       | 本地计算       |
| 音乐节点 + 环境音节点 | 成片音画   | easy(各 1-2 天)                  | ElevenLabs ✅  |

**🟡 第二波（高价值，实打实新增）**：运镜预设 chips + 助手预填 motion/camera（含导演台轻量版）· 镜头变体优选 · lip-sync 节点 · 助手 review。

**🔴 决策点 / 较重（需 owner 拍板）**：转场控制（渲染后端选型）· 三轨混音 · 仅重跑下游(stale 传播) · cost 精准化（系数表）。

### 0.3 决策点清单（需 owner 拍板）

1. **转场渲染后端**：自托管 ffmpeg(进 execution worker，最「无中间商」、契合直连) vs Shotstack/Creatomate(SaaS 中间商，类 FAL)。fal compose 不支持转场是硬约束。
2. **videoMerge 方向**：原 roadmap 把 videoMerge 锁死「纯顺序拼接 + 尾裁」(VID-UI-8)；转场 + 三轨混音属方向外扩，需重新拍板。
3. **lip-sync 直连 vs fal**：Hedra Developer API 可能仍 private beta(需确认拿不拿得到 key)；fal 最省事但违背直连。
4. **cost 精准化**：现 cost 是扁平值(Fast vs 1080p 同价)；按分辨率/时长加权要改 cost 为系数表，波及 99 个 `models.ts` importer。
5. **音频节点收敛**：music / ambient / TTS 是三个独立节点，还是一个「音频生成节点(模式:TTS/音乐/音效)」——呼应 `project-node-consolidation`（按模态拆）。

---

## 1. 一致性 — 镜头续接 / 角色一致性资产

### 1.1 镜头续接（shot N 尾帧 = shot N+1 首帧）

#### 1.1.1 首尾帧双关键帧生成（first_frame + last_frame / end_image）

- **怎么实现**：给视频模型同时喂起始帧和结束帧两张图，模型在两帧间插值生成过渡。把 shot N 末帧作为 shot N+1 起始帧即可无缝衔接；再指定 N+1 目标末帧能精确控制走向。
- **模型/API 支持（参数名）**：
  - Seedance 2.0 i2v（fal `bytedance/seedance-2.0/image-to-video`）= `image_url`(首) + `end_image_url`(尾,可选)。
  - 火山 Ark ModelArk（`/contents/generations/tasks`）= content[] 里 `{type:'image_url',role:'first_frame'}` + `role:'last_frame'`（**三场景互斥**：纯首帧 i2v / 首+尾帧 / 多模态 reference）。
  - Kling 官方 API = `image`(首) + `image_tail`(尾)；2.1 Master 不支持；`image_tail` 与 `dynamic_masks`/`camera_control` **互斥**。
  - Veo 3.1（Gemini API / Vertex AI）= 首帧主输入 + config `lastFrame`(插值模式)。
  - Wan（阿里云 Model Studio）= `first_frame_url` + `last_frame_url`（也有 fal `wan-flf2v`）。
  - Hailuo/MiniMax = `end_image` / `last_frame_image`。
- **直连选项**：火山 Ark 首尾帧已可直连且 adapter 在位（Seedance 首选）；Kling 官方 API 直连 `image+image_tail`；Veo 走 Gemini/Vertex；Wan 走 Model Studio。fal 仅兜底。
- **我们已有**：`src/services/providers/volcengine.adapter.ts` L216-222 单图时已发 `role:'first_frame'`，响应 schema L100-122 已解析 `last_frame_url`，L260 默认 `return_last_frame=true`；fal builder `src/services/providers/fal/video-request-builders.ts` `buildSeedance20`(L342) 只发 `image_url`；worker 侧同名 builder `workers/execution/src/models/fal/video-request-builders.ts` L256 同理；`src/constants/reference-image-capabilities.ts` L34-64 已预留 `ReferenceSlotRole='first_frame'|'last_frame'` + `'slotted'` 变体（注释明写给 Step 3 首尾帧用），但 `getVideoReferenceCapability` 还没有模型用 slotted；`docs/plans/model-slimdown-2026-06.md` L527 已记 `end_image_url`，`docs/design/canvas-baseline.md` L267 已把「Veo 补首尾帧模式」列为引擎待办。
- **净新增**：(1) fal Seedance/Veo/Kling builder 增加 last/tail 字段（`FalVideoRequestBuilderInput` 加 `endFrameImage?:string` 或复用 slotted role）；(2) `getVideoReferenceCapability` 为支持首尾帧的模型返回 `kind:'slotted'` 双槽；(3) 火山 adapter 把当前 >1 图就进 reference 模式时被忽略的第二张图接成 `role:'last_frame'`。
- **可行性 / 工作量**：medium / 中等（约 2-3 天）：builder 字段 + 能力契约 slotted 化 + 单测（builders.test.ts 已有 absentFields 断言可扩）。
- **竞品**：Krea「trim video + 从末帧续写」+「merge clips 生成过渡」；LibTV storyboard 自动分镜 + reference 复用保跨场景一致。
- **风险**：火山 ark 三场景互斥判断错会 400；Kling image_tail 与 camera_control 互斥；Veo lastFrame 仅插值模式；首尾帧时长上限通常更短。
- **来源**：byteplus.com/docs/ModelArk/1520757 · fal.ai/models/bytedance/seedance-2.0/image-to-video · kling.ai/document-api · ai.google.dev/gemini-api/docs/video · alibabacloud.com Model Studio first/last frame · docs.aimlapi.com Hailuo-02。

#### 1.1.2 从 clip 取末帧（last-frame extraction）

- **怎么实现**：shot N 生成完取最后一帧作静态图，当 shot N+1 的 `image_url`/首帧。两条路：provider 回传末帧 URL（零额外调用），或 ffmpeg 抽末帧（`-sseof -3 ... -update true`）。
- **模型/API 支持**：火山 Ark `return_last_frame=true` → `content.last_frame_url`（已接）；fal Seedance i2v 等价 + 输出常带 `thumbnail.url`；独立抽帧 fal `fal-ai/ffmpeg-api/extract-frame`（first/middle/last）。
- **我们已有（最成熟的一环）**：video-pipeline 的 last_frame_chain 已端到端：`workers/execution/src/index.ts` L2617-2637 读 `thumbnailUrl`，L3137-3181 存 `completedClip.lastFrameUrl` 作下一 clip 的 `previousFrameUrl`→`referenceImage`(L2111)；prisma `VideoPipelineClip` 有 `lastFrameUrl`/`inputFrameUrl` 列；`src/services/video-pipeline.service.ts` L463/L573-660(retry 用 previousClip.lastFrameUrl 接续)；火山 adapter L498 把 `last_frame_url` 当 thumbnailUrl 回传；ffmpeg 原语已在用：`src/services/video-merge.service.ts` + `src/app/api/node-workflow/merge-videos/route.ts` 调 fal `ffmpeg-api/merge-videos`，抽帧端点同源。
- **净新增**：画布 seedance 节点的 `harvestUpstreamImageUrls`（`src/lib/node-workflow-graph.ts` L101）只把上游图片当 reference，**不读上游 video-source 节点末帧**。要新增「上游 seedance done 后取末帧 → 作下游首帧」：复用 worker 已回传的 thumbnailUrl 存进节点 data，或对 mediaUrl 调一次 extract-frame。
- **可行性 / 工作量**：**easy** / 小到中等（约 1-2 天）。
- **直连**：末帧获取首选 provider 直连回传（火山 `return_last_frame` / fal thumbnail），零额外成本；精确抽帧用 fal extract-frame（ffmpeg 类无直连对应物，只能 fal 或自建 worker）。
- **风险**：provider 回传 thumbnail 未必是严格最后一帧，精确续接可能需 ffmpeg 兜底；末帧分辨率/比例需与下镜一致。
- **来源**：fal.ai/models/fal-ai/ffmpeg-api/extract-frame · kombitz.com 取末帧 · byteplus.com/docs/ModelArk/1520757。

#### 1.1.3 画布 seedance「尾帧自动喂下一镜首帧」端到端编排

- **怎么实现**：shot N 的 seedance 节点连 shot N+1 的 seedance 节点；前者 done 后自动把末帧投影成后者首帧 keyframe，用户不手动搬图，把分散单镜变连贯序列。
- **我们已有**：节点字段 `src/constants/node-types.ts`(seedance 字段集 L204-211)；harvest 家族 `src/lib/node-workflow-graph.ts`（`isKeyframeNode` L38 / `harvestUpstreamVideoUrls` L125 已读上游 video mediaUrl / `isVideoSourceNode` L59）；连接规则 `src/lib/node-connection-rules.ts`；能力契约 `reference-image-capabilities.ts`、`video-model-capabilities.ts`。但上游 video mediaUrl 目前只当 Seedance Reference 的 `video_urls`（整段参考），**无「取末帧当首帧」语义**。
- **净新增**：(1) 新增「节点级 keyframe 续接」语义——seedance→seedance 连线把上游末帧标记为下游 first_frame_url，而非整段 video_urls；(2) 新 harvest 函数从上游 video-source 节点导出末帧 URL；(3) 节点 data 增 `lastFrameUrl`（回填 worker 已产出的 thumbnail）；(4) UI 区分「续接」vs「整段参考」两种连线意图。即把 pipeline 的 last_frame_chain 下放到画布节点图。
- **可行性 / 工作量**：medium / 中等（约 3-5 天，依赖前两项落地后，主要是画布 harvest/节点 data/连接规则/autospawn 投影接线 + i18n×3 + 测试）。
- **风险**：末帧续接累积漂移（连多镜后角色/色调偏移，需配 reference 锁身份）；「续接」与「整段 video 参考」两种语义需 UI 区分；duration='auto' 在续接链里需固定保时长可控。
- **来源**：docs.krea.ai/features/video · dreamina LibTV review · fal.ai seedance-2.0/reference-to-video。

### 1.2 角色三视图 / turnaround / character-sheet 一键生成

- **怎么实现**：路线1（单图+多视图 prompt 范式，行业默认）：拿锚点图，逐角度跑「same subject, exact identity, &lt;angle&gt; view, preserve face/hair/outfit, only change camera angle」+ negative 抑制三大漂移（view merging / feature drift / background contamination）；路线2（单次出整张 sheet）：用 Nano Banana Pro / Seedream 4.5 / FLUX.2 一个 prompt 带 layout tags + consistency tags 出多面板 sheet。
- **模型/API 支持**：Nano Banana Pro(Gemini 3 Pro Image，≤14 参考、5 人物身份保持，直连 `gemini-3-pro-image`)；FLUX.2[pro](≤10 参考、最佳一致性，BFL Direct REST，$0.03/图)；Seedream 4.0/4.5(≤~12 参考、跨图保人脸，直连火山 Ark `Bytedance-Seedream-4.5`)；项目内多视图当前用 `FLUX_KONTEXT_MAX / OPENAI_GPT_IMAGE_2 / GEMINI_FLASH_IMAGE`(`MODEL_3D_MULTIVIEW_MODEL_IDS`)，已带 turnaround 范式。关键参数：`image_urls[]` / reference images、`negative_prompt`、`aspect_ratio`。
- **我们已有（净新增极少）**：`src/services/multiview-generate.service.ts`(`generateMultiView` 并发 back/left/right + 轮询)；`src/constants/three-d-ready-prompt.ts`(`MULTI_VIEW_PROMPTS` 六角度成品 prompt + `MULTI_VIEW_NEGATIVE` + `GENERATED_VIEW_ANGLES`)；`src/app/api/generate-multiview/route.ts` + status；`src/hooks/use-generate-multiview.ts`；`src/lib/api-client/multiview.ts`；接入点 `src/components/business/Studio3DWorkspace.tsx`；参考资产容器 `NodeWorkflowReferenceAssetSchema`(`src/types/node-workflow.ts:88`)；角色节点已有 referenceAssets + `handleApplyCard` 已把卡片多图塞进 referenceAssets(`CharacterImageInspector.tsx:246`)。
- **净新增**：(1) CharacterImageInspector/角色节点加「生成三视图」动作，把节点 imageUrl 作 input 调 use-generate-multiview；(2) 返回写回 `node.data.referenceAssets`（role 打 identity/pose/composition）；(3) `NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems` 当前=3，放宽容纳 turnaround 多帧；(4) 可选换更强模型(Nano Banana Pro/Seedream 直连，走 add-model)。**已知架构债**：reference role/weight 在 provider 层是死字段——`generateCharacterImage`(`StudioNodeWorkbench.tsx:537-540`) 把 referenceAssets 摊平成 `referenceImages.map(r=>r.url)`，role/weight 全丢；要真正 role-weighted 需让 provider builder 消费 role（独立增量）。
- **可行性 / 工作量**：**easy / S(0.5-1 人天)**；换更强模型 +M。
- **直连**：Nano Banana Pro 直连 Gemini(`gemini-3-pro-image`，已有 gemini.adapter)；Seedream 4.5 直连火山 Ark(adapter 就绪，缺 available model id，见 `project-volcengine-additive-direct`)；FLUX.2 可走 BFL Direct。三视图本身用现有 multiview 集即可，追一致性优先把 Nano Banana Pro/Seedream 直连 add-model。
- **风险**：开放权重 edit 模型对「rotate 45°」不可靠（`three-d-ready-prompt.ts:44-57` 已踩坑，默认只出正交三视图，45° 需更强模型）；maxItems=3 与多帧冲突，放宽时确认下游 Seedance(max 9) 与各图像模型 reference cap 不被撑爆；role 不被 provider 消费是已知债。
- **来源**：scenario.com character-turnarounds · deepmind Gemini image pro · bfl.ai/models/flux-2 + pricing · seed.bytedance.com/seedream4_5 · krea.ai cinematic-9-angle-grid。

### 1.3 导演台 3D 摆位（角色站位 + 机位 + 多视角截图→参考帧）

- **怎么实现（两类路线，工作量差一个量级）**：重型（疑似但**未证实**的 Three.js 人偶+机位）：three.js/R3F 摆低模人偶 + 可拖拽相机 → 截图当 ControlNet(OpenPose/depth) 或当 reference 帧。轻量（**LibTV 实际做法，经查证**）：在已生成图上拖拽调相机角度 + 九宫格分割一次出多机位 + 灯光拖拽 + 镜头/焦距/光圈预设——本质是 2D 图 + 相机参数 prompt/edit，**不是 3D 骨骼摆位**。
- **模型/API 支持**：轻量路线=给现有图像/视频模型加结构化 camera 参数(angle/lens/focal/aperture/lighting)拼进 prompt 或 edit 重渲——无需新模型(Nano Banana Pro studio controls、Seedream camera 原生支持)。重型路线=ControlNet OpenPose/depth(项目当前无)，经 ComfyUI 或 Replicate/fal。
- **我们已有**：3D 渲染基建部分就位：package.json 已装 `three@0.182.0`、`@google/model-viewer@4.2.0`(用于 Hunyuan/Rodin glb 展示)；画布是 React Flow；MULTI_VIEW_PROMPTS 已含逐机位措辞；referenceAssets 容器可承接「摆位截图→参考帧」。但无 OpenPose/ControlNet 接线、无 R3F 交互式人偶/可拖拽相机、无 depth/pose 预处理。
- **净新增**：轻量（推荐先做）：新增「机位/相机参数」面板(angle/shot size/lens/focal/lighting chips) → 拼进角色或视频节点 prompt，或调 edit 模型重渲多机位 → 写回 referenceAssets。基本是 UI + prompt 组装。重型（自建 R3F）：R3F Canvas(人偶+OrbitControls 相机+地面) + 截图导出(toDataURL→R2，已有 uploadToR2) + 可选 OpenPose/depth 预处理(新 service) + control image 接入。
- **可行性 / 工作量**：medium。轻量 **S-M(1-2 人天，纯 UI+prompt，无 3D)**；重型 R3F+OpenPose **L(1-2 周)** 且姿态质量不确定。
- **直连**：轻量无需外部摆位 API，纯本地 prompt/edit + 现有直连图像模型(Gemini/火山 Seedream)。重型 ControlNet 若直连优先 Replicate(已有 replicate.adapter)或自托管 ComfyUI runner(`project-comfy-runner`)。
- **竞品（经查证）**：LibTV 多角度=拖相机角度 + 九宫格 + 灯光拖拽 + 镜头/焦距/光圈预设，>20 自研工具，**但都是 2D 图 + 相机参数，非 3D 骨骼**。Krea cinematic 9-angle grid。**结论：头部竞品的「导演台」本质是相机参数化 + 多机位出图，自建门槛从 L 降到 S-M。**
- **风险**：误建成重型 3D = 过度工程（违背 CLAUDE.md「本属属性的别编码成重模块」，先做轻量）；重型 OpenPose→ControlNet 项目零先例，且多数闭源模型(Nano Banana/Seedream)不接 ControlNet 只吃 reference，削弱重型收益；R3F 人偶需 rigged glb 资产，与 model-viewer 展示用途区分。

---

## 2. 导演控制

> **核心结论**：视频骨干是 Seedance(fal + 火山 Ark 直连)，Seedance 运镜=**纯 prompt 文本**(推/拉/摇/移/环绕/升降/变焦)，无结构化 camera_control 参数；唯一有结构化 camera_control JSON 的主流模型是 Kling。所以 Seedance 主线运镜 chips=把受控词拼进 prompt 文本即可，不需要每模型一张结构化映射表。

### 2.1 运镜预设 chips

- **怎么实现**：一组受控运镜词作 chip/预设，点选后把对应文本拼进 prompt(Kling 这种特例才填结构化参数)。两种注入：(1) 自然语言('slow dolly push-in'/'orbit left'/'crane up'/'static')，Seedance/Runway/Higgsfield/Krea 都走这条；(2) 受控 token（MiniMax Hailuo 01-Director 用 `[Push in][Pull out][Truck left/right][Pan][Pedestal up/down][Tilt][Zoom][Shake][Tracking shot][Static shot]`，共 15 条，一个 [] 内 ≤3 条）。
- **模型/API 支持**：Seedance 2.0(fal + 火山 Ark 直连)运镜纯 prompt，Ark 支持「推/拉/摇/移/环绕/跟随/升降/变焦 + 景别 + 视角」，fal 入参仅 prompt/resolution/duration/aspect_ratio/seed/generate_audio/image_url/end_image_url(**无 negative_prompt、无 camera_control**)；Kling(唯一结构化) `input.camera_control={type, config:{horizontal,vertical,pan,tilt,roll,zoom}}` 约 [-10,10]；MiniMax Director prompt 内 [命令] token；Runway Gen-4 Director Mode 结构化。
- **直连**：Seedance 火山直连(adapter 就绪)运镜=prompt 文本，chip 注入纯文本对国内·火山与海外·fal 两条路通用，**不绑 FAL**。Kling 结构化需直连快手官方 API；MiniMax Director 官方 platform.minimax.io 可直连。
- **我们已有**：`src/constants/node-types.ts` `NODE_WORKFLOW_FIELD_IDS.camera`/`.motion`，`NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[seedance]=[motion,camera,duration,audioIntent,prompt]`；`src/lib/node-workflow-prompt.ts` `buildNodeWorkflowPrompt` 已把 seedance camera/motion/duration/audioIntent 逐行 join 成最终 prompt 发 provider(`buildSeedance20`/`buildSeedanceReference` 直接透传 input.prompt，无结构化 camera)。chip UI 落点=seedance 节点 inspector；chip 词表进 `src/constants/`(新常量，符合 no magic values)。
- **净新增**：(1) 受控运镜词表常量(中英日三套，词条→注入文本，如 push-in→'slow dolly push-in along the Z-axis')；(2) seedance inspector 上 chip 选择 UI(点选→append 到 camera/motion 字段)；(3)(可选)未来支持 Kling 结构化才需 per-model 适配表。
- **可行性 / 工作量**：**easy / 1-2 天**(词表 + i18n×3 + 一排 chip 组件，无后端改动)。
- **竞品**：Higgsfield DoP(100+ 相机预设)、Krea(Seedance2 Add effects 面板 catalog)、MiniMax Director 运镜菜单；LibTV 更进一步(节点上内置相机类型/镜头/焦距/光圈 + 拖拽调角度)；Kling 官方把六轴做成滑杆。
- **风险**：运镜词对不同模型听话度不同(Seedance 自然语言友好，Kling 偏结构化)；多 chip 叠加打架(MiniMax 建议 ≤3)；camera vs motion 字段语义重叠，建议 chip 落 camera、motion 留主体动作。
- **来源**：github fal-ai/seedance-2.0-api · byteplus ModelArk/2222480 · volcengine 1631633 · comfy kling-camera-controls · piapi kling create-task · getimg hailuo director · higgsfield camera-controls · krea features/video。

### 2.2 助手按镜头意图自动预填 motion/camera

- **怎么实现**：LLM-as-director——把场景/镜头意图喂 LLM，输出 shot type + camera movement + angle + atmosphere 的结构化建议。学术(Camera Artist 多智能体 / arxiv 2506.18899 RAG 44 万影片 re-plan)与产品(ReelMind「Nolan」AI Director)都成熟。核心=一个带 shot grammar 系统提示的 LLM，输入 shot 意图，输出每镜 camera/motion 文本(可选映射成 chip)。
- **★关键复用**：`src/services/prompts/seedance-prompt-plan.service.ts` `createSeedancePromptPlan` 已是成熟的「LLM→结构化导演 JSON」规划器——输出 `timeline[].camera`(每段 shot size+angle+movement)、整体 camera/motion；系统提示 `SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT`(`src/constants/seedance-prompt-plan.ts`)已写满 shot grammar(close/medium/wide; eye-level/low/high/Dutch; push-in/pull-out/pan/tilt/tracking/crane/handheld/arc/dolly-zoom)+ Z 轴深度 + 物理表演 + 灯光连续性。**这正是「导演级运镜建议」的现成大脑。** ScriptDoc：`src/types/script-doc.ts` `ScriptDocShotSchema` 已有 `camera?:string`；`src/lib/node-workflow-script-doc.ts` `projectScriptDocToGraph` 已把 `shot.camera` 投进 shotText + seedance 的 camera 字段(L303/312)，**但 motion 当前固定投空串(L305 `motion:''`)**。助手 `src/services/node/node-assistant.service.ts` 目前是只读文本流，系统提示无 shot grammar。
- **净新增**：(1) ScriptDoc 草拟(node-script-doc.service)给每 shot 不只填 camera 还填 motion，或新增轻量「导演 pass」(对已生成 shots 调类 seedance-prompt-plan 的 LLM 把 summary→camera+motion)；(2) `projectScriptDocToGraph` 把 motion 也投进 seedance(现固定空串)；(3) 规划器输出对齐到 2.1 的 chip 词表(预填值=可点 chip)。**不需要第二套规划器**。
- **可行性 / 工作量**：medium / 3-5 天。
- **直连**：纯 LLM，沿用现有 `llm-text.service` + planner 路由(`resolveNodePlannerRoute`)，与 FAL/直连无关。
- **风险**：LLM 运镜质量参差，需 `src/lib/llm-output-validator.ts` 校验枚举落在 chip 词表内；`ScriptDocShotSchema` 改动属高危 types 区，只加 optional + 跑全量 tsc/vitest；自动预填要可覆盖(预填≠锁定)；camera/motion 来源去重(别两处各填导致投影冲突)。
- **来源**：arxiv 2506.18899 · reelmind Nolan · pandaily LibTV · houdao LibTV review。

---

## 3. 廉价迭代

### 3.1 草稿 → 成片两段式

- **怎么实现**：先用快/低质档出草稿，满意后用同 prompt/seed 跑全质量。对 Seedance 主线：草稿=`SEEDANCE_20_FAST`(480p~720p)，成片=`SEEDANCE_20` 标准档(1080p)，**复用同一 seed 保构图一致**(lastSeed 回写闭环已具备)。本质=同节点两次生成、参数档不同，不是新模型。
- **模型/API 支持**：Seedance 2.0 Fast(480p/720p，fal `bytedance/seedance-2.0/fast/text-to-video`，~$0.242/s@720p)；标准(480/720/1080p，~$0.303/s@720p，$0.682/s@1080p)。两档参数同构：prompt/resolution/aspect_ratio('auto')/duration('auto')/seed/generate_audio。**seed 跨档复用是支点。**
- **直连**：Seedance 走 VolcEngine/BytePlus ModelArk 官方直连，代码已落 VOLCENGINE adapter + 4 个 doubao-seedance-2-0(-fast) Ark model id(`src/constants/models/video.ts:154-223`)；Fast/标准在 ModelArk 同一套 API，只换 `model` 字段。
- **我们已有（几乎全部底层就位）**：双档常量 `SEEDANCE_20_FAST`(cost4) vs `SEEDANCE_20`(cost6)(`src/constants/models/video.ts:12-223`)；能力矩阵 Fast 仅 480/720、标准含 1080p(`src/constants/video-model-capabilities.ts:66-110`)；两层切换 `VIDEO_BRAND_VARIANTS[seedance]=[standard,fast]`(`src/constants/video-brands.ts:43-47`)，节点级 `defaultVideoModel={brand,variant}` 已贯通(`use-node-workflow.ts:85,152-166`)；seed 闭环 videoSeed 入参 + lastSeed 回写(`StudioNodeWorkbench.tsx:756-759,859-863`；`node-workflow.ts:174-176`)；执行器 `handleGenerateMediaNode` 已能按 modelId 跑任意档(`StudioNodeWorkbench.tsx:819-865`)。
- **净新增（UI/状态层，非引擎）**：(1) 节点 data 存草稿 vs 成片两份(现只有单一 mediaUrl/mediaLabel，`node-workflow.ts:204-206`)——加 `draftMediaUrl/draftSeed` 或 `stage` 字段；(2)「出草稿」+「升级为成片」两动作(variant fast→standard、resolution→1080p、复用 lastSeed 再调一次 handleGenerateMediaNode)；(3) 节点卡草稿/成片切换 chip + 成本提示。引擎层零新增。
- **可行性 / 工作量**：**easy / S-M(约 1-2 天)**，纯前端编排现有调用。
- **风险**：seed 在某些 reference 变体不支持(`videoModelSupportsSeed` 已枚举：reference-to-video / Kling V3 Pro / LTX 不接受 seed)，这些档草稿→成片退化为「近似」非「同款」，UI 需明示；双存增大 localStorage/snapshot 体积(已有 5s debounce)；owner 须定草稿默认档(480p 更省 / 720p 更贴近成片)。
- **来源**：byteplus ModelArk/1901652 · fal seedance fast/standard text-to-video · geelark seedance pro vs fast · ltx.io ltx-2-3 · atlascloud seedance guide。

### 3.2 镜头变体优选

- **怎么实现**：同一 shot 用不同 seed(或微调 prompt)并行跑 N 个(典型 2-4)变体，网格展示，选中「胜出」落定为产物；下游消费选中的 mediaUrl。fal/Seedance **无原生 `num_outputs=N`**，N 变体=N 次独立 task(N×成本)，前端并发编排。
- **模型/API 支持**：Seedance(fal + 火山)接受 `seed`；能力矩阵已枚举支持 seed 的档(SEEDANCE 全族 + Veo base；reference-to-video / Kling V3 Pro / LTX **不支持**，`video-model-capabilities.ts:27-44`)；**VolcEngine 官方限流 QPS=2、最多 3 并发 task**；成本=N×单档 cost。
- **我们已有**：`handleGenerateMediaNode` 单次幂等(循环换 seed 即批量)；seed 闭环；下游 `harvestUpstreamVideoUrls` 统一读 `node.data.mediaUrl`(`node-workflow-graph.ts:125-139`)，选中态写回 mediaUrl 下游零改动；节点状态机 running/done/failed(`node-types.ts:262-271`)。
- **净新增**：(1) `node.data` 扩 `variants:{url,seed,label}[]` + `selectedVariantIndex`(只加 optional，安全)；(2) 并发编排(节流尊重 3-concurrent)逐个回填；(3) 变体网格 UI + 选中写回 mediaUrl；(4) 成本预乘 N 提示(依赖 3.3)。
- **可行性 / 工作量**：medium / M(约 2-4 天)，建议与 3.1 合并(变体跑 Fast 档)。
- **风险**：QPS=2/3-concurrent 硬限，N>3 需排队;N×成本贵，默认落 Fast/低分 + 二次确认；reference/Kling/LTX 不支持 seed → 变体只能改 prompt(差异不可控)，UI 降级；多份产物 snapshot 体积膨胀。
- **来源**：fal seedance pro i2v · byteplus ModelArk/1520757 · apiyi seedance-2 guide · krea features/nodes。

### 3.3 生成前 credit 预估

- **怎么实现**：执行前遍历全图，逐节点查 model 单位成本 × (变体数/时长/分辨率系数)求和，确认 UI 展示。纯确定性，无 LLM。
- **数据源（已在代码内）**：每 video model 有静态 `cost`(SEEDANCE_20_FAST=4, SEEDANCE_20=6, VEO_31=8, KLING_V3_PRO=6, LTX_23=2，`src/constants/models/video.ts`)。注意：这是**内部 credit 数**，与 fal/火山真实美元价是两套，展示内部 credit 即可。
- **我们已有**：每 model `cost` 全已定义(video/image/audio/model-3d.ts)；`FREE_TIER.DAILY_LIMIT=20`(`src/constants/config.ts:488-493`)可做「本次消耗 X / 今日剩 Y」；节点已知其 model(`node.data.model`) + resolution/duration；`use-usage-summary` hook 已展示用量。
- **净新增**：(1) 纯函数 `estimateNodeCost(node)`→查 model.cost(可选按 resolution/duration/变体数加权)；(2) 在出草稿/出成片/批量/重跑动作前弹预估(单节点 + 批量求和)；(3) i18n×3。无后端改动。
- **可行性 / 工作量**：**easy / S(约 0.5-1 天)**；分辨率/时长加权再 +0.5 天。
- **风险**：现 cost 是扁平值，Fast/标准/不同分辨率真实美元差(0.24 vs 0.68/s)未体现 → 预估失真；要精准需重做 cost 为系数表(波及 99 个 `models.ts` importer，需向后兼容)。
- **来源**：krea ai-workflow-agent · krea compute-units · fal seedance fast。

### 3.4 仅重跑下游 + stale 失效传播

- **怎么实现**：改一处 → 把其传递性后代标 stale → 只重跑 stale 节点，按拓扑序，上游缓存保留。
- **我们已有（部分，关键拼图缺）**：✅ stale 状态已定义(`node-types.ts:269,280` + i18n×3「过期/古い/Stale」`messages/*.json:2918` + token 配色 `node-tokens.ts:131`)；✅ 上游遍历 `getUpstreamNodes`(`node-workflow-graph.ts:72-85`)；✅ 产物即缓存 `data.mediaUrl`；✅ `updateNodeData` 可批改状态(`use-node-workflow.ts:1080`)。
- **净新增（本主题最大工程，三处）**：(1) **下游遍历缺失**——全仓只有 getUpstreamNodes 和单跳 getOutgoingTargetByType(`use-node-workflow.ts:1257`)，**无 transitive descendant/BFS 下游遍历**(grep getDownstream/descendant 零命中)，需新增 `collectDownstream(nodeId,edges)` 做拓扑/BFS；(2) **stale 传播**——stale 状态**全仓无任何地方 set**(只有常量/i18n/token)，需在编辑产物字段时触发「下游标 stale」；(3) **选择性重跑编排** `runDownstreamStale(rootId)` 按拓扑序只跑 stale(复用 handleGenerateMediaNode + 尊重限流)。
- **可行性 / 工作量**：medium-hard / M-L(约 3-5 天)，三件核心逻辑全是净新增且要处理环/菱形/并发，最易出正确性 bug。
- **风险**：ReactFlow 不保证无环，collectDownstream 必须防无限递归；「改什么算 invalidate」需定义(改 prompt/seed/reference 才传，改 position/label 不传，可借鉴 `use-node-workflow.ts:1284`)；stale 与草稿/变体状态叠加 → status × generationStatus × stale × draft/final 组合需统一设计；尊重 3-concurrent。**建议作为独立后续阶段，先交付 3.1 + 3.3，等状态模型稳定。**
- **来源**：krea ai-workflow-agent · krea features/nodes · redis semantic-caching invalidation。

---

## 4. 成片音频

### 4.1 Lip-sync 上画布

- **现状盘点**：画布上「开口说话」两条路：(1) 端到端 talking-head(image+audio→视频内生 lipsync：Hedra Character-3 / Seedance reference-to-video)；(2) 后处理重对口型(已有 video + 新 audio：sync.so lipsync-2 / VEED / Kling)。**当前只存在路径(1)的一个特例**：Seedance 2.0 Reference(fal `reference-to-video`)的 `audio_urls`(≤3 条/合计 ≤15s/每条 ≤15MB)触发自动 audio+lipsync(`video-request-builders.ts:425` 注释)——非独立模型，质量/可控性不及专用。
- **我们已有**：lipsync 作「独立节点动作」**不存在**(grep lipsync/Hedra/sync.so 仅命中 builders 注释 + 模型描述文案)。音频汇入链就绪：`harvestUpstreamVoiceAudioUrls`(`node-workflow-graph.ts:146`)、`harvestUpstreamAudioBindings`(L216，带角色名→@AudioN)、`isVoiceProfileNode` 读 voiceReferenceAudioUrl。即「voice 节点音频已能流到 Seedance 触发内生 lipsync」。
- **净新增**：一个**专用 lipsync 节点/动作**(图或已生成 clip + 音频 → 对口型视频，独立于 Seedance t2v)：① 新 ProviderAdapter(fal 扩一个 lipsync builder，或直连新增 Hedra/sync adapter + AI_ADAPTER_TYPES 枚举 + providerConfig + key gate)；② AI_MODELS 加 lipsync 模型 + ModelOption(VIDEO，cost，i18n×3)；③ 节点侧 image/video-source + voice → lipsync 的连线契约 + inspector(复用 harvestUpstreamVoiceAudioUrls)；④ 落 Generation。图+音(Hedra)vs 视频+音(sync/Kling) 两种语义要区分。
- **可行性 / 工作量**：medium / 中(约 2-4 天)，骨架(fal queue 提交+轮询+落 R2)已被 mergeVideoClips/buildSeedanceReference 趟平；难点是「新节点类型+连线契约+inspector+模型注册」全栈纵切 + 直连 vs fal 决策。
- **直连（有真直连可用）**：【Hedra】官方 API(base `api.hedra.com`，`X-API-Key`)：建资产→上传图与音→`POST /web-app/public/generations {type:'video', ai_model_id:<Character-3>, start_keyframe_id, audio_asset_id, generated_video_inputs:{text_prompt,resolution:'720p',aspect_ratio:'16:9',duration_ms}}`→poll(图+音→说话头)；【sync.so】直连(SDK，$0.04/s@25fps，参数 video_url/audio_url/temperature/occlusion_detection_enabled)(视频+新音频重对口型)。fal 后备(fal-ai/sync-lipsync/v2 $3/min、/v2/pro $5/min、veed/lipsync $0.40/min，统一 video_url+audio_url+sync_mode)。
- **竞品**：Krea 独立 Lipsync 工具；Higgsfield Lipsync Studio 聚合多模型(Speak v2/lipsync-2/InfiniteTalk/Kling Avatar/Veo3) + 静图或视频输入 + TTS/克隆 + BGM 叠加——**两家都做成独立动作，印证应做独立节点**。
- **风险**：直连 vs fal 未定(fal 这块更省事且已接，需拍板)；Hedra Developer API 截至搜索仍标 private beta(需确认拿不拿得到 key)；图+音 vs 视频+音 两种语义易混；先界定专用 lipsync 解决「Seedance 内生做不到的精细对口型/对已有 clip 重配音」避免重复；provider 字段/价格须按 `docs/integrations/providers.md` 官方复核。
- **来源**：fal sync-lipsync/v2 · fal veed/lipsync · sync.so/docs · hedra.com/docs · higgsfield lipsync-studio · krea/lipsync。

### 4.2 音乐节点（文生音乐直连）

- **怎么实现**：一个「音乐」节点 prompt(+时长/风格/instrumental)→ 音乐生成模型 → 一条 AUDIO 资产，作成片配乐(music 轨)，合成阶段与 voice/ambient 混音。等同现有 AUDIO 路径，只换文生音乐端点。
- **直连候选（端点/参数/许可）**：【ElevenLabs Music，最贴合】`POST https://api.elevenlabs.io/v1/music`，`xi-api-key`(与已接 TTS **同款 key/header**)，body: prompt | composition_plan、`music_length_ms`(3000–600000)、`model_id`('music_v1'|'music_v2')、force_instrumental、seed、respect_sections_durations、sign_with_c2pa；**官方称首个授权数据训练、付费档广泛商用**(影视/大厂游戏需 Enterprise)。【Google Lyria 3/3 Pro】Vertex AI，prompt/negative_prompt/seed，Lyria 3 ≤30s、3 Pro ≤3min，带 SynthID+C2PA；走 Vertex/GCP(3 Pro 仍 preview/allowlist)。【Stability Stable Audio 2.5】Stability API 直连，授权数据训练、商用安全、支持 audio inpainting。【Suno/Udio】**无官方公开 API**(仅私有 beta)，逆向第三方法律风险高——**不做**。
- **我们已有**：AUDIO 路径全栈就绪：`src/constants/models/audio.ts` 有 AUDIO_MODEL_OPTIONS(Fish s2-pro、ELEVENLABS_V3)；**ElevenLabs 适配器已存在** `src/services/providers/elevenlabs.adapter.ts`(已用 `xi-api-key`、已配 baseUrl、registry 已注册 `AI_ADAPTER_TYPES.ELEVENLABS`)，key gate/providerConfig/cost 在 `constants/providers.ts`(L92/111/127/143/216)；ProviderAudioInput/Result + generateAudio 标准方法；voice 节点是现成「画布上音频节点」模板。
- **净新增**：① AI_MODELS 加 `ELEVENLABS_MUSIC`(externalModelId 'music_v2') + ModelOption + i18n×3；② ElevenLabs adapter 加 generateMusic(走 `/v1/music`，**与 TTS `/v1/text-to-speech/{voiceId}` 不同端点/body**，需新方法)；③「音乐节点」类型(NODE_TYPE_IDS 加 music，kind=audio) + inspector + 输出 audio；④ 纳入下游 music 轨(见 4.3)。Lyria/Stability 若也要各加 adapter(Lyria 需 Vertex OAuth 较重)。
- **可行性 / 工作量**：easy-to-medium / ElevenLabs Music 约 1-2 天(直连成本最低)；+Lyria 直连 +1.5-2 天。
- **直连**：**首选 ElevenLabs Music**(已持有 key/adapter/endpoint，复用度最高，商用许可最干净)；次选 Stability。Lyria 可行但走 Vertex 较重 + SynthID 水印。Suno/Udio 不接。无需 fal。
- **风险**：端点/参数/许可须官方复核(尤其「影视/大厂游戏需 Enterprise」边界要在产品文案体现)；别把 music prompt 塞进 TTS 端点；Lyria 水印/allowlist；成本档要进 cost 表。
- **来源**：elevenlabs music/compose + blog · vertex-ai music · stability stable-audio-25 · musicgpt suno-api · dynamoi suno commercial rights。

### 4.3 三轨混音（voice + ambient + music 配电平）

- **怎么实现**：把三类音频按电平叠成一条：对白(1.0) + 环境(~0.3-0.5) + 音乐(~0.2-0.4)，ffmpeg `filter_complex`：每条过 `volume` 再 `amix`(inputs=3, duration, dropout_transition)，避免削顶；进阶可 sidechain ducking(说话时音乐让路)。发生在成片合成阶段。
- **执行面**：fal ffmpeg-api 现成(已用 `merge-videos` 自动合并各 clip 音轨 + `compose` tracks/keyframes 时间轴)，但**当前 compose 调用只建一条 type:'video' track，没有 audio track/volume/amix**。素材侧文生音乐/音效走直连(4.2/4.4)，混音执行靠 ffmpeg。
- **我们已有**：`video-merge.service.ts` 完整 fal-ffmpeg 提交+轮询+落 R2 骨架(`mergeVideoClips` 音轨自动合并、`composeVideoClips` + `buildComposeKeyframes` L253-279、错误码体系)；VideoMergeNode + mergeSettings(`types/node-workflow.ts:145-158`)；音频汇入(harvestUpstreamVoiceAudioUrls/AudioBindings)。
- **净新增**：① compose 扩多 track(现只 1 条 video) + per-track/keyframe volume，或 filter 表达 amix——**必须官方复核 compose 是否支持 per-track volume/audio mix**(我们注释只验过 video keyframe 的 timestamp/duration，音频混音字段未验证)；② 若 compose 不支持，需新混音端点或自管 ffmpeg；③ 上游产出三类轨(voice 已有，ambient/music 净新增)；④ 节点 inspector 每轨电平滑块(进 constants + i18n×3)；⑤ 落库。
- **可行性 / 工作量**：medium-to-hard / 中-大(约 3-5 天，含复核 fal compose audio 能力)；若 compose 不支持混音则引新执行面(自管 ffmpeg)工作量翻倍。强依赖 4.2/4.4 先到位。
- **直连**：混音是 ffmpeg 执行问题，倾向沿用 fal ffmpeg-api(已接、成本≈0、worker 已迁)，仅需确认 compose 支持 amix+per-track volume；不支持则自管 ffmpeg 比再引第三方可控。素材侧音乐/音效走直连官方。
- **风险**：**【最大未决】fal compose 是否支持 audio+per-track volume+amix**；roadmap 把 videoMerge 锁死「纯拼接+尾裁」(VID-UI-8)，三轨混音属方向外扩需重新拍板；电平默认值是产品决策(无魔法值常量)；ducking 是进阶项，MVP 静态电平即可。
- **来源**：ffmpeg.media mix-audio-tracks · cloudinary ffmpeg add audio · elevenlabs sound-effects · higgsfield lipsync-studio。

### 4.4 环境音 / ambient 节点（三轨素材之一，现状缺口）

- **怎么实现**：背景/场景节点产出一条环境音(雨/街道/室内白噪)作 ambient 轨。技术=文生音效(text-to-SFX) + 循环到目标时长。
- **直连**：【ElevenLabs Sound Effects】`POST https://api.elevenlabs.io/v1/sound-generation`，`xi-api-key`(同已有 ElevenLabs key)，参数 text、duration(0.5-30s，None=自动)、loop(仅 v2，无缝循环→适合 ambient 铺底)、prompt_influence、output_format。商用同 ElevenLabs 付费档。
- **我们已有**：背景节点 `src/components/business/node/node-detail/BackgroundDetailBody.tsx` 注释**明写「环境音/氛围这一半被省略——无 ambient-audio 字段/节点类型/上传路径(GAP)」**。ElevenLabs key/adapter/AUDIO 落库范式同 4.2 可复用。
- **净新增**：① ElevenLabs adapter 加 generateSoundEffect(`/v1/sound-generation`，又是不同端点)；② 背景节点补 ambient 半边(prompt 字段 + 生成按钮 + 输出 audio，或独立 ambient 节点)；③ ambient 作三轨之一被下游 harvest；④ i18n×3 + cost。**BackgroundDetailBody 的 GAP 注释正是落点。**
- **可行性 / 工作量**：**easy / 小(约 1 天)**，把现有「省略的那一半」补上。
- **风险**：三个端点(TTS/Music/SFX)要分清；loop 仅 v2；须官方复核；与 music 是否合并为「音频生成节点(模式:TTS/音乐/音效)」属节点收敛决策(呼应 `project-node-consolidation` 按模态拆)，建议与 owner 对齐。
- **来源**：elevenlabs sound-effects/convert + capabilities/sound-effects。

---

## 5. 成片打磨与闭环

### 5.1 转场控制 — cut / dissolve / fade

- **怎么实现**：硬切=零重叠拼接(现状)；dissolve/crossfade/fade=前段尾 N 秒与后段头 N 秒重叠交叉混合。ffmpeg `xfade=transition=<type>:duration=<秒>:offset=<秒位>`(type ~40 种)；多段链式串(`[0][1]xfade...[v01];[v01][2]xfade...`)，offset 累积且扣除转场缩短的时长(5s+5s+2s 转场=8s)；音频单独 `acrossfade=d=<秒>` 否则爆音。纯确定性 DSP，零 LLM。
- **关键发现（硬约束）**：fal `ffmpeg-api/compose` 与 `merge-videos` **都不暴露转场字段**——compose keyframe 只有 timestamp/duration/url，track 只有 id/type/keyframes，无 transition/crossfade/opacity/volume，不支持负 gap 重叠。**fal 这条线对 dissolve/fade 是死路。**
- **可行路径**：(1) **自托管 ffmpeg**(xfade+acrossfade，全部转场类型，零第三方)；(2) 直连专业视频编辑 API：Shotstack(clip in/out transition=fade/dissolve，JSON 时间线，~$0.11-0.25/分钟)或 Creatomate(animations 挂 fade，~$0.06-0.28/分钟)。
- **我们已有**：拼接接线已就位但仅硬切：`src/services/video-merge.service.ts`(mergeVideoClips→merge-videos；composeVideoClips→compose，mergeSettings 只有 trim + concat，buildComposeKeyframes 端到端无重叠)；`src/app/api/node-workflow/merge-videos/route.ts`；`VideoMergeInspector.tsx`(clip 列表 + trim + merge)；`harvestUpstreamVideoUrls`；`r2.ts`(已镜像到 video-merges/)；**长视频已有 Cloudflare-Workflow 式 execution worker**(`video-pipeline.service.ts` + `execution-worker.service.ts`)——**自托管 ffmpeg 转场的天然宿主**。
- **净新增**：(1) mergeSettings 加 per-boundary transition(type 枚举 + durationSec，向后兼容 optional)；(2) **转场渲染引擎**——(A) execution worker 跑自托管 ffmpeg(xfade+acrossfade，含累积 offset + 时长补偿 + 音频交叉淡化)，或 (B) Shotstack/Creatomate adapter；(3) VideoMergeInspector 每边界转场类型下拉 + 时长；(4) 转场时长校验(≤相邻较短 clip)。硬切=零新增。
- **可行性 / 工作量**：medium / M(2-4 天)。Shotstack/Creatomate adapter ~1-2 天；自托管 ffmpeg 进 worker ~3-4 天但零第三方依赖 + 全转场类型。
- **直连**：转场是 ffmpeg DSP 不是模型 API——最「无中间商」的是**自托管 ffmpeg**(在已存在的 execution worker 跑，无第三方账号)，最契合直连偏好。Shotstack/Creatomate 是 SaaS 中间商(类 FAL)。**fal 这条线是死路，需替换渲染后端。**
- **竞品**：LTX Studio 时间线编辑器原生「add smooth transitions」+ 速度/反转 + animatic 阶段 refine pacing；Krea 时间线级转场弱于 LTX；Shotstack/Creatomate JSON 声明式转场。
- **风险**：fal 不支持转场是已验证硬约束；Vercel serverless 不适合跑重型 ffmpeg(CPU/时长/二进制)，必须落 execution worker/容器；xfade 多段 offset 累积+时长补偿易算错需单测；不做 acrossfade 会爆音;转场时长超相邻短 clip 报错需前置校验。
- **来源**：ffmpeg filters · ottverse xfade · fal ffmpeg-api/compose/api · shotstack fade/dissolve · creatomate merge-videos · ltx.io ai-video-editor。

### 5.2 转场控制 — match-cut（匹配剪辑）

- **怎么实现**：不混像素，而在两段间找构图/形状/动作/运镜/色彩呼应，让硬切无缝或有叙事意味。三类：graphic match / action match(cut-on-action) / sound match。自动化难点在配对(N² 候选)；学术(arXiv 2210.05766)用帧 embedding 排序。**因镜头是脚本顺序产出，不需全局配对——只对相邻两段切点附近取帧(前段末帧+后段首帧)用 VLM 判构图/主体是否对齐，给「可 match-cut / 建议第 X 帧切 / 构图不匹配建议 dissolve」。** 纯硬切+智能切点，不改像素。
- **模型/API 支持**：无专用 match-cut 模型。靠两块已有能力：(1) 取帧(ffmpeg seek 或对 mediaUrl `-ss` 抽单帧)；(2) 视觉判断(多模态 LLM 比对两帧)。直连 Gemini generateContent / OpenAI vision(已直连)。
- **我们已有**：视觉判断路由就绪 `src/services/llm-text.service.ts` `llmTextCompletion` 支持 `imageData:string|string[]`(Gemini inlineData / OpenAI image_url，含 SSRF 守卫)，`resolveLlmTextRoute` 已 Gemini→DeepSeek→OpenAI→Qwen + 平台 key 回退；现成范式可抄：`generation-evaluator.service.ts`(urlToDataUrl→VLM→Schema+validateLlmStructuredOutput+withRetry)、`image-analysis.service.ts`；视频节点已带 imageUrl(preview poster)可当切点参考帧。
- **净新增**：(1) 取切点帧(用现成 imageUrl poster 则零新增；精确末/首帧需 ffmpeg seek，同落 worker 与 5.1 共用)；(2) match-cut 评估 service(相邻两段取帧→VLM 比对→matchable 布尔+建议切点+理由+回退转场，复用 evaluator 范式)；(3) Zod 结果 schema(matchScore/alignedSubject/suggestedTransition)；(4) Inspector/助手呈现。
- **可行性 / 工作量**：medium。定性建议版(复用 poster + 抄 evaluator)约 1 天；精确切点版(ffmpeg 多帧)叠加到 5.1 后 +2 天。
- **直连**：视觉判断直连 Gemini/OpenAI(已直连)；取帧自托管 ffmpeg 零第三方。
- **竞品**：主流(LTX/Krea/Updream)均未把 match-cut 做成自动按钮——**差异化空间**。
- **风险**：match-cut 是审美判断，VLM 建议主观不稳，定位为「建议」非自动执行；poster 帧不一定是真实切点；与 dissolve 是互斥哲学，UI 要让用户清楚 match-cut=硬切+对齐建议。
- **来源**：arxiv 2210.05766 · wikipedia match cut · adobe match-cut · filmsupply cutting-on-action。

### 5.3 助手 review 整片/单镜头（对照 ScriptDoc 意图做一致性检查）

- **怎么实现**：video QA 标准做法：(1) 关键帧采样(VLM 不能直吃长视频，降到帧序列)；(2) VLM 比对(帧+意图描述→逐项打分；2025 VideoGameQA-Bench：GPT-4o 视觉 glitch 82.8%，Gemini-2.x-Flash 定位问题帧最强)；(3) 一致性维度(角色 ID 一致 / 构图镜头意图匹配 / 跨镜头连贯衣着光照 / artifact)。落到我们=对每 shot：取若干帧 + 该 shot 的 ScriptDoc 意图(summary/camera/绑定角色 description)→VLM 输出「匹配/偏离项/修复建议」；整片=把所有 shot 同 roleId 出现帧串起来查跨镜头漂移。
- **模型/API 支持**：复用现有多模态路由(Gemini 2.x Flash 最擅长定位问题帧 / GPT-5/4o-mini / Qwen-VL)；`llmTextCompletion` 的 `imageData:string[]` + `responseFormat:'json_object'`。直连 Gemini/OpenAI/DashScope(已配线)。视频→帧采样目前无服务端能力(见 gap)。
- **我们已有（几乎全部原语）**：**`src/services/generation-evaluator.service.ts` 是现成骨架**——取图(urlToDataUrl)+对照原始意图(extractEvaluationPrompt 解 subject/composition/camera/lighting/style/mood/mustInclude)+VLM 打分(subjectMatch/styleMatch/compositionMatch/artifactScore/promptAdherence/overall+detectedIssues+suggestedFixes)+防注入+withRetry+落 DB，**几乎就是镜头 review 骨架，只差换成视频帧**；多模态路由 `llm-text.service.ts`；意图来源 ScriptDoc 已结构化(`script-doc.ts` ScriptDocShot: summary/camera/roleIds/dialogue；ScriptDocRole: description=视觉身份种子；styleNote/logline)；助手 `node-assistant.service.ts` 是**纯文本助手**(只吃 id/type/status/title/summary，无视觉、无 ScriptDoc 对照)；产物 mediaUrl/imageUrl 可取；`llm-output-validator.ts`、`prompt-guard.ts` 在。
- **净新增**：(1) 视频帧采样(最省事用 imageUrl poster 单帧零新增但只够粗判；认真 review 需 ffmpeg 多帧，落 worker 与 5.1 共用)；(2) 镜头 review service(组装 ScriptDoc shot 意图 + 帧序列→VLM→结构化 review，几乎照抄 evaluator)；(3) 整片连贯 review(跨 shot 把同 roleId 出现帧并排喂 VLM 查身份/风格漂移，新增 stitchByRole)；(4) review 结果 Zod schema；(5) **助手能力扩展——独立 review service+route，别污染纯文本 node-assistant**(否则重蹈 DeepSeek 因混文本+视觉进不去助手，见 `project-studio-assistant`)；(6) 结果回写节点/dock 呈现 + 一键应用修复到该 shot prompt。
- **可行性 / 工作量**：medium / M(2-4 天)。单镜头 review(poster 单帧 + 抄 evaluator + ScriptDoc 意图 + 独立 route)约 1.5 天；多帧采样 + 整片跨镜头漂移 + 回写修复 +2 天。
- **直连**：VLM 全程直连官方(Gemini Flash 最擅长定位问题帧 / GPT-5-mini / Qwen-VL)，已配线无 fal；视频抽帧自托管 ffmpeg 零第三方。
- **竞品**：LTX Studio 用 Persistent Character Profiles 做前置约束式一致性(偏人工 review)；Krea 主打生成端一致性；**无一家把「VLM 自动对照剧本意图逐镜头打分+整片漂移检测」做成助手能力——差异化点**。学术：MovieTeller(角色 ID+BBox 保 ID 一致)、VideoGameQA-Bench、GPT-4o 零样本排序关键帧。
- **风险**：长视频不能直喂 VLM 必须先抽帧(前置依赖，与 5.1 共用 ffmpeg worker)；跨镜头身份漂移检测对 VLM 是难任务(2025 基准定位问题帧仅 ~35% 5 秒内准)，定位为辅助建议非裁决；**别把视觉 review 塞进现有文本 node-assistant**(重蹈 DeepSeek 覆辙，独立 service+route)；ScriptDoc 意图须当评估对象不当指令(沿用 evaluator 防注入)；多帧 VLM token/成本随帧数线性涨，需限帧+缓存(evaluator 已有缓存可抄)。
- **来源**：arxiv 2505.15952 · arxiv 2602.23228 · efficient-video-intelligence · ai.google.dev vision · openai vision guide。

---

## 6. 建议落地顺序

- **第一波（一致性 + 迭代成本 + 音画补齐，主要复用现有原语，全程直连）**：1.1.2 末帧获取 → 1.1.3 画布续接 · 3.1 草稿→成片 · 1.2 角色三视图 · 3.3 credit 预估(简版) · 4.2 音乐节点 + 4.4 环境音节点。
- **第二波（导演控制 + 变体 + lip-sync + review）**：2.1 运镜 chips + 2.2 助手预填(含 1.3 导演台轻量版) · 3.2 变体优选 · 4.1 lip-sync · 5.3 助手 review。
- **决策门后（较重 / 需拍板）**：5.1 转场(渲染后端选型) · 4.3 三轨混音 · 3.4 仅重跑下游(stale) · cost 精准化(系数表)。

> 每个功能立项时，对照本文「净新增 / 风险 / 直连」三栏，并遵守项目硬规则：types 改动只加 optional + 全量 tsc/vitest；provider 字段/价格按 `docs/integrations/providers.md` 官方复核；i18n 三语同步；加模型走 `add-model` skill。

---

## 7. 核查后修订（2026-06-22 · 代码核查 + grounding 工作流）

> 本节是底稿付主后的二次核查结论。两轮验证：① 4 个 Explore agent 横向核验全文约 25 条「我们已有 X」承重断言；② 1 个并行 grounding 工作流（4 reader）把第一波净新增与音频形态钉到字段 / 函数级。结论：**底稿 grounding 真实度 ~95%**，优先级判断成立。下面是 3 处纠偏 + 字段级精度补充 + 一处冲突拍平 + 第一波真实顺序 + 被拆散的 ffmpeg 枢纽 + 音频形态代码依据。

### 7.1 三处纠偏

1. **「99 个 `models.ts` importer」是文件数，不是模型数。**（出现在 3.3 / cost 精准化风险列）`99` 指导入 `models.ts` 的文件数（与 CLAUDE.md「constants/models.ts — 99 files」一致），模型选项实际 **35 个**（image 15 / video 12 / audio 2 / 3D 6）。结论不变（cost 改系数表确实波及大量 importer，需向后兼容），但立项时别误读成「99 个模型要改」。

2. **5.3「几乎照抄 evaluator」偏乐观 —— 应为 PARTIAL。** `generation-evaluator.service.ts` 的 VLM→Zod→DB→缓存 plumbing 确实可复用，但 `extractEvaluationPrompt` 解的是**图像意图**（subject/scene/composition 文本），**不解视频 shot grammar**（机位 / 运镜 / 景别）。视频 review 要新写「视频意图抽取（对照 ScriptDoc `shot.camera` / 绑定角色 description）」+ 帧采样。骨架可抄，意图层是净新增。

3. **上一轮存疑的「三视图 status route 未定位」已澄清 —— route 存在，无轮询缺口（利好 1.2）。** `src/app/api/generate-multiview/status/route.ts` 确实存在；`src/lib/api-client/multiview.ts` 的 `checkMultiViewStatusAPI(batchId, jobIds[])` + `use-generate-multiview.ts` 的 poll loop 闭合完整。即 1.2 三视图除了「接到角色节点」外**没有轮询基建缺口**，S(0.5-1 天) 的判断更稳。

### 7.2 字段 / 函数级精度补充（grounding 工作流）

| 项                 | 净新增精度（file:line）                                                                                                                                                                                                                                                                                | 摩擦点                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1.1.2 末帧落点     | `NodeWorkflowNodeDataSchema`(`types/node-workflow.ts`) **无** `lastFrameUrl`/`thumbnailUrl`/`posterUrl` 字段；`ExecutionCallbackResultDataSchema`(`types/index.ts:1218`) **有** `thumbnailUrl`。净新增 = 加 `lastFrameUrl` optional 字段 + execution callback 把 `thumbnailUrl→node.data.lastFrameUrl` | 回写要区分媒体类型（只有视频节点取末帧）；确认 worker 回传的 `thumbnailUrl` 是「严格末帧」还是「缩略图」 |
| 1.1.3 续接依赖方向 | **改的是调用方，不是 harvest。** `harvestUpstreamVideoUrls`(`node-workflow-graph.ts:125-139`) 只读 `mediaUrl`、保持不变；要「取末帧当 first_frame」是在 `StudioNodeWorkbench` 提交前换字段 / 端点参数。但它**需要 1.1.2 的 `lastFrameUrl` 字段先存在**                                                 | 「何时用末帧续接 vs 整段视频参考」是业务规则，需 UI 明确区分                                             |
| 3.1 草稿→成片      | 「纯前端」**成立，但有前提**（见 7.3）。净新增 = draft 字段（`draftMediaUrl`/`draftMediaLabel`/`draftGenerationId` 或单 `mediaUrl`+`variant` 标记）+ write-back 分支 + 两步 UI                                                                                                                         | seed 在 reference/Kling V3 Pro/LTX 档不支持 → 这些档草稿→成片退化为「近似」非「同款」，UI 需明示         |
| 3.3 credit 简版    | 一行函数：`estimateNodeCost(node) = getModelById(node.data.model?.modelId)?.cost ?? 0`。`ModelOption.cost`(`models/types.ts:41`) 与 `getModelById`(`models/index.ts`) 就绪                                                                                                                             | 几乎零摩擦；扁平 cost 与真实美元差（见纠偏 1）                                                           |

### 7.3 一处需要拍平的冲突：3.1 到底纯不纯前端

两轮核查给了**表面相左**的结论，这里拍平（遵守「暴露冲突不折中」）：

- 第一轮验证：`handleGenerateMediaNode` **已能按 `modelId` 跑任意档**（已验）；seed 闭环已贯通 → 结论「纯前端编排」。
- grounding 工作流：`handleGenerateMediaNode` 无 `variant` 参数，补 variant 需动 API/service → 结论「不是纯前端」。

**拍平**：分歧源于「draft/final 怎么建模」。若把双档建模成**两个已存在的 `modelId`（`SEEDANCE_20_FAST` vs `SEEDANCE_20`）+ 共享 seed 的两次生成**，则 API/service **零改动**（它们本就按 modelId 路由），唯一前端净新增是「结果写到 `draftMediaUrl` 还是 `mediaUrl`」的 write-back 分支 + 两步 UI。**所以「纯前端」成立 —— 前提是别引入新的 `variant` 协议参数，直接复用 modelId 双档。** 这也更符合长期建模（把「档」当属性 / 已有模型，不新造参数）。

### 7.4 第一波真实顺序（按依赖 + 摩擦 + 杠杆重排）

底稿 6 节把第一波列成并列 6 项；核查后它有清晰的依赖与可合并结构。重排：

| 层                                        | 项目                                 | 依赖 / 性质                                                                                | 量级                              |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------- |
| **T0 顺手搭车（零依赖、可与任何项同期）** | 3.3 credit 简版 · 1.2 三视图         | 一行函数；三视图轮询基建已闭合，只差接角色节点                                             | 各 S(0.5-1天)                     |
| **T1 旗舰（最高杠杆 + 最低风险）**        | 1.1.2 末帧字段+回写 → 1.1.3 画布续接 | 一致性 #1；本质是把 worker 已跑通的 `last_frame_chain` 下放到画布。1.1.3 依赖 1.1.2 的字段 | 1.1.2 易(1-2天) · 1.1.3 中(3-5天) |
| **T2 独立增量**                           | 3.1 草稿→成片                        | 前端两步（7.3），与 T1 正交；建议草稿跑 Fast 档                                            | S-M(1-2天)                        |
| **T3 待岔路拍板**                         | 音频（原 4.2 音乐 + 4.4 环境音）     | 卡在「音频节点形态」决策（见 7.6）；两者是同一个 ElevenLabs adapter 扩两端点，应合并立项   | 决策后 easy(各1-2天)              |

要点：① 旗舰是 **1.1.2→1.1.3**，不是六项平摊；② **4.2 + 4.4 是一份工作**（同 adapter、同节点壳），且被音频形态决策卡住，不要当两个独立第一波项；③ T0 两项小到可塞进旗舰同一周期。

### 7.5 被底稿拆散的枢纽：自托管 ffmpeg = 一选解三

底稿把 **5.1 转场**、**4.3 三轨混音**、**5.2/5.3 的精确抽帧** 当三个独立后置项分别标「决策门后」。核查确认它们**共享同一个根因**：`fal-ai/ffmpeg-api/compose` 只能单 video track、顺序拼接、不暴露 transition/audio/volume/amix（`video-merge.service.ts:20-30,197-201,286-291` 已验，硬约束）。

所以真正的决策不是「要不要做转场」，而是 **「execution worker（`workers/execution/`，已存在）里要不要落一个自托管 ffmpeg 步骤」**：

- 落了 → xfade 转场 ✅ + amix/per-track volume 三轨混音 ✅ + 精确末帧 / 切点抽帧（喂 5.2/5.3）✅ —— **一次基建解锁三个后置项**，零第三方，最契合直连偏好。
- 替代 = Shotstack/Creatomate 这类 SaaS（类 FAL 中间商），违背直连。

**建议**：把 5.1 / 4.3 / 精确抽帧 从「三个独立决策」改记为「**一个 ffmpeg-worker 决策门**」。它仍后置，但价值密度远高于底稿分散呈现的样子。注：三轨混音还要先确认轨道在 harvest 层如何区分（与 7.6 音频形态耦合）。

### 7.6 音频形态决策的代码依据（呼应决策点 #5）

grounding 把「三个独立节点 vs 一个音频节点 + 模式」钉到了代码先例：

- **现状**：音频模态只有 `NODE_TYPE_IDS.voice` 一种(`node-types.ts:108` `NODE_AUDIO_MODEL_NODE_TYPES=[voice]`)；`mediaKind` 已把 voice 归到 audio 模态。
- **收敛计划的精神**：`docs/plans/node-consolidation-2026-06.md` 明写「按模态拆，不按角色拆」，音频目标 = **一个节点**。music/ambient/TTS 不是三个模态，是 audio 模态内的三条 provider 路径。
- **现成范式**：图片节点的 `role` 判别式(`NODE_IMAGE_ROLE_IDS=character/background/shot/frame`，单 image 节点 + 按 role 查字段表 + thin-wrapper inspector 复用 `NodeMediaInspector` + load 时 migration + `resolveNodePresentationType` 映射回 legacy 供 badge/i18n)。加一个 role ≈ 6 文件。
- **成本对比**：三个独立类型 ≈ 20-25 文件 / >100 ripple / 5-7 天；一个 `audio` 节点 + `audioKind` 属性 ≈ 6 文件 / 1-2 天。
- **三轨 harvest 耦合**：三轨(voice/music/ambient)在 Seedance 端**共用单一 `audio_urls` 通道**(≤3 条、合计 ≤15s，`video-request-builders.ts:422`)。无论哪种形态，都要在 builder 侧分配 3-URL/15s 预算(voice 优先 > music > ambient)并给 `@AudioN` token 补 role 标注(`@Audio1 (Alice voice)` vs `@Audio2 (ambient rain)`) —— 这是净新增的 prompt-prefix 逻辑。Role 方案让这件事集中在 audio 节点内、单一 harvest 内按 `audioKind` 分轨，比三个独立 harvest 函数竞争预算更干净。

**核查结论（供 7.5 决策门参考）**：代码先例、收敛计划、成本三者一致指向 **一个 `audio` 节点 + `audioKind`(voice/music/ambient) 属性**，而非三个节点。
