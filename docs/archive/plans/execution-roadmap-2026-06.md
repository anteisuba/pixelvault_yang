# 全域执行路线 v2(方向已锁定 · Codex 任务包)

> **最后更新**:2026-06-13
> **状态**:计划(未实现)。本文档是可让 Codex 从上到下逐包执行的任务清单,所有任务包尚未落地。
> **Provider 复核声明**:凡涉及 provider / payload / endpoint / token / 价格的步骤,在编码前**必须**按 `docs/integrations/providers.md`(以及私有媒体相关的 `docs/architecture/storage.md`)重查官方文档复核,与本文记录不符时先停下 surface,不得照本文记录直接写死。本文中的 fal / Seedance / Kling / Cloudflare R2 字段描述均为待复核的现状快照,非已验证的最终事实。

---

## 0. 已锁定方向(精炼)

所有任务包必须严格遵守,**不得重开**这些决策:

**[全局]**

- 专业优先 + 长视频画布(Node 导演台)= 核心北极星;轻量功能已完成,只做 UI 打磨。
- 执行严格按 **mainline 顺序**:图片 → 声音 → 视频 → 资源 → Gallery → 3D 冻结。
- 视频成本 **BYOK 先行**(契约预留未来切平台计费)。

**[视频收敛]**

- 三套系统(VideoScript Studio 面板 / Node workflow / VideoPipeline)收敛成一套:统一 `ScriptDoc/Scene/Shot/ShotPlan`。
- Shot Board 主视图 + Node Graph 双向映射高级视图(行 ↔ 节点用同一 Shot id)。
- 服务端 planner 吸收 `video-scene-orchestrator`。
- 旧 VideoScript 面板灰度并行到 Board 验收后,按硬条件下线。

**[视频第一期]**

- 系列镜头 ≤60s / 3–6 镜 / 每镜 4–15s / 强一致;长视频留第二期。

**[视频模型]**

- Seedance 2.0 Reference(质量 1080p,fal)+ Seedance 2.0 Fast Reference(经济 720p,fal)+ Kling V3 Pro(补单次多镜分镜,fal);全走 fal(已接入 / 已 worker 迁移 / 成本≈0)。
- 直连(Seedance via VolcEngine/BytePlus Ark、Veo via Gemini)后续单独排期;Kling 官方直连不做。

**[clip 归档]**

- 全量升格:每个 clip / reference 落 Generation;中间镜头打类型标记,默认不进主 Gallery/Assets 视图。
- Generation 加 lineage(`nodeWorkflowProjectId` + shot 序号)必填(见 0.1 "实现中需注意":契约 required + DB optional 调和)。

**[ScriptDoc]**

- 骨架级(分场 / 分镜:机位 / 动作 / 时长;台词存原文,dialogue 结构字段预留 optional)。
- 逐镜 approve / retry / regenerate(Shot 级 status)。
- 先 JSON 不进 Prisma(给出 JSON→Prisma 提升触发条件)。

**[声音]**

- 克隆授权勾选护栏(copyRisk 仅提示不硬门控)。
- VoiceCard 独立模型 + `/cards` Voice tab(折中)。
- CharacterCard ↔ VoiceCard 软引用(可选 `defaultVoiceCardId`)。
- Fish Audio 直连唯一,砍 `fal_f5tts` 占位(只砍 VoiceCard provider 死分支,**不动** audio model `AI_MODELS.FAL_F5_TTS`)。
- 剧本 planner 纳入 VolcEngine 豆包(auto 仍首选 Gemini)。
- Audio Studio = 试音 + 成品,Node = 角色 / 剧本绑定编排;reference audio 分生命周期。

**[图片]**

- 结果去向先补"转视频" + "存 StyleCard"(3D / 发布 / Project 延后)。
- 参考图加语义角色(角色 / 风格 / 构图,provider 能力须核实)。
- StyleCard 先严格(锁模型 / 参数 + 贴合检查)+ modelId 软解耦(降为推荐,不静默劫持)+ 补 quick-mode 不读 StyleCard 缺口。
- 编辑页分层收敛(高频轻编辑进内联,重编辑留独立页)。

**[资源/安全]**

- 私有媒体混合(public→CDN / private→signed 或 proxy)。
- projectId 越权校验作安全补丁可提前;全写路径所有权校验。
- 存量 public URL 渐进迁移;route factory 统一。

**[移动端]**

- 桌面优先;移动端只读 + 审核(approve / retry / 看成片),不做画布编辑。

**[低杠杆]**

- videoMerge 锁死纯顺序拼接 + 尾裁;Node passthrough 只收执行路径节点;i18n 严格三语;CardRecipe 不做管理页;CharacterCard 付费 refine 闭环延后;3D 冻结只维护;VideoPipeline 旧路由安全下线。

---

## 0.1 全局规则(硬规则 + 验证命令)

**项目硬规则(每个任务包必须内建,后文不再逐包重复罗列):**

1. **No `any`** — 用 Zod schema + `z.infer<typeof schema>`;API route 用 `.safeParse()`(不要 `.parse()`)。
2. **No fetch in components** — 所有 API 调用走 `src/lib/api-client.ts`。
3. **API route 三件事** — auth(Clerk)→ Zod validate → call service。
4. **Service 首行** — `import 'server-only'`。
5. **No 魔法值** — 错误码 / 限额 / 模型 id / 枚举进 `src/constants/`;**No Tailwind arbitrary values**(扩 `tailwind.config.ts`)。
6. **先读再写** — 改高危模块只做**向后兼容**(只加 optional / 不破坏既有导出签名语义):`src/types/index.ts`(333 文件)、`generate-image.service.ts`、`studio-context.tsx`、`constants/models.ts`、`storage/r2.ts`、`generation.service.ts`;改前先 `grep -r "import.*from.*<模块>" src/` 确认影响面。
7. **i18n 三文件同步** — `src/messages/{en,ja,zh}.json` 必须同步。
8. **失败大声暴露** — 不静默 swallow 越权 / 部分跳过;不确定性 surface。
9. **Provider 复核前置** — provider / payload / endpoint / token / 价格编码前必须按 `docs/integrations/providers.md` 重查官方文档。

**验证命令(每包按适用项跑):**

- 单测:`npx vitest run --reporter=verbose <相关测试>`
- 全量类型:后台跑 `npx tsc --noEmit`,**显式捕获 exit code**(管道会吃退出码;全量 ~4 分钟,禁止因超时跳过)。
- 机械门:`npm run lint && npm run build`(**dev server 在跑时勿并行 build** — 会污染 `.next`/Turbopack 缓存导致嵌套路由 404)。
- UI 包额外:`npx playwright test e2e/visual.spec.ts`(有意改动则 `--update-snapshots` 并在报告点名快照)+ `e2e/mobile.spec.ts --project=mobile` + 44px 触达区断言;视觉基线按 OS 分套(`-win32`/`-darwin`)。

---

## 0.2 全局执行序总览(排期结果)

严格按 mainline 顺序(图片 → 声音 → 视频 → 资源 → Gallery → 3D),但 SEC 工作流是方向明确允许的横切补丁,故 `SEC-1`/`SEC-6` 前置到与图片阶段并行,且 `SEC-2` 必须早于 `GAL-1/GAL-2`。`PR-1` 依赖 `IMG-2`,紧随其验收即可做。

| 序  | Packet            | 阶段                                             | 依赖                                                |
| --- | ----------------- | ------------------------------------------------ | --------------------------------------------------- |
| 1   | **SEC-1**         | 资源/安全(横切提前;解锁 IMG/GAL 所有权校验依赖)  | —                                                   |
| 2   | **SEC-6**         | 资源/安全(私有媒体预研前置门)                    | —                                                   |
| 3   | **IMG-2**         | 图片(mainline 第 1 顺位)                         | —                                                   |
| 4   | **IMG-4**         | 图片                                             | —                                                   |
| 5   | **IMG-7**         | 图片                                             | —                                                   |
| 6   | **IMG-1A**        | 图片                                             | —                                                   |
| 7   | **IMG-3**         | 图片                                             | IMG-2                                               |
| 8   | **IMG-5**         | 图片                                             | —                                                   |
| 9   | **IMG-6**         | 图片                                             | IMG-4                                               |
| 10  | **IMG-8**         | 图片                                             | IMG-7                                               |
| 11  | **IMG-1C**        | 图片                                             | IMG-1A                                              |
| 12  | **IMG-1B**        | 图片                                             | IMG-1A, IMG-3                                       |
| 13  | **SEC-2**         | 资源/安全(私有媒体 `/api/media`;GAL 依赖)        | SEC-1                                               |
| 14  | **SEC-3**         | 资源/安全                                        | SEC-1                                               |
| 15  | **SEC-4**         | 资源/安全                                        | SEC-1                                               |
| 16  | **SEC-5**         | 资源/安全(route factory 迁移)                    | —                                                   |
| 17  | **SEC-7**         | 资源/安全(referenceImage storageKey + lifecycle) | SEC-6                                               |
| 18  | **SEC-9**         | 资源/安全(`/api/media/[id]` 实现)                | SEC-6, SEC-7                                        |
| 19  | **SEC-8**         | 资源/安全(存量 URL 迁移预研)                     | SEC-6, SEC-9                                        |
| 20  | **SEC-10**        | 资源/安全(公私分流写入)                          | SEC-6, SEC-9, SEC-7                                 |
| 21  | **PR-1**          | P5(图→Recipe→回溯闭环)                           | IMG-2                                               |
| 22  | **VOICE-1**       | 声音(mainline 第 2 阶段)                         | —                                                   |
| 23  | **VOICE-3**       | 声音                                             | —                                                   |
| 24  | **VOICE-4**       | 声音                                             | —                                                   |
| 25  | **VOICE-5**       | 声音                                             | —                                                   |
| 26  | **VOICE-6**       | 声音                                             | —                                                   |
| 27  | **VOICE-7**       | 声音                                             | —                                                   |
| 28  | **VOICE-2**       | 声音                                             | VOICE-1                                             |
| 29  | **VOICE-8**       | 声音                                             | VOICE-7                                             |
| 30  | **DIR-DATA-07**   | 视频/数据(X-PROV 复核,全工作流前置门)            | —                                                   |
| 31  | **DIR-DATA-01**   | 视频/数据(统一 ScriptDoc 契约)                   | —                                                   |
| 32  | **DIR-DATA-04**   | 视频/数据(Generation lineage 列,高危独立 PR)     | —                                                   |
| 33  | **VID-UI-1**      | 视频/UI(Board↔Graph 锚点,UI 前置)                | —                                                   |
| 34  | **VID-UI-8**      | 视频/UI(videoMerge 锁死)                         | —                                                   |
| 35  | **DIR-DATA-02**   | 视频/数据(workflow-planner 服务)                 | DIR-DATA-01, DIR-DATA-07                            |
| 36  | **DIR-DATA-05**   | 视频/数据(clip 全量落 Generation + lineage)      | DIR-DATA-04, DIR-DATA-07                            |
| 37  | **DIR-DATA-06**   | 视频/数据(X-KEY BYOK 收敛)                       | DIR-DATA-07                                         |
| 38  | **DIR-DATA-03**   | 视频/数据(模型解析白名单)                        | DIR-DATA-02, DIR-DATA-07                            |
| 39  | **VID-UI-2**      | 视频/UI(Shot Board 主视图组件)                   | VID-UI-1                                            |
| 40  | **VID-UI-4**      | 视频/UI(Board↔Graph 双向同步)                    | VID-UI-1                                            |
| 41  | **VID-UI-7**      | 视频/UI(passthrough 收敛)                        | VID-UI-1                                            |
| 42  | **VID-UI-3**      | 视频/UI(Board 数据 hook + 审阅循环)              | VID-UI-1, VID-UI-2                                  |
| 43  | **VID-UI-6**      | 视频/UI(移动端只读 Board)                        | VID-UI-2, VID-UI-3                                  |
| 44  | **VID-UI-5**      | 视频/UI(旧面板灰度 + 下线硬条件)                 | VID-UI-3                                            |
| 45  | **GAL-1**         | P5 Gallery(provider-URL 审计 + 收口)             | SEC-2                                               |
| 46  | **GAL-2**         | P5 Gallery(私有作品下载门控)                     | SEC-2, GAL-1                                        |
| 47  | **GAL-CLEANUP-1** | 收尾(VideoPipeline 旧路由下线第一步)             | **DIR-DATA-06**(原排期写 `DIR-5`,见 conflicts 修正) |
| 48  | **BND-1**         | 收尾(边界记录)                                   | —                                                   |
| 49  | **I18N-1**        | 收尾(i18n 严格三语策略门)                        | —                                                   |
| 50  | **3D-0**          | P6 3D 冻结(mainline 末位,只维护)                 | —                                                   |

**可并行批次:**

- 图片阶段五条无依赖根包:`IMG-1A / IMG-2 / IMG-4 / IMG-5 / IMG-7`。
- 安全两条独立根链:`SEC-1`(所有权)与 `SEC-6`(私有媒体预研);整个 SEC 可与 IMG 阶段并行推进。
- 声音六条无依赖根包:`VOICE-1 / VOICE-3 / VOICE-4 / VOICE-5 / VOICE-6 / VOICE-7`。
- 视频数据三条根包:`DIR-DATA-07 / DIR-DATA-01 / DIR-DATA-04`(`DIR-DATA-07` 优先,是 02/03/05/06 共同前置)。
- 视频 UI 两条根包:`VID-UI-1 / VID-UI-8`(`VID-UI-1` 是 2/3/4/5/6/7 共同前置)。
- DIR-DATA(服务端 + Prisma)与 VID-UI(导演台 UI)可大幅并行,在 Shot id 锚点处对齐。
- 收尾:`BND-1 / I18N-1 / 3D-0` 彼此无依赖;`I18N-1` 应在每个新增 namespace 的包验收时随手做。

---

## 【IMG · P1 图片】任务包

> 阶段:**图片(mainline 第 1 顺位,先于声音/视频/资源/Gallery)**
> 执行顺序:IMG-1(转视频/存卡的载体+UI)→ IMG-2(语义角色 schema)→ IMG-3(角色 UI+降级)→ IMG-4(StyleCard 软解耦)→ IMG-5(贴合检查)→ IMG-6(quick-mode 缺口)→ IMG-7(decompose 归一)→ IMG-8(编辑页分层)。IMG-2/4/7 是其它包的地基,优先。

### [IMG-1A] 给 studio-context 增加跨模式参考载体 + sourceGenerationId(转视频地基)

- 读先:`src/contexts/studio-context.tsx`(state shape L90-110、reducer L350-420、`SET_OUTPUT_TYPE` L356)、`src/lib/studio-remix.ts`、`src/types/index.ts`(StudioGenerateSchema L3297)、`src/contexts/CLAUDE.md`
- 改什么:在 `StudioFormState` 增 **optional** 字段 `pendingReferenceImages?: string[]` 与 `sourceGenerationId?: string | null`(WARM/HOT 归属:放 FormContext,随 mode 切换保留)。新增 reducer action `SET_PENDING_REFERENCE`(payload `{ urls: string[]; sourceGenerationId: string | null }`)与 `CLEAR_PENDING_REFERENCE`。`SET_OUTPUT_TYPE` 不清除该字段(跨模式要带过去)。
- 步骤:1) 在 `StudioFormState` interface 加两个 optional 字段(只加 optional,遵 types 向后兼容);2) `initialState`/`initFormState` 给默认值 `undefined`/`[]`;3) 加 action union 成员 + reducer case;4) 不动 `useUnifiedGenerate` 的现有行为,仅暴露字段。
- 验收:`studio-context.test.tsx` 新增用例:dispatch `SET_PENDING_REFERENCE` 后 state 含 urls+sourceGenerationId;随后 `SET_OUTPUT_TYPE` 切到 video 字段仍在;`CLEAR_PENDING_REFERENCE` 清空。现有 47 处消费方编译通过。
- 验证:`npx vitest run src/contexts/studio-context.test.tsx --reporter=verbose`;后台 `npx tsc --noEmit`(显式捕获 exit code)
- 不做:不改 generate payload(IMG-1C 做);不动 video 生成逻辑
- 依赖:无

### [IMG-1B] GenerationPreview/StudioCanvas 增"转视频"与"存 StyleCard"两个出口

- 读先:`src/components/business/studio/GenerationPreview.tsx`(`renderTools` L389、mobile peek row L466)、`src/components/business/studio-shared/chrome/StudioCanvas.tsx`(`handleRemix`/`handleSaveRecipe`/`handleUseAsReference`)、`src/constants/reference-image-capabilities.ts`、`src/messages/{en,ja,zh}.json`(StudioV3 命名空间)
- 改什么:GenerationPreview 新增两个可选 prop `onConvertToVideo?: (gen) => void`、`onSaveStyleCard?: (gen) => void`,在 `renderTools` 与 mobile drawer 各加一个 `CanvasToolButton`(仅 `outputType==='IMAGE'` 显示)。StudioCanvas 实现 handler:`handleConvertToVideo` → `dispatch SET_PENDING_REFERENCE {urls:[gen.url], sourceGenerationId: gen.id}` + `dispatch SET_OUTPUT_TYPE 'video'` + 选默认 Seedance reference option;`handleSaveStyleCard` → 打开 StyleCard 保存流程(IMG-4 提供的 dialog/路由,先占位调用)。
- 步骤:1) i18n 三文件加 `toolConvertToVideo`/`toolSaveStyleCard`(en/ja/zh 同步);2) GenerationPreview 加 prop + 按钮(icon 用 `Film`/`Palette`,复用 CanvasToolButton);3) StudioCanvas 写两个 handler 并传入;4) `handleConvertToVideo` 切 video 后需把 pendingReferenceImages 注入 `useImageUpload`(调 `imageUpload.addFromUrl`)——读 IMG-3 后的 role-aware 入口,默认 role `subject`。
- 验收:图片结果上出现"转视频"/"存画风卡"按钮(仅 IMAGE);点"转视频"切到 video 模式且参考图带 `subject` role 出现在 ref 列表,sourceGenerationId 落入 state;video/audio 结果不显示这两个按钮;mobile drawer 同步。
- 验证:`npx vitest run src/components/business/studio/GenerationPreview` + StudioCanvas 相关测试;`npm run lint && npm run build`(dev server 在跑时勿并行);`npx playwright test e2e/visual.spec.ts`(有意改动则 `--update-snapshots` 并点名快照) + `e2e/mobile.spec.ts` + 44px 触达区断言
- 不做:不实现 StyleCard 保存后端(IMG-4);不改 generate payload
- 依赖:IMG-1A;按钮 role 注入依赖 IMG-3(可先用无 role 占位,IMG-3 落地后补)
- **范围澄清(见 conflicts)**:本包只做"结果去向 = 携带语义参考切到视频模式的 UI/context 载体"(不触发视频执行)。视频实际生成走通要等 DIR-DATA 阶段 Seedance reference 执行链就绪,**执行验收留给 DIR-DATA 阶段**,避免与 mainline 顺序倒挂。

### [IMG-1C] generate payload 透传 sourceGenerationId 作 lineage

- 读先:`src/types/index.ts`(StudioGenerateSchema L3297、Generation lineage 相关字段)、`src/app/api/studio/generate/route.ts`、`src/hooks/use-unified-generate.ts`、`src/services/image/generate-image.service.ts`(高危·只向后兼容)、`docs/integrations/providers.md`
- 改什么:`StudioGenerateSchema` 增 optional `sourceGenerationId: z.string().optional()`(`.safeParse` 校验)。route 把它透传给 service,落到 Generation 的 lineage(与全局"clip 归档 lineage"决策对齐——此处只为图片→视频溯源预留,不强制必填)。
- 步骤:1) schema 加 optional 字段;2) route 解析后入 service 入参(service 只加 optional 参数,不破坏现有签名);3) 写入 generation 记录的 lineage/metadata 字段(若 Prisma 无现成列则存入 snapshot/metadata JSON,不改 schema)。
- 验收:route.test 覆盖 auth(401)→validation(400 非法 sourceGenerationId)→service mock→success(带 sourceGenerationId)→error(500);不传该字段时行为与现状完全一致。
- 验证:`npx vitest run src/app/api/studio/generate/route.test.ts --reporter=verbose`;后台 `tsc --noEmit`
- 不做:不改 provider payload/endpoint(纯内部 lineage);不动 credit
- 依赖:IMG-1A

### [IMG-2] 扩 ReferenceImageEntry 加语义角色 role(schema 地基)

- 读先:`src/hooks/use-image-upload.ts`(`ReferenceImageEntry` L28、`addReferenceImage` L149、`addFromUrl` L182、`setMaxImages` L124、`removeReferenceImage` L166)、`src/hooks/use-image-upload.test.ts`、`src/constants/reference-image-capabilities.ts`(`ReferenceSlotRole` L34、`ReferenceImageCapability` L55)
- 改什么:`ReferenceImageEntry` 增字段 `role: ReferenceSlotRole`(默认 `'general'`)。`addReferenceImage`/`addFromUrl` 增 **optional** `role?: ReferenceSlotRole` 参数(默认取当前能力 `defaultRole`,无能力时 `'general'`)。新增 `setReferenceRole(index, role)`。`setMaxImages` 升级为 `setCapability(cap: ReferenceImageCapability)`(或保留 setMaxImages 并新增 setDefaultRole)——以能力对象驱动 defaultRole + max,**保持 setMaxImages 向后兼容签名**。
- 步骤:1) entry 加 role 字段 + computeDisabledReason 不变;2) add\* 接受 role;3) 加 setReferenceRole;4) 暴露当前 defaultRole;5) 更新 `UseImageUploadReturn` 接口。
- 验收:`use-image-upload.test.ts` 新增:add 不传 role → 取 defaultRole;add 传 'subject' → entry.role==='subject';setReferenceRole 改单个 entry;model 切换重算 max 不丢 role。无 role 调用方编译通过(默认值兜底)。
- 验证:`npx vitest run src/hooks/use-image-upload.test.ts --reporter=verbose`;后台 `tsc --noEmit`
- 不做:不改 UI(IMG-3);不改 generate payload role 透传(IMG-3 内);不引入 'slotted' first/last_frame(视频第二期)
- 依赖:无

### [IMG-3] 参考图 UI 加角色选择 + 按 provider 能力降级 + payload 透传

- 读先:`src/components/ui/reference-image-section.tsx`、`src/components/business/studio/ReferenceImageChip.tsx`、`src/components/business/ImageAttachmentPreviewStrip.tsx`、`src/components/business/studio/StudioDockPanelArea.tsx`(L148-168 能力计算+setMaxImages)、`src/constants/reference-image-capabilities.ts`、`src/types/index.ts`(StudioGenerateSchema referenceImages L3315)、`src/messages/{en,ja,zh}.json`、`docs/integrations/providers.md`(**前置:按官方复核 Seedance/Kling/Veo reference 字段语义**)
- 改什么:① 缩略图加 role 标签/下拉(角色/风格/构图 → 映射 ReferenceSlotRole `subject`/`style`/`general`);② 当能力 `kind==='none'` 隐藏角色 UI、`kind==='flexible'` 用 defaultRole 预选、未来 `slotted` 留接口;③ 当所选 model 不支持某 role(provider 能力不足)做**降级**:role 退回 `general` 或标记 disabled,不静默丢弃;④ generate payload:`referenceImages` 升级为可带 role 的结构 `Array<{url; role}>`(新增 **optional** `referenceEntries` 字段,保留旧 `referenceImages: string[]` 向后兼容;server 优先读 referenceEntries)。
- 步骤:1) **先读 providers.md 并按官方文档复核**每个 reference 模型实际接受的 role 字段(Seedance `subject` via image_urls、Kling `reference_image_urls`、Veo subject/scene)——不确定就停下 surface;2) reference-image-section 加 role 控件 + 三语文案;3) StudioDockPanelArea 把 `referenceCapability.defaultRole` 灌给 useImageUpload;4) StudioGenerateSchema 加 `referenceEntries: z.array(z.object({url:z.string(), role:z.enum([...ReferenceSlotRole])})).optional()`(`.safeParse`);5) use-unified-generate / generate route 组装 referenceEntries;6) compileRecipe 与 worker 按能力把 role 映射到 provider 字段,降级在 service 层完成。
- 验收:image 模式选 Seedance reference 时缩略图可选角色;切到不支持 role 的 model 时角色降级为 general 并提示(不丢图);payload 含 referenceEntries 且 role 正确;旧调用方只传 referenceImages 仍工作;providers 复核结论写进 PR 描述。
- 验证:`npx vitest run`(use-image-upload + reference-image-section + generate route)`--reporter=verbose`;`npm run lint && npm run build`;`npx playwright test e2e/visual.spec.ts e2e/mobile.spec.ts` + 44px 触达区断言
- 不做:不实现 video first/last_frame slotted(第二期);不改 credit;provider 字段无官方确认不写死
- 依赖:IMG-2
- **gap 提醒(见 gaps)**:本包必须覆盖 **role → provider payload** 端到端(Seedance `image_urls` 的 subject/style 语义),否则语义角色只是装饰。步骤 6(compileRecipe / worker 把 role 映射到 provider 字段)是验收硬项,不能只做 UI 选择器。

### [IMG-4] StyleCard modelId 软解耦:compileRecipe 缺模型回退不抛错 + 松绑二选一

- 读先:`src/services/kernel/card-recipe-compiler.service.ts`(`compileRecipe` L331、`MISSING_MODEL_IN_STYLE` L350)、`src/services/cards/style-card.service.ts`、`src/types/index.ts`(StudioGenerateSchema refine L3329-3334)、`src/app/api/studio/generate/route.ts`、`src/hooks/use-studio-generate.ts`、`src/components/business/studio/StudioDockPanelArea.tsx`(L148-156 model 归属)
- 改什么:① `compileRecipe`:styleCard 缺 modelId/adapterType 时**不再 throw**,回退到「调用方传入的 model」或全局默认(FAL),把 styleCard.modelId 降为**推荐**;② 松绑 `StudioGenerateSchema` 的"不能同时传 modelId 和 styleCardId"refine —— 允许同时传(modelId 优先生效,styleCard 出 prompt/loras/style),保留"至少一个"refine;③ compileRecipe 入参增 optional `fallbackModelId`/`fallbackAdapterType`。
- 步骤:1) **先读 providers.md** 确认 fallback 默认 model/adapter 合法;2) 改 compileRecipe:modelId 解析顺序 = styleCard.modelId(推荐) → 调用方 override → 全局默认,缺则回退不抛;3) 删/改 L3332 的互斥 refine 为"同时传时 modelId 优先"语义并加注释;4) route 把用户选的 modelId 作为 override 传入 compileRecipe;5) 失败大声暴露:回退发生时 logger.info 记录"styleCard model 缺失,已回退到 X"。
- 验收:compiler.test 新增:styleCard 无 modelId 时不抛、用 fallback 编译成功;同时传 modelId+styleCardId 时 modelId 生效、styleCard 仍贡献 prompt/loras;只传 styleCardId 且 card 有 model 时行为不变。route.test 覆盖新校验。
- 验证:`npx vitest run src/services/kernel src/app/api/studio/generate --reporter=verbose`;后台 `tsc --noEmit`
- 不做:不实现贴合检查(IMG-5);不改 StyleCard 存储 schema;不动 quick-mode 不读卡逻辑(IMG-6)
- 依赖:无(IMG-1B 的存卡按钮调用其保存流程,但本包不含保存 UI)
- **行为级变更告警(见 conflicts)**:`compileRecipe` 从"缺 model 抛错"改成"缺 model 回退推荐",会改变现有 card-mode 调用方运行时行为(原本必抛错路径现在静默走 fallback FAL)。这是行为级而非纯加列变更,**必须在本包显式覆盖测试**所有 compileRecipe 调用方能接受回退而非报错,不能当作纯松绑。

### [IMG-5] StyleCard 先严格:风格贴合检查(复用 character-scoring 模式)

- 读先:`src/services/cards/character-scoring.service.ts`(`scoreConsistency` L71、`ScoreResponseSchema` L45)、`src/services/cards/style-card.service.ts`、`src/types/index.ts`(`ConsistencyScoreResult`、StyleAttributesSchema L3076)、`src/services/llm-text.service.ts`、`docs/domains/cards.md`、`src/messages/{en,ja,zh}.json`
- 改什么:新增 `src/services/cards/style-scoring.service.ts`(首行 `import 'server-only'`):`scoreStyleAdherence(clerkId, styleCard.sourceImageUrl, generatedImageUrl)`,复用 `scoreConsistency` 的双图 LLM 模式,但 system prompt 聚焦风格维度(art style/medium/color palette/brushwork/mood),返回 Zod 校验的 `StyleAdherenceResult{overallScore,breakdown:{artStyle,colorPalette,brushwork,composition,mood},suggestions}`。用 `llm-output-validator` 校验 LLM 输出。
- 步骤:1) 定义 `StyleAdherenceResultSchema`(types,Zod-first `.safeParse`)+ `z.infer`;2) 写 service,system prompt 参照 character-scoring 但换风格维度;3) 解析 LLM JSON 失败回 DEFAULT(50 分 + 提示);4) 暴露 API route `POST /api/cards/style/[id]/score`(auth→Zod→service 三件事)供卡用后核实贴合;5) 不静默吞错——LLM 失败 logger.warn 并返回明确状态。
- 验收:service.test:合法双图返回 0-100 分 + breakdown;LLM 返回非法 JSON 走 DEFAULT_SCORE;越权(非本人卡)抛错。route.test:401/400/mock/success/500 全覆盖。
- 验证:`npx vitest run src/services/cards/style-scoring.service.test.ts src/app/api/cards/style --reporter=verbose`;后台 `tsc --noEmit`
- 不做:不做 UI 展示评分(后续 UI 包);不阻断生成(贴合检查是提示不硬门控,与声音 copyRisk 同哲学)
- 依赖:无
- **gap 填补(见 gaps)**:这正是锁定方向"StyleCard 先严格(贴合检查)"的落点,确认严格侧贴合检查由本包承接(service + LLM style system prompt),不遗漏。

### [IMG-6] 补 quick mode 完全不读 StyleCard 的缺口 + "用卡模型 vs 用我选的"显式开关

- 读先:`src/components/business/studio/StudioDockPanelArea.tsx`(L139-168 quick/card 路由)、`src/hooks/use-studio-generate.ts`、`src/app/api/studio/generate/route.ts`、`src/contexts/studio-context.tsx`(workflowMode L101/L419、styleCard 选择)、`src/components/business/studio/StudioCardSection.tsx`、`src/messages/{en,ja,zh}.json`
- 改什么:① 明确契约:`workflowMode==='quick'` 时生成**完全不传 styleCardId**(只用用户选的 modelId + 手填 prompt/refs),即便 UI 上有选中的 styleCard 也忽略其 model/params;② card 模式下当用户**额外选了 model**,提供显式二选一"用卡模型 / 用我选的模型"(承 IMG-4 的软解耦),默认"用卡模型(推荐)"。
- 步骤:1) 审 use-studio-generate / generate 调用处,quick 模式下断言 payload 无 styleCardId(若现状已如此则补测固化);2) card 模式加一个小 toggle/segmented(承 IMG-4 允许同时传 modelId+styleCardId 的能力);3) 三语文案;4) toggle 状态进 FormState(optional 字段 `styleCardModelOverride?: boolean`)。
- 验收:quick 模式 generate payload 永不含 styleCardId(测试固化);card 模式默认用卡 model,切到"用我选的"后 payload 同时带 modelId+styleCardId 且 modelId 生效;toggle 在 quick 模式隐藏。
- 验证:`npx vitest run src/hooks/use-studio-generate src/app/api/studio/generate --reporter=verbose`;`npm run lint && npm run build`;`npx playwright test e2e/mobile.spec.ts`
- 不做:不重写 workflowMode 切换语义;不动 credit
- 依赖:IMG-4(软解耦能力)

### [IMG-7] decompose 双实现归一(消除内联面板 vs 独立页重复)

- 读先:`src/components/business/LayerDecomposePanel.tsx`、`src/hooks/use-layer-decompose.ts`、`src/services/image/image-decompose.service.ts`、`src/app/[locale]/(main)/studio/edit/decompose/page.tsx`、`src/components/business/studio/edit/tasks/DecomposeTaskPage.tsx`、`src/constants/edit-tasks.ts`(decompose L156)、`src/components/business/studio/ReferenceImageChip.tsx`(L81 入口)、`src/components/business/studio/StudioDockPanelArea.tsx`(L289-304)、`docs/integrations/providers.md`(see-through 模型复核)
- 改什么:选定**一套**底层实现(决策点:两者 service 是否同源——`use-layer-decompose` vs edit route 的 `xiuruisu/see-through`)。方向:重编辑留独立页(IMG-8),故 decompose 作为"重编辑"**保留独立页 DecomposeTaskPage**,**移除内联 LayerDecomposePanel** 这一重复实现(及其 dock 面板挂载与 ReferenceImageChip 入口),改为内联入口跳转到 edit/decompose 页;若需要"分层结果→加为参考"的快捷,保留该回调但指向统一 service。
- 步骤:1) **先 grep** `LayerDecomposePanel`/`use-layer-decompose` 全部引用确认影响面;2) 确认两条路径 service 是否一致,不一致则统一到 edit route 的 service(避免双维护);3) 移除 `StudioDockPanelArea` 的 layerDecompose 面板 + `ReferenceImageChip` 的 `handleRequestLayerDecompose`,替换为跳转 `/studio/edit/decompose`;4) 清理 `state.panels.layerDecompose`(若无其它引用则从 PanelName 移除——按 contexts/CLAUDE.md 改 union);5) 删除 orphan(LayerDecomposePanel.tsx 仅在被本次改动孤立时删,并清其 import)。
- 验收:项目只剩一个 decompose 实现路径;ReferenceImageChip 入口跳转到独立页;无悬空 import/未用 PanelName;现有"分层→加参考"功能可达(经独立页或保留回调)。
- 验证:`npx vitest run`(相关组件 + studio-context)`--reporter=verbose`;后台 `tsc --noEmit`;`npm run lint && npm run build`;`npx playwright test e2e/visual.spec.ts e2e/mobile.spec.ts`
- 不做:不改 decompose 的 provider/payload(纯去重);不删 edit/decompose 独立页
- 依赖:与 IMG-8 协同(分层收敛方向一致),建议 IMG-8 之前或同批

### [IMG-8] 编辑页分层收敛:高频轻编辑内联、重编辑留独立页

- 读先:`src/components/business/studio-shared/chrome/StudioCanvas.tsx`(`handleEdit` L240 整页跳转)、`src/components/business/studio/edit/EditTaskGrid.tsx`、`src/components/business/studio/edit/EditResultActions.tsx`、`src/constants/edit-tasks.ts`(EDIT_TASKS)、`src/contexts/image-edit-context.tsx`(`setSourceFromGeneration` L195、EditTaskKind L50)、`src/components/business/studio/StudioDockPanelArea.tsx`(面板挂载模式)、`docs/domains/studio.md`、`src/messages/{en,ja,zh}.json`
- 改什么:把 **upscale / remove-background / inpaint** 三个高频轻编辑做成**画布内联面板**(复用 ResponsiveDialog + image-edit-context 的 setSourceFromGeneration),从 GenerationPreview 工具栏直达,不整页跳转;**重编辑(outpaint/object-replace/style-transfer/text-render/extract-element/decompose)继续走独立 `/studio/edit/<task>` 页**。GenerationPreview 的 onEdit 拆为"轻编辑(内联)"与"更多编辑(跳独立页)"。
- 步骤:1) 在 `EDIT_TASKS` 或新常量标注每个 task 的 `surface: 'inline' | 'page'`(upscale/remove-bg/inpaint = inline);2) 新增内联编辑面板组件(挂在 StudioDockPanelArea,新 PanelName,承 contexts/CLAUDE.md 加 union + initialPanels),内部复用现有 task 表单组件,source 来自当前 generation 经 `setSourceFromGeneration`;3) GenerationPreview 工具栏:轻编辑按钮打开内联面板,"更多编辑"按钮跳独立页;4) 三语文案;5) 内联结果复用 EditResultActions 行为。
- 验收:图片结果点 upscale/remove-bg/inpaint 在画布内联完成不跳页且保留画布上下文;点"更多编辑"进独立 grid;重编辑 6 项仍走独立页;移动端轻编辑面板可用且触达区≥44px。
- 验证:`npx vitest run`(新内联面板 + image-edit-context + GenerationPreview)`--reporter=verbose`;后台 `tsc --noEmit`;`npm run lint && npm run build`;`npx playwright test e2e/visual.spec.ts e2e/mobile.spec.ts` + 44px 触达区 + role/断点 `toHaveCSS`/`getByRole` 断言
- 不做:不重写 image-edit-context 的 source 加载链;不改 edit 后端 route/provider;不动 credit
- 依赖:IMG-7(decompose 已归一为独立页,避免内联/页面再冲突)

---

## 【VOICE · P2 声音】任务包

> 阶段:**声音(mainline 第 2 阶段:图片→声音→视频→资源→Gallery→3D 冻结)**
> 执行顺序建议:VOICE-1(护栏 schema)→ VOICE-2(克隆入口接线)→ VOICE-3(VoiceCard tab)→ VOICE-4(软引用)与 VOICE-5(砍 f5tts 占位)与 VOICE-6(reference 生命周期)可并行 → VOICE-7(豆包 planner,常量+capability)→ VOICE-8(planner 路由/UI/i18n)。

### [VOICE-1] 克隆授权声明 schema + copyRisk 提示常量(仅提示不硬门控)

- 读先:`src/constants/voice-cards.ts`、`src/types/index.ts`(4050-4110 VoiceCard 段、检索 `voiceClone` 无)、`src/app/api/voices/route.ts`
- 改什么:
  - 在 `src/constants/voice-cards.ts` 新增 `VOICE_CLONE_CONSENT`(如 `{ REQUIRED: true }` 不要硬编码裸字符串)+ `VOICE_CLONE_COPY_RISK = ['low','medium','high'] as const` + `VoiceCloneCopyRisk` 类型(对齐 script-breakdown 的 `SCRIPT_BREAKDOWN_COPY_RISKS` 写法,复用既有 low/medium/high)。明确 copyRisk **仅 UI 提示**,不参与服务端拒绝。
  - 在 `src/types/index.ts` voice 段新增 `VoiceCloneConsentSchema`(zod):`consentAuthorized: z.literal(true)`(确认勾选才合法)+ `copyRisk: z.enum(VOICE_CLONE_COPY_RISK).optional()`,导出 `z.infer` 类型。不要用 `any`。
- 步骤:
  1. 加常量 + 类型(SCREAMING_SNAKE 命名)。
  2. 加 zod schema + 类型导出,与现有 VoiceCard schema 同段落。
  3. 新增/更新 schema 单测(`src/types/voice-card-schema.test.ts`):`consentAuthorized:true` 通过、`false`/缺失 `.safeParse` 失败、copyRisk 枚举越界失败。
- 验收:`VoiceCloneConsentSchema.safeParse({consentAuthorized:false})` success=false;`true` 且无 copyRisk success=true。常量无裸字符串散落。
- 验证:`npx vitest run src/types/voice-card-schema.test.ts src/constants --reporter=verbose`
- 不做:不改克隆 route 行为(VOICE-2 做)、不改 UI、不动 copyRisk 进 DB。
- 依赖:无

### [VOICE-2] 克隆入口接授权确认(/api/voices POST + VoiceTrainer 勾选)

- 读先:`src/app/api/voices/route.ts`(POST 90-213)、`src/components/business/studio/VoiceTrainer.tsx`、`src/lib/api-client/voices.ts`(createVoiceAPI 83)、`src/services/fish-audio-voice.service.ts`(createVoice 197)、`src/messages/en.json`(`StudioPage` 段 voiceTrain\* 键)
- 改什么:
  - `/api/voices` POST:在已有 formData 解析后,读 `consentAuthorized`(formData 字段,字符串 `'true'`)并用 VOICE-1 的 `VoiceCloneConsentSchema.safeParse` 校验;不通过返回 `{ success:false, errorCode:'VOICE_CLONE_CONSENT_REQUIRED', error }` 400。可选读 `copyRisk`。记录授权事实:调 `logger.info('voice clone consent recorded', { userId, copyRisk })`(失败大声暴露,不静默)。
  - `VoiceTrainer.tsx`:在 Train 按钮上方加授权声明文案 + 必选 checkbox(复用现有 enhance checkbox 的 44px 触达区样式 / shadcn primitives),未勾选时 `canTrain=false`;`handletrain` 把 `consentAuthorized:'true'`(+ 可选 copyRisk select) append 进 FormData。文案走 i18n。
  - i18n 三文件 `StudioPage`:加 `voiceCloneConsentLabel` / `voiceCloneConsentHint`(en/ja/zh 同步)。
- 步骤:constants/types(已在 VOICE-1) → route 校验 → api-client(createVoiceAPI 已透传 FormData,无需改)→ component → i18n×3。
- 验收:未勾选授权时前端禁用 Train;绕过前端直 POST 无 consent → 400 `VOICE_CLONE_CONSENT_REQUIRED`;勾选后克隆成功路径不变(仍 201 + voiceCard)。
- 验证:`npx vitest run src/app/api/voices/route.test.ts src/components/business/studio/VoiceTrainer.test.tsx --reporter=verbose`;UI 包跑 `npx playwright test e2e/mobile.spec.ts --project=mobile` + 44px 触达区断言;`npm run lint && npm run build`(dev server 在跑则不并行 build)。
- 不做:不硬门控 copyRisk(high 也允许提交,仅提示);不改 Fish Audio createVoice 签名;不改非克隆的 voice-cards CRUD。
- 依赖:VOICE-1

### [VOICE-3] /cards 加 Voice tab(只读/浅管理,不套 CharacterCard 生命周期)

- 读先:`src/constants/routes.ts`(CARD_MANAGEMENT_TABS 68、cardManagementPath 81)、`src/components/business/cards/CardsPageContent.tsx`、`src/components/business/cards/SimpleCardManager.tsx`、`src/hooks/cards/use-voice-cards.ts`、`src/lib/api-client/voice-cards.ts`、`docs/domains/cards.md`(VoiceCard Boundary 段 448-456)
- 改什么:
  - `CARD_MANAGEMENT_TABS` 追加 `'voices'`(向后兼容:现有 default 'characters' 不变;`CardManagementTab` 自动扩)。
  - `CardsPageContent.tsx` 加第 4 个 `TabsTrigger`/`TabsContent value="voices"`,渲染新建/复用的轻量 VoiceCard 列表组件(展示 name/provider/voiceId/sampleText + 删除;**不做** refine/score/variant/stability,不套 CharacterCardStatus)。复用 `use-voice-cards`(已有 list/refresh),删除走 `deleteVoiceCardAPI`(api-client 已存在)——若 use-voice-cards 无 remove,按 hooks 规则加一个走 api-client 的 `remove`,不要在组件直接 fetch。
  - i18n 三文件 `StudioV2`(cardManagement 同段):加 voice tab 标签键 + 空态文案。
- 步骤:constants → hook(必要时加 remove)→ component → i18n×3 → 组件单测。
- 验收:`/cards?tab=voices` 默认选中 Voice tab;列表渲染 VoiceCard;删除后 refresh;无 refine/score 入口;移动端只读(桌面优先,移动端不强求编辑)。
- 验证:`npx vitest run src/components/business/cards --reporter=verbose`;`npm run lint && npm run build`;UI 包 playwright visual + mobile + 44px。
- 不做:不加 VoiceCard 编辑全字段表单(浅管理);不给 VoiceCard 加 status/variant/projectId;不动 Studio 内的 VoiceTrainer/VoiceSelector。
- 依赖:无(可与 VOICE-2 并行)

### [VOICE-4] CharacterCard ↔ VoiceCard 软引用(可选 defaultVoiceCardId,向后兼容)

- 读先:`prisma/schema.prisma`(model CharacterCard 552-592、model VoiceCard 402-424)、`src/types/index.ts`(CreateCharacterCardSchema 2447、Update 2483、CharacterCardRecord 字段附近 2539)、`src/services/cards/character-card.service.ts`、`src/services/cards/character-card.mapper.ts`、`docs/domains/cards.md`
- 改什么:
  - Prisma `CharacterCard` 加可选标量 `defaultVoiceCardId String?`(**软引用,不加 FK relation**,避免删 VoiceCard 级联影响 CharacterCard;与 scope「软引用可选」一致)。生成 migration。
  - `src/types/index.ts`:`CreateCharacterCardSchema`/`UpdateCharacterCardSchema` 加 `defaultVoiceCardId: z.string().trim().min(1).optional()`;`CharacterCardRecord` 加 `defaultVoiceCardId: string | null`。
  - `character-card.service.ts` create/update:透传 `defaultVoiceCardId`;写入前校验该 VoiceCard 属于同一 user 且未删(复用 voice-card.service 的 owned 查询或新增 `assertOwnedVoiceCard`)——所有权校验不可省(写路径所有权校验红线)。mapper 透传字段。
  - `src/lib/generated/prisma/**` 重新生成(prisma 高危目录,只做加字段的向后兼容生成)。
- 步骤:先 `grep -r "import.*character-card.service" src/` 确认影响面 → schema + migration → types(向后兼容,新字段 optional) → service(透传+所有权校验) → mapper → 重生成 prisma client → 单测。
- 验收:CharacterCard 可创建/更新时带 `defaultVoiceCardId`;传入他人/已删 VoiceCard → 抛所有权错误;不传时旧行为不变(字段为 null);现有 CharacterCard 读取不报错。
- 验证:`npx vitest run src/services/cards/character-card.service.test.ts src/types --reporter=verbose`;后台全量 `npx tsc --noEmit` 显式捕获 exit code(不要管道吃退出码)。
- 不做:不建双向 relation;不在 Studio/Node UI 接绑定选择器(后续 Node 域排期);不改 VoiceCard 模型本身。
- 依赖:无(独立;与 VOICE-3 互不依赖)
- **gap 填补(见 gaps)**:这正是锁定方向"CharacterCard↔VoiceCard 软引用"的唯一落点——本包覆盖 CharacterCard 加 optional `defaultVoiceCardId` 列;Node 角色绑定选择器消费明确**留后续 Node 域排期**,不在本期范围。

### [VOICE-5] 移除 fal_f5tts VoiceCard provider 占位(避免死代码)

- 读先:`src/constants/voice-cards.ts`(1-11)、`src/types/voice-card-schema.test.ts`(32 附近)、`src/services/cards/voice-card.service.ts`(validateVoiceReference 75-94)、`src/services/cards/voice-card.service.test.ts`(154、262)、`src/types/index.ts`(VOICE_CARD_PROVIDERS 消费 4052/4097)
- 改什么:
  - `VOICE_CARD_PROVIDER` 删 `FAL_F5TTS`;`VOICE_CARD_PROVIDERS` 数组移除该项(剩 FISH_AUDIO)。`VoiceCardProvider` 类型自动收窄。
  - `validateVoiceReference`:移除 `VOICE_ID_PROVIDER_MISMATCH` 分支已无第二 provider 触发场景的死路径——保留对「非 fish_audio」的防御(理论上枚举已挡住,但保留 throw 作为 defensive)。
  - 修两处测试反例(service.test 154/262、schema.test 32):改用一个明确非法的 provider 字符串经 schema 反例覆盖(zod enum 现在会直接挡掉,断言 `.safeParse` 失败),保持「非 fish_audio 被拒」语义不丢。
- 步骤:先 `grep -rn "FAL_F5TTS\|fal_f5tts" src/` 确认仅上述消费者 → 删常量 → 修 schema 反例 → 修 service 测试 → 重跑。
- 验收:grep `FAL_F5TTS` 在 `src/` 0 命中(除 git 历史);`VOICE_CARD_PROVIDERS` 仅 fish_audio;CreateVoiceCardRequestSchema 传 `provider:'fal_f5tts'` → `.safeParse` 失败;既有 fish_audio 克隆/创建不受影响。
- 验证:`npx vitest run src/types/voice-card-schema.test.ts src/services/cards/voice-card.service.test.ts src/constants --reporter=verbose`;`npx tsc --noEmit` 后台显式捕获 exit code。
- **硬约束(见 conflicts)**:**不动** `AI_MODELS.FAL_F5_TTS`(audio model)及其 `models.ts`/`audio.ts`/`asset-previews.ts`/`fal.adapter.ts`/`generate-audio.service.ts` `canSubmitAudioViaExecutionWorker` 引用——那是独立的 audio model,不在本包。`AI_MODELS.FAL_F5_TTS`(audio model)与 `VOICE_CARD_PROVIDER.FAL_F5TTS`(VoiceCard provider)是两个同名歧义对象,本包**只删 VoiceCard provider 死分支**;误删 audio model 会破坏现有 audio 生成链。如要砍该 model 需单独排期并核对 free-tier/worker 影响。
- 依赖:无

### [VOICE-6] reference audio 分三类生命周期(一次性/克隆素材/Node 上游)

- 读先:`src/services/audio-reference.service.ts`(uploadReferenceAudio JSDoc 83-110)、`src/app/api/voices/upload-reference/route.ts`、`src/services/cards/voice-card.service.ts`(createClonedVoiceCard 122:referenceAudioStorageKey 恒 null)、`prisma/schema.prisma`(VoiceCard referenceAudioUrl/referenceAudioStorageKey 410-411)、`src/services/generate-audio.service.ts`(referenceAudioUrl 用法 331-362)
- 改什么:
  - 新增常量 `AUDIO_REFERENCE_KIND = { EPHEMERAL:'ephemeral', CLONE_SOURCE:'clone_source', NODE_UPSTREAM:'node_upstream' } as const`(`src/constants/voice-cards.ts` 或 audio 专用 constants),+ 类型。明确三类语义与清理策略(一次性 = 不建 VoiceCard、可定期清;克隆素材 = 绑 VoiceCard 生命周期;Node 上游 = 随 NodeWorkflowProject)。
  - 在 `audio-reference.service.ts` 的 `uploadReferenceAudio` 返回与存储 key 前缀上体现 kind(如 `audio-references/{kind}/{userId}/...`,默认 EPHEMERAL),签名加可选 `kind` 参数(默认 EPHEMERAL,向后兼容)。upload-reference route 仍传默认 EPHEMERAL。
  - 文档:在 `docs/domains/cards.md` 的 VoiceCard / Storage 段补三类生命周期说明(中文,标识符英文)。
- 步骤:constants/types → service 加 kind 参数(向后兼容默认值)→ route 传默认 → 文档 → 单测(kind 体现在 storageKey 前缀)。
- 验收:三类常量存在且无裸字符串;uploadReferenceAudio 默认行为不变(EPHEMERAL);传入 CLONE_SOURCE/NODE_UPSTREAM 时 storageKey 前缀正确;文档明列三类清理边界。
- 验证:`npx vitest run src/services/audio-reference.service.test.ts src/constants --reporter=verbose`(若无 test 文件则新建覆盖 kind 前缀)。
- 不做:不写定时清理 job(仅定义生命周期契约);不改 Fish Audio 侧素材存储;不强制 createClonedVoiceCard 回写 referenceAudioStorageKey(可在文档标记为 follow-up)。
- 依赖:无

### [VOICE-7] 剧本 planner 纳入 VolcEngine 豆包 — 常量 + capability(auto 仍首选 Gemini)

- 读先(**provider 编码前必读**):`docs/integrations/providers.md`(VolcEngine Ark 段 line 151、表 line 115;确认 doubao chat completions endpoint/payload/model id `doubao-1.5-pro-32k` 仍现行)、`src/constants/script-breakdown.ts`(19-72)、`src/constants/llm-capability.ts`(ADAPTER_CAPABILITIES 9-20)、`src/services/llm-text.service.ts`(volcengineTextCompletion 540、LLM_TEXT_MODELS 99)、`src/constants/config.ts`(LLM_TEXT_MODEL_IDS 405)
- 改什么:
  - **前置步骤(显式)**:按 `docs/integrations/providers.md` VolcEngine Ark 官方文档复核 doubao 文本补全 endpoint / model id / 鉴权,确认与 llm-text.service `volcengineTextCompletion` 一致;不一致先停下 surface,不改编码。
  - `script-breakdown.ts`:`SCRIPT_PLANNER_PROVIDER_IDS` 加 `volcengine:'volcengine'`;`SCRIPT_PLANNER_PROVIDERS` 加之;`SCRIPT_PLANNER_MODELS` 加 `volcengine: { modelId: LLM_TEXT_MODEL_IDS.VOLCENGINE_DOUBAO_1_5_PRO_32K, adapterType: AI_ADAPTER_TYPES.VOLCENGINE, label:'VolcEngine' }`;`SCRIPT_PLANNER_MODEL_OPTIONS` 追加 volcengine 项(排在末尾,保证 auto 仍 Gemini 优先)。
  - `src/constants/llm-capability.ts`:`VOLCENGINE` 的能力数组从 `['enhance']` 改为 `['enhance','planner']`(这是 VolcEngine 进 planner 选择器的关键开关)。
- 步骤:providers.md 复核 → script-breakdown 常量 → llm-capability → 常量单测。
- 验收:`getLLMCapabilityScope('planner')` 含 VOLCENGINE;`SCRIPT_PLANNER_MODELS.volcengine` 存在;`ScriptPlannerConcreteProvider` 含 'volcengine';auto 顺序 Gemini 仍第一(VOICE-8 验证路由)。
- 验证:`npx vitest run src/constants --reporter=verbose`;`npx tsc --noEmit` 后台显式捕获 exit code。
- 不做:不改 llm-text.service 的 volcengine 实现(已存在);不改 enhance/assistant scope;不动其它 provider 顺序。
- 依赖:无(但 VOICE-8 依赖本包)

### [VOICE-8] planner 路由 auto 分支 + 选择器 + i18n 接 VolcEngine

- 读先:`src/services/kernel/node-planner-route.service.ts`(resolveNodePlannerRoute 84、auto providerOrder 120、apiKeyId 校验 95-99)、`src/components/business/node/CanvasPlannerRouteSelector.tsx`(getPlannerProviderForAdapter 33、getPlannerSetupLabelKey 48)、`src/hooks/use-llm-route-picker.ts`(getRegistryEntry planner 40)、`src/messages/en.json`(`StudioNode.plannerRoute` 3014、顶层 provider label 18)、`docs/integrations/providers.md`
- 改什么:
  - `node-planner-route.service.ts`:auto `providerOrder` 末尾加 `SCRIPT_PLANNER_PROVIDER_IDS.volcengine`(**Gemini 仍首位,不得插到 gemini 之前**);apiKeyId 路径的 adapter 白名单(97-99 `if` 与 106-111 providerEntry 三元)加 `AI_ADAPTER_TYPES.VOLCENGINE → SCRIPT_PLANNER_MODELS.volcengine`,并更新「请添加 …key」错误文案含 VolcEngine。
  - `CanvasPlannerRouteSelector.tsx`:`getPlannerProviderForAdapter` 加 `case VOLCENGINE → SCRIPT_PLANNER_PROVIDER_IDS.volcengine`;`getPlannerSetupLabelKey` 加 VolcEngine 分支(返回新 i18n key,如 `'setupVolcengine'`)。
  - i18n 三文件:`StudioNode.plannerRoute` 加 `setupVolcengine:'VolcEngine'`(en/ja/zh);确认顶层 provider label `volcengine` 已存在(en.json:18,三文件齐)。
- 步骤:providers.md 复核(同 VOICE-7 前置)→ service auto+apiKeyId 分支 → selector 两函数 → i18n×3 → service/component 单测。
- 验收:用户仅有 VolcEngine key 时 planner 选择器列出 VolcEngine 并可选;`resolveNodePlannerRoute(userId,'volcengine',keyId)` 返回 doubao route;auto 在仅 VolcEngine key 场景能回退到 VolcEngine、有 Gemini 时仍选 Gemini;无任何 key 的错误文案提及 VolcEngine。
- 验证:`npx vitest run src/services/kernel/node-planner-route.service.test.ts src/components/business/node --reporter=verbose`(无 test 文件则新建覆盖 auto 顺序 + volcengine 分支);`/i18n-check` 或 i18n 三文件键一致性;`npm run lint && npm run build`。
- 不做:不改 enhance/assistant 路由;不改 Gemini auto 优先级;不引入 VolcEngine 平台 system key 强依赖(沿用现有 getSystemApiKey 行为)。
- 依赖:VOICE-7
- **半成品风险(见 conflicts)**:本包必须**同时**改 capability(VOICE-7)+ providerOrder + CanvasPlannerRouteSelector 的 switch + i18n 三语 setupVolcengine,缺一即半成品(UI default 回 gemini 与新 provider 不一致)。

---

## DIR-DATA · P3 视频(数据 + 执行)任务包

> 阶段:**P3 视频(图片→声音→视频→资源→Gallery→3D 冻结 中的「视频」段,数据/执行层)**
> 执行顺序锁定:DIR-DATA-01(契约)→ 02(planner 服务)→ 03(模型解析)→ 04(X-SCHEMA 高危迁移,独立 PR)→ 05(中间镜头 lineage 落库)→ 06(X-KEY BYOK 收敛)→ 07(X-PROV 官方复核,无代码改动前置)。X-PROV(07)是 02/04/05/06 中任何触碰 payload/endpoint/token/价格步骤的**显式前置门**。

### [DIR-DATA-07] X-PROV:Seedance/Kling via fal 官方复核(无代码改动,所有 payload 包的前置门)

- 读先:`docs/integrations/providers.md`(尤其 L96-103 未迁移 scope、L120-142 Connection Matrix + Official Docs Checked、L188-201 Unresolved)、`src/constants/models/video.ts`(KLING_V3_PRO/SEEDANCE_20_REFERENCE/SEEDANCE_20_FAST_REFERENCE 三块 + videoExtension)、`src/services/providers/fal/video-request-builders.ts`(buildKlingV3Pro/buildSeedanceReference/promptReferencesAudio/buildAudioReferencePrefix)
- 改什么:**只更新 `docs/integrations/providers.md` 的 durable facts + 在相关 model-config 注释里标注复核日期**,不改执行代码。要逐项对照官方 fal 模型页核实:
  1. Seedance 2.0 Reference / Fast Reference:`image_urls`(上限张数 + 单文件大小)、`video_urls`(上限 + 时长/大小)、`audio_urls`(上限 + 合并时长/大小)、跨模态总文件 cap(当前代码假设 ≤12,builders.ts:449)、duration 是否真支持 `'auto'` 字面量(builders.ts:324)、resolution 枚举(480/720/1080 vs fast 480/720)、`generate_audio` 字段名、`@AudioN`/`@VideoN` token 是否大小写敏感且 1-9(builders.ts:365-368)。
  2. Kling V3 Pro:t2v/i2v endpoint id、duration clamp(当前 3-15,builders.ts:227)、aspect_ratio 枚举、`generate_audio`/`cfg_scale`/`negative_prompt` 字段、**extend-video endpoint** `fal-ai/kling-video/v3/pro/extend-video`(video.ts:35)是否仍未在官方文档暴露(providers.md L140 已记此条 unresolved)。
  3. 价格单位:确认三模型 `cost` 仅为平台 allowance 单位,非 provider 计费真值(providers.md L197),记录任何已知 fal 计费倍率(如 Seedance Reference video 参考 0.6x,builders.ts:58 注释)。
  4. Ark(VolcEngine Seedance)/ Gemini(Veo)直连:**明确标注列为后续独立包,本期不实现**(方向锁定)。
- 步骤:① 逐个打开 video.ts 里三模型的 `officialUrl`;② 对每个字段在 providers.md「Official Docs Checked」追加一行复核日期 + 链接;③ 把代码假设与官方不符之处写成「待修正清单」交给 02/05/06 对应步骤;④ extend-video 不确定时保持现状并在文档点名「local model-config fact, not verified provider fact」,并**显式记录第一期不启用 extend、长视频第二期再验证**(见 gaps)。
- 验收:providers.md 的 Seedance/Kling 行带本期复核日期;若发现 cap/字段/枚举与 builders.ts 不符,产出明确「字段→当前值→官方值→影响包」对照表;extend-video 状态显式记录。
- 验证:无需跑命令(纯文档);若顺手修了文档错别字以外内容则不允许(out-of-scope)。
- 不做:不改 video-request-builders.ts、不改 model 配置执行字段、不碰 Ark/Gemini 直连。
- 依赖:无(最先可做,作为其它 payload 包前置)

### [DIR-DATA-01] 统一 ScriptDoc/Scene/Shot/ShotPlan Zod 契约(先 JSON 不进 Prisma)

- 读先:`src/types/video-script.ts`、`src/types/script-breakdown.ts`、`src/types/seedance-prompt-plan.ts`、`src/constants/video-script.ts`(CAMERA_SHOTS/SCENE_DURATION_RANGE/TRANSITIONS)、`src/types/node-workflow.ts`(L31-38 import、L170-176 NodeWorkflowNodeData 引用 breakdown/seedancePromptPlan/timeline)
- 改什么:新建 `src/types/script-doc.ts`(**新文件,不动 video-script.ts 高危体系,避免 333-文件级联**)。定义骨架级统一契约 Zod schema + `z.infer` 类型:
  - `ShotTypeSchema`:新枚举 `SHOT_TYPES`(放 `src/constants/script-doc.ts` 新常量,No 魔法值)。值取自现有 CAMERA_SHOTS 语义但区分「景别 shotType」与「机位 camera 自由文本」。
  - `ShotStatusSchema`:`SHOT_STATUSES`(idle/approved/retrying/regenerating/done/failed),支撑逐镜 approve/retry/regenerate。
  - `DialogueSchema`(**全部 optional 预留**):`{ speakerRoleId: string, line: string, emotion?: string, pace?: string }`,台词原文存 `line`,结构字段预留。
  - `ShotSchema`:`{ id, sceneId, shotType: ShotType, camera: string, action: string, durationSec: number(min/max 用常量,第一期每镜 4-15s), dialogue?: Dialogue, status: ShotStatus, characterRoleIds?: string[], backgroundRoleId?: string, maxReferences?: number }`。
  - `SceneSchema`:`{ id, orderIndex, summary, location?, timeOfDay?, mood?, shots: Shot[] }`。
  - `ScriptDocSchema`:`{ version: literal, title, logline?, copyRisk, scenes: Scene[] }` + `.superRefine` 强制第一期 profile:总时长 ≤60s、scenes 展平后 shot 总数 3-6、每镜 durationSec 4-15(常量化阈值,放 `SCRIPT_DOC_PROFILE_LIMITS`)。
  - `ShotPlanSchema`:planner 编译产物(确定性,非 LLM)`{ shotId, modelId, prompt, negativePrompt?, durationSec, aspectRatio, resolution?, referenceImageRoleIds?, audioRoleIds?, videoRefShotIds? }` + `ScriptExecutionPlanSchema`(`{ shotPlans: ShotPlan[], mergeOrder: string[] }`)。
  - 写明 **JSON→Prisma 提升触发条件**(放文件顶部 JSDoc):当 (a) ScriptDoc 需跨设备/多人协作持久化,或 (b) 需服务端按 shotId 查询/统计,或 (c) 逐镜 status 需服务端事务一致性时,才提升;在此之前 ScriptDoc 作为 NodeWorkflowProject.state 内的 JSON 存活(复用现有 node-workflow 持久化)。
- 步骤:① 建 `src/constants/script-doc.ts` 常量;② 建 `src/types/script-doc.ts` schema + 类型;③ 提供从 `ScriptBreakdownResult` 与 `SeedancePromptPlanResult` → ScriptDoc 的**纯函数 adapter**(`toScriptDocFromBreakdown` / `toScriptDocFromPromptPlan`,放同文件,确定性、可单测),收敛两套旧产物;④ 写 `src/types/script-doc.test.ts`:有效/无效/边界(.safeParse),覆盖 profile 上限(7 镜应 fail、61s 应 fail、3 镜 60s 应 pass)、dialogue optional、两个 adapter 转换正确性。
- 验收:ScriptDocSchema/.safeParse 通过有效样本、拒绝超 profile 样本;两 adapter 把现有 breakdown/plan 样本转成合法 ScriptDoc;无 any、无魔法值;不修改 video-script.ts/script-breakdown.ts/seedance-prompt-plan.ts 任何导出(向后兼容)。
- 验证:`npx vitest run src/types/script-doc.test.ts --reporter=verbose`;后台 `npx tsc --noEmit`(显式捕获 exit code,勿用管道吃退出码)。
- 不做:不进 Prisma、不删旧三套 schema(灰度并行,Board 验收后再下线)、不改 node-workflow.ts 引用、不写执行逻辑。
- 依赖:无(可与 07 并行,但触碰任何字段语义前需 07 的字段事实)
- **协调说明**:本契约与 VID-UI-1 的 ScriptDoc/Shot 类型是同一锚点。两条工作流(DIR-DATA 服务端 + VID-UI 客户端)在 **Shot id 锚点**处对齐;实现时确认两侧 schema 不漂移(若仓库决定单一来源,以本文件为准并由 VID-UI 复用)。

### [DIR-DATA-02] 服务端 workflow-planner.service(吸收 orchestrator+compiler+spawnFull,纯确定性不调 LLM)

- 读先:`src/services/video-scene-orchestrator.service.ts`、`src/services/kernel/scene-prompt-compiler.service.ts`、`src/hooks/node/use-node-workflow.ts`(spawnFullWorkflowFromAgent L1246-1457、applySeedancePromptPlanToSeedance L1484-1548)、`src/types/script-doc.ts`(DIR-DATA-01 产物)、`src/services/providers/fal/video-request-builders.ts`(只读,理解 ShotPlan→fal body 边界)
- 改什么:新建 `src/services/kernel/workflow-planner.service.ts`(首行 `import 'server-only'`)。纯确定性,**禁止调用任何 LLM**(只把 LLM 用于判断型任务的硬规则;planner 是编译型)。导出:
  - `validateScriptDoc(doc: unknown): { ok: true; doc: ScriptDoc } | { ok: false; issues: ... }` —— 整图校验,复用 ScriptDocSchema.safeParse + profile superRefine,失败大声暴露(返回结构化 issues,不静默吞)。
  - `compileShotPlan(doc, ctx): ScriptExecutionPlan` —— 吸收 scene-prompt-compiler 的拼 prompt 逻辑 + spawnFullWorkflowFromAgent 的 shot→duration/绑定 翻译,逐 shot 产出 ShotPlan(prompt 块化:角色/风格/连续性/机位,沿用 compileScenePrompt 风格;duration 从 durationSec 直取不再 string 往返;按 shot.characterRoleIds/backgroundRoleId 解析参考图角色 id→URL 由调用方注入,planner 只产 role id 引用)。
  - `buildExecutionPlan(doc, ctx): ScriptExecutionPlan` —— 校验→编译→mergeOrder(纯顺序,呼应 videoMerge 锁死纯顺序拼接)。
- 步骤:① 建服务文件;② 把 scene-prompt-compiler 的块拼接抽成 planner 内部 `compileShotPrompt`(保留旧 compiler 不删,供 orchestrator 灰度并行);③ 把 spawnFullWorkflowFromAgent 的 duration/绑定/mergeOrder 决策迁成服务端纯函数(客户端 hook 暂保留,Board 验收后再切);④ 写 `workflow-planner.service.test.ts`:校验失败样本 surface issues、合法 ScriptDoc 编译出每镜一条 ShotPlan、mergeOrder 等于 shot orderIndex 顺序、durationSec 透传不丢精度、参考角色 id 正确归集、**断言不调用任何 LLM client**(mock llm-text 不被触达)。
- 验收:对 DIR-DATA-01 样本 ScriptDoc 产出确定性 ScriptExecutionPlan;非法整图返回结构化 issues 而非抛裸 Error;无 LLM 调用;无 any;旧 scene-prompt-compiler 与 orchestrator 仍可编译(并行不破)。
- 验证:`npx vitest run src/services/kernel/workflow-planner.service.test.ts --reporter=verbose`;后台 `npx tsc --noEmit`(显式 exit code)。
- 不做:不接 API route(后续 Board 包接)、不删 video-scene-orchestrator/scene-prompt-compiler、不调 LLM、不动 fal builders、不碰客户端 hook(本包只加服务端纯函数)。
- 依赖:DIR-DATA-01(契约);触碰 ShotPlan→payload 假设需 DIR-DATA-07

### [DIR-DATA-03] 模型解析:planner 优先 Seedance Reference / Fast Reference / Kling V3 Pro(全走 fal)

- 读先:`src/constants/models/video.ts`(三模型块 + qualityTier + available)、`src/constants/models.ts`(L60-74 i18n key 映射、L260-266 推荐排序 `VIDEO_*` 排序对象)、`docs/integrations/providers.md` L100(未迁移 volc 必须 unavailable)、`src/services/kernel/workflow-planner.service.ts`(DIR-DATA-02)
- 改什么:在 planner 的 ctx 模型解析里,把视频镜头默认模型解析为白名单 `[SEEDANCE_20_REFERENCE, SEEDANCE_20_FAST_REFERENCE, KLING_V3_PRO]`(质量优先 Reference,经济选 Fast Reference,补单次多镜分镜选 Kling V3 Pro),全部断言 `adapterType === FAL && available === true`。新增常量 `DIRECTOR_VIDEO_MODEL_PRIORITY`(放 `src/constants/script-doc.ts` 或 video-scene 常量,No 魔法值),并**硬排除未 worker 迁移模型**(`SEEDANCE_20_VOLC`/`SEEDANCE_20_FAST_VOLC` 等,providers.md L100)。
- 步骤:① 加优先级常量(引用 AI_MODELS enum,不裸字符串);② planner 解析函数对未在白名单/非 FAL/非 available 的镜头模型选择 fail-loud(抛 UNSUPPORTED_MODEL 语义错误,不静默降级);③ 单测:Reference 缺 reference image 时给出明确错误(对齐 video.ts requiresReferenceImage)、volc 模型被拒、Kling V3 Pro 可解析。
- 验收:planner 默认选 Reference 族;传 volc 模型被显式拒绝;白名单全部 FAL+available;无魔法值字符串模型 id。
- 验证:`npx vitest run`(planner 相关用例);后台 `npx tsc --noEmit`。
- 不做:不新增模型(三模型已 available)、不改 i18n(key 已存在)、不接直连 Ark/Veo、不动 fal builders 字段。
- 依赖:DIR-DATA-02;模型 payload 能力以 DIR-DATA-07 复核为准

### [DIR-DATA-04] X-SCHEMA:Generation 加可选 nodeWorkflowProjectId + shot 序号 lineage(高危,独立 PR)

- 读先:`prisma/schema.prisma`(Generation L204-295,NodeWorkflowProject 模型)、`src/services/generation.service.ts`(CreateGenerationInput L52-94、createGeneration L373、LIST_GENERATION_SELECT L148-184)、`src/types/index.ts`(GenerationRecord 定义,**333 文件高危**,先 grep importers)、`src/types/CLAUDE.md`(只加 optional 规则)、`memory/project-full-tsc-required.md`(全量 tsc ~4min 必须跑)
- 改什么:**仅加可选列,向后兼容**:
  - Prisma Generation 加:`nodeWorkflowProjectId String?`(+ 可选 FK 到 NodeWorkflowProject,onDelete SetNull,呼应软引用)、`shotIndex Int?`(镜序号)、`shotKind String?`(中间镜头/clip/reference 类型标记,值用枚举常量;默认 null=主 Gallery 可见,中间镜头打标后默认不进主 Gallery/Assets 视图)。加 `@@index([nodeWorkflowProjectId, shotIndex])`。
  - `CreateGenerationInput` 加对应可选字段;`createGeneration` 写入(`?? undefined` 安全)。
  - `GenerationRecord` / `LIST_GENERATION_SELECT` 加这三列(GenerationRecord 改动前先 `grep -r "import.*GenerationRecord" src/` 确认无构造点被破坏;只加 optional)。
- 步骤:① 改 schema.prisma 加列+索引;② `npx prisma migrate dev --name generation_director_lineage` 后 `npx prisma generate`(**先 migrate dry-run / 在分支上跑**);③ 更新 generation.service.ts 三处(input/create/select);④ 更新 GenerationRecord 类型 + 新建 shotKind 枚举常量(`src/constants/`);⑤ 单测:createGeneration 透传新字段、不传时为 null/undefined、LIST_GENERATION_SELECT 含新列。
- 验收:迁移可 dry-run 通过;旧调用点不传新字段仍编译/运行;新字段写读往返正确;全量 `tsc --noEmit` 绿(高危类型改动必须全量);中间镜头 shotKind 标记字段就位(供后续 Gallery 过滤)。
- 验证:`npx prisma migrate dev --name generation_director_lineage`(dry-run/分支)→ `npx prisma generate` → 后台**全量** `npx tsc --noEmit`(显式捕获 exit code,~4min 禁因超时跳过)→ `npx vitest run src/services/generation.service.test.ts --reporter=verbose`。
- 不做:不改 LIST_GENERATION_SELECT 排除重 JSON 列的策略、不一次把 lineage 设为必填(方向虽要求全量升格 lineage 必填,但本期只加可选列保向后兼容;「必填」由 DIR-DATA-05 的 service 条件校验处理)、不改 video-pipeline/旧路由。
- 依赖:无强依赖(可早做,作安全/结构补丁);但 05 依赖本包字段
- **gap 调和(见 gaps)**:锁定方向要求 lineage **必填**,但高危 Prisma 类型只能加 **optional** 列(存量历史 Generation 无 lineage,无法 NOT NULL)。调和方式:**DB 列保持 nullable**(本包)+ **service 层条件 required**(DIR-DATA-05:对"视频 clip 来源"在 createGeneration 校验层强制要求 lineage)。本包只完成 DB-optional 部分。

### [DIR-DATA-05] clip/reference 全量落 Generation + 中间镜头类型标记 + lineage 写入

- 读先:`src/services/generate-video.service.ts`(submitFalVideoWorkerRun metadata L216-224、providerInput L250-278)、`src/services/generation.service.ts`(createGeneration、DIR-DATA-04 新字段)、`src/services/video-pipeline.service.ts`(finalizePipeline L874 createGeneration 调用,作为「全量落 Generation」参照)、`src/services/video-merge.service.ts`(merge 产物当前未落 Generation,只 uploadToR2)、`src/components/business/node/StudioNodeWorkbench.tsx`(L865-899 generate 调用回填 nodeData)
- 改什么:让导演台每个 clip / reference 产物都落一条 Generation,并写 lineage(nodeWorkflowProjectId + shotIndex)与中间镜头标记:
  - generate-video.service `submitFalVideoWorkerRun` 的 metadata + 最终 createGeneration 链路:透传 `nodeWorkflowProjectId`/`shotIndex`/`shotKind`(从 GenerateVideoRequest 新增可选字段,Zod 加 optional 字段于 `src/types/index.ts` 的 GenerateVideoRequest schema,只加 optional)。
  - video-merge 产物:成片(最终镜头序列)落 `shotKind=final`(进主 Gallery),中间单镜 clip 落 `shotKind=intermediate`(默认不进主 Gallery/Assets)。merge 成片落 Generation 需新增最小服务调用(merge route 当前不落库,这里补一条 createGeneration,outputType VIDEO)。
  - 校验:写路径所有权(userId 必须匹配)、projectId 越权校验(nodeWorkflowProjectId 必须属于该 user)。
  - **lineage 条件 required(承 DIR-DATA-04 gap 调和)**:当生成来源标识为"导演台 clip/reference"时,createGeneration 校验层强制要求 lineage 字段齐全(nodeWorkflowProjectId + shotIndex),缺则 fail-loud;非导演台单生成路径(无 lineage)保持向后兼容不强制。
- 步骤:① GenerateVideoRequest 加可选 lineage 字段(Zod optional + z.infer);② generate-video.service 透传至 createGeneration;③ merge-videos route / video-merge 服务补成片+中间 clip 落库与标记;④ 单测:clip 生成落 Generation 带 shotKind+lineage、merge 成片 shotKind=final、越权 projectId 被拒、缺 lineage 时不破坏现有 Studio 单生成路径(向后兼容)、导演台来源缺 lineage 被拒。
- 验收:导演台触发的每个 clip/reference/成片都有 Generation 行;中间镜头带 intermediate 标记;lineage 字段正确;现有非导演台视频生成不受影响;失败大声暴露(越权/缺字段返回明确错误)。
- 验证:`npx vitest run`(generate-video / video-merge / generation 相关);后台 `npx tsc --noEmit`(显式 exit code)。
- 不做:不改主 Gallery 查询过滤逻辑(由 Gallery 工作流按 shotKind 过滤)、不动旧 VideoScript orchestrator 落库、provider payload 不动(沿用现有 builders)。
- 依赖:DIR-DATA-04(Generation 字段);GenerateVideoRequest 改动属高危 types,grep importers;merge 落库前确认 X-PROV(07)merge 产物字段无误

### [DIR-DATA-06] X-KEY:BYOK 先行 + 显式 BYOK 不静默回退 + merge-videos 本地 key resolver 并入中央规则

- 读先:`src/app/api/node-workflow/merge-videos/route.ts`(resolveFalKey L63-100)、`src/services/image/generate-image.service.ts`(resolveGenerationRoute L114-253,free-tier 分支 L240-253)、`src/services/apiKey.service.ts`(findActiveKeyForAdapter/getApiKeyValueById)、`src/lib/platform-keys.ts`(getSystemApiKey)、`src/services/generate-video.service.ts`(canSubmitVideoViaExecutionWorker L48-58,BYOK 判定)
- 改什么:统一 fal key 解析规则,消除 merge-videos 的分叉:
  - 抽中央 `resolveFalKeyForUser({ userId, apiKeyId, allowPlatformFallback })`(放 apiKey.service 或新 `src/services/kernel/key-resolver.service.ts`,首行 `import 'server-only'`)。规则:**显式 apiKeyId 给定时,解析失败/非 FAL → fail-loud,绝不静默回退平台 key**;未给 apiKeyId 时才按 user active key → 平台 key(且仅 `allowPlatformFallback=true`/free-tier 允许)。
  - merge-videos route 的 `resolveFalKey` 改为调用中央函数(保持 route 三件事:auth→Zod→service);保持现有错误码语义(INVALID_ROUTE_SELECTION)。
  - 契约预留未来切平台计费:在 key 解析返回里带 `routeKind: 'user-key'|'free-tier'`(对齐 resolveGenerationRoute),为未来视频成本切平台计费留字段(本期 BYOK 先行,不实装计费)。
- 步骤:① 建/扩中央 resolver;② merge route 改用之;③ 单测:显式 apiKeyId 非 FAL → 抛错不回退、显式 apiKeyId 无效 → 抛错、未给 key 有 user key → 用 user key、未给 key 无 user key 有平台 key 且允许回退 → 用平台 key、不允许回退 → 抛错;④ 确认 generate-video 主路径仍走 resolveGenerationRoute(不重复造轮子,只把 merge 这条分叉并入)。
- 验收:merge-videos 与主视频路径共用同一 BYOK 语义;显式 BYOK 永不静默落平台 key(失败大声暴露);routeKind 字段就位;现有 merge 行为对合法输入不回归。
- 验证:`npx vitest run`(merge-videos route + key-resolver 用例,覆盖 401/400/success/500 矩阵);后台 `npx tsc --noEmit`。
- 不做:不实装平台计费、不改 UI 的 key gate(缺 key 仍路由 QuickSetupDialog)、不改 execution worker key 解析(resolve-key 内部接口本期不动)、不碰 provider payload。
- 依赖:无强代码依赖(可与 04/05 并行);若改动触及 fal endpoint/token 需 DIR-DATA-07

---

## DIR-UI · P3 视频(UI)任务包

> 阶段:**视频(导演台 UI 层)**
> 执行顺序锁定:**VID-UI-1(ScriptDoc/Shot 锚点)必须最先完成并验收**,它是双向同步与所有后续包的地基。之后 Board 主视图(2/3)与 Graph 映射(4)并行,再做灰度(5)、移动端(6)、passthrough 收敛(7)、videoMerge 锁死(8)。

### [VID-UI-1] 定义 ScriptDoc / Scene / Shot 类型 + Shot id 唯一锚点(地基包)

- 读先:`src/types/video-script.ts`(VideoScriptScene 蓝本)、`src/types/script-breakdown.ts:54-71`(ShotDraftSchema)、`src/types/seedance-prompt-plan.ts:12-38`(SeedancePromptTimelineItem)、`src/constants/video-script.ts`(CAMERA_SHOTS/SCENE_DURATION_RANGE/TRANSITIONS)、`src/constants/node-types.ts:181-201`(NODE_STATUS_IDS)
- 改什么:新增 `src/types/script-doc.ts`,Zod-first 定义:`ScriptDocSchema`(id、title、targetDurationSec(≤60,呼应第一期硬上限)、scenes[]、createdAt/updatedAt)、`ScriptSceneSchema`(id、orderIndex、location/mood/timeOfDay 骨架字段、shots[])、`ShotSchema`(**id 必填且全局唯一 — 这是双向同步唯一锚点**、orderIndex、camera、action、durationSec(4–15 区间,呼应第一期每镜时长)、dialogue?(结构字段 `ShotDialogueSchema { text, speaker? }` 设为 optional 预留)、status(用新 `SHOT_STATUS` 枚举)、generationId?(升格用)、clipUrl?)。新增 `src/constants/shot-status.ts`:`SHOT_STATUS_IDS`/`SHOT_STATUSES`(draft/planned/generating/ready/approved/failed —— 选一套独立 Shot 级状态语言,不复用 NODE_STATUS 也不复用 VideoScriptSceneStatus,但写一份注释明确二者映射关系)。导出 `z.infer` 类型,严禁 any。
- 步骤:
  1. 写 `shot-status.ts` 常量(SCREAMING_SNAKE,无魔法值)。
  2. 写 `script-doc.ts` 三层 schema + 类型;Shot.id 用 `z.string().min(1)`,文档注释强调它是 Board 行与 Graph 节点的唯一对齐键。
  3. 写 `src/types/script-doc.test.ts`:有效/无效/边界 `.safeParse()`(缺 shot.id→fail;durationSec 越界→fail;dialogue 缺省→pass)。
  4. 不动 `src/types/index.ts`(避免 333-file 级联);如需被外部引用,只在 index.ts 末尾 `export * from './script-doc'`(纯新增,向后兼容)。
- 验收:`script-doc.test.ts` 全绿;ScriptDoc→Scene→Shot 可序列化为纯 JSON 且 round-trip 无损;Shot.id 强制必填(无 id 的 shot 解析失败)。
- 验证:`npx vitest run --reporter=verbose src/types/script-doc.test.ts`;后台 `tsc --noEmit` 捕获 exit code。
- 不做:不进 Prisma(决议:先 JSON);不写任何 UI;不接 LLM planner(那是 DIR-DATA 服务端)。
- 依赖:无
- **协调说明**:与 DIR-DATA-01 是同一 ScriptDoc/Shot 锚点。两条工作流在 **Shot id** 处对齐,实现时确认两侧 schema 不漂移(单一来源以先落地的为准并复用)。

### [VID-UI-2] Shot Board 主视图组件(把 ScriptEditor 升级为 ScriptDoc 编辑器)

- 读先:`src/components/business/studio/ScriptEditor.tsx`(现 scene 列表编辑全貌)、`src/components/business/studio/StudioSceneProgress.tsx`(逐镜 status badge 范式)、`src/types/script-doc.ts`(VID-UI-1 产出)、`docs/design/system/` 最新 token 现状、`src/components/business/studio/CLAUDE.md`
- 改什么:新增 `src/components/business/studio/board/ShotBoard.tsx` + `ShotCard.tsx`(单 Shot 卡:展示/编辑 camera/action/durationSec/dialogue,顶部 Shot.id + orderIndex 徽标,底部 status badge + 逐镜 approve/retry/regenerate 三按钮)。Board 渲染 ScriptDoc.scenes[].shots[],每张卡 key 用 `shot.id`。纯受控组件:props 收 `scriptDoc`、`onPatchShot(shotId, patch)`、`onApproveShot/onRetryShot/onRegenerateShot(shotId)`。复用现有 ResponsiveDialog/Button/Select/Textarea 与 status badge 视觉语言(从 StudioSceneProgress 抽样,但映射到 SHOT_STATUS)。
- 步骤:
  1. 抽 status→badge 样式映射到 `src/constants/shot-status.ts` 配套或组件常量(无 Tailwind arbitrary value,需要新色用 tailwind.config 扩展)。
  2. ShotCard:editable 字段下放,审阅三按钮(approve/retry/regenerate)触达区 ≥44px;disabled 态按 status 决定(generating 时禁编辑)。
  3. ShotBoard:按 scene 分组渲染,scene 头部显示骨架字段(location/mood)。空态/加载态/错误态齐全(呼应现有 ErrorAlert 用法)。
  4. 写 `ShotBoard.test.tsx`/`ShotCard.test.tsx`:渲染 N 个 shot、点 approve/retry/regenerate 各回调被以正确 shotId 调用、generating 态禁编辑、空 ScriptDoc 显示空态。
- 验收:给定一个 3-shot ScriptDoc 能渲染 3 张卡并按 scene 分组;三类审阅按钮回调携带正确 shot.id;status badge 颜色对应 SHOT_STATUS;键盘可达 + 44px 触达区。
- 验证:`npx vitest run --reporter=verbose src/components/business/studio/board`;`npm run lint && npm run build`;`npx playwright test e2e/mobile.spec.ts --project=mobile`(若 Board 已挂路由)+ visual 截图基线(改动需 `--update-snapshots` 并在报告点名快照)。
- 不做:不接真实生成(回调先由父组件桩接);不做 Graph 同步(VID-UI-4);不删旧 ScriptEditor(VID-UI-5 灰度期并行)。
- 依赖:VID-UI-1

### [VID-UI-3] Board 数据 hook + 逐镜审阅循环(approve/retry/regenerate)接线

- 读先:`src/hooks/use-video-script.ts`、`src/hooks/use-scene-orchestrator.ts`(现 advance/retry 范式)、`src/components/business/studio/StudioScriptPanel.tsx`(activeId 状态机 + handleSceneFeedback TODO)、`src/lib/api-client.ts`(API 封装约定)、`src/types/script-doc.ts`
- 改什么:新增 `src/hooks/use-script-doc.ts`(客户端持有 ScriptDoc JSON 状态:patchShot/approveShot/setShotStatus/setShotClip,以及与 DIR-DATA planner/generate 端点对接的 thin wrapper —— 调用全走 api-client,绝不 fetch)。新增 `src/components/business/studio/board/StudioShotBoardPanel.tsx`(取代 StudioScriptPanel 的容器角色,topic 输入→生成 ScriptDoc→ShotBoard 编辑→逐镜审阅)。
- 步骤:
  1. `use-script-doc.ts` 用 useAsyncAction 范式管理 loading/error;approve/retry/regenerate 各自落 Shot.status 转换(draft→planned→generating→ready→approved/failed),失败大声暴露(error 抛到 UI,不静默)。
  2. retry/regenerate 调 DIR-DATA 暴露的逐镜端点(若该端点尚未就绪,本包先以 `// TODO(DIR-DATA): wire <endpoint>` 标注 + 抛"未实现"显式错误,不静默 no-op —— 对齐现有 handleSceneFeedback TODO 的暴露策略,但要 surface 而非吞掉)。
  3. StudioShotBoardPanel 组合 ScriptTopicInput(复用) + ShotBoard。
  4. 写 `use-script-doc.test.ts`(mock api-client:approve 成功改 status、retry 失败置 failed 并暴露 error、regenerate 重置 shot)。
- 验收:approve 一镜后该 shot.status=approved 且持久(JSON 更新);retry 失败把 shot 置 failed 且 UI 显示错误文案;无任何吞错路径(未接端点时显式抛错可见)。
- 验证:`npx vitest run --reporter=verbose src/hooks/use-script-doc.test.ts`;后台 `tsc --noEmit` 捕获 exit code。
- 不做:不实现服务端 planner/generate(DIR-DATA);不做 Graph 双向(VID-UI-4)。
- 依赖:VID-UI-1, VID-UI-2

### [VID-UI-4] Board 行 ↔ Graph 节点 同 Shot id 双向无损同步(核心工程风险包)

- 读先:`src/hooks/node/use-node-workflow.ts:1246-1457`(spawnFullWorkflowFromAgent 现成的 shot→shotText+seedance+videoMerge 物化逻辑)、`:317-431`(createDefaultNodeData)、`src/lib/node-workflow-graph.ts`(getUpstreamNodes/harvest\*)、`src/types/node-workflow.ts:116-208`(node data schema)、`src/types/script-doc.ts`
- 改什么:在 `NodeWorkflowNodeDataSchema` **向后兼容新增** optional 字段:`scriptDocShotId?: z.string().min(1).max(160)`(把 Graph 节点钉到 ScriptDoc 的 Shot.id)+ `scriptDocId?`。新增 `src/lib/script-doc-graph-sync.ts`:纯函数双向投影 —— `scriptDocToGraph(doc): { nodes, edges }`(每 shot 生成 shotText+seedance,节点 data.scriptDocShotId=shot.id;≥2 镜补 videoMerge)与 `graphToScriptDocPatch(nodes, edges, doc): ScriptDoc`(按 scriptDocShotId 把节点上的 prompt/camera/duration/clipUrl/status 回写到对应 Shot,**以 Shot.id 为唯一 join key,顺序/位置变化不丢数据**)。
- 步骤:
  1. node-workflow.ts schema 仅加 optional 字段(grep 确认 NodeWorkflowNodeData 消费方,只做加法)。
  2. 写 `script-doc-graph-sync.ts` 双向函数 + 冲突策略(同一 shotId 两侧都改时,文档注释明确"哪一侧赢"并实现之 —— 建议最近编辑时间戳;无戳则 Graph 的生成产物 clipUrl/status 始终回流 Board)。
  3. 复用/抽取 spawnFullWorkflowFromAgent 中的物化逻辑成共享 builder,避免两份实现漂移(先读后写,匹配现有 NODE_STUDIO_NODE_PLACEMENT 布局常量)。
  4. 写 `script-doc-graph-sync.test.ts`:doc→graph→doc round-trip 无损(含 dialogue/duration/绑定);Graph 删一个 shot 节点后回写 doc 正确移除该 shot;Board 改 action 后投影到 graph 对应 seedance 节点;乱序/重排节点不串 shot。
- 验收:任意 ScriptDoc 经 doc→graph→graphToScriptDocPatch 还原等价(以 shot.id 比对,允许位置/顺序差异);单向修改任一视图,另一视图按 shot.id 精确同步且不误伤其它 shot。
- 验证:`npx vitest run --reporter=verbose src/lib/script-doc-graph-sync.test.ts`;后台 `tsc --noEmit` 捕获 exit code。
- 不做:不改 React Flow 渲染/UI 接线(那是后续整合);不动 server 持久化格式(NodeWorkflowProject.state 仍是同一 schema,只是 data 多了 optional 字段)。
- 依赖:VID-UI-1

### [VID-UI-5] 旧 VideoScript 面板灰度并行 + 明确下线硬条件

- 读先:`src/constants/feature-flags.ts`、`src/components/business/studio/StudioDockPanelArea.tsx:96-102,541-557`(旧面板挂载点)、`docs/status.md`(状态记录约定)
- 改什么:`feature-flags.ts` 新增 `shotBoard: process.env.NEXT_PUBLIC_FF_SHOT_BOARD === 'true'`(沿用现有 NEXT*PUBLIC_FF*\* 模式,带 JSDoc)。在 DockPanelArea 的 `state.panels.script` 分支按 FF 切换:`shotBoard` 开→渲染 `StudioShotBoardPanel`(VID-UI-3),关→渲染旧 `StudioScriptPanel`。两者共用同一 panel 开关键 `script`。
- 步骤:
  1. 加 FF 常量 + i18n 不变(无新文案则跳过,有"Beta"标记需三文件同步)。
  2. DockPanelArea 条件渲染(dynamic import 保持,新增 StudioShotBoardPanel 的 dynamic 入口)。
  3. 在 `docs/status.md`(中文,按 memory feedback-docs-in-chinese)写明 **下线硬条件**:Board 走通 topic→ScriptDoc→逐镜 approve→Graph 双向→merge 全链路 e2e 绿 + 视觉基线落定 + 移动只读视图上线(VID-UI-6) → 才删 StudioScriptPanel/ScriptEditor/StudioSceneProgress/StudioSceneFeedback + 旧 video-script hooks。下线列出待删文件清单。
  4. 写/更新 DockPanelArea 相关 test:FF 开关分别渲染对应面板。
- 验收:FF 关时行为与现状逐像素一致(旧面板);FF 开时渲染 Board;status.md 有可勾选的下线硬条件清单。
- 验证:`npx vitest run --reporter=verbose`(DockPanelArea 相关);`npm run lint && npm run build`;visual 截图两态各一(FF 开/关)。
- 不做:本包不删任何旧组件(下线在硬条件满足后单独排期);不动 Prisma video-script 数据(灰度期旧数据仍可读)。
- 依赖:VID-UI-3

### [VID-UI-6] 移动端只读 + 审核版(不渲染画布,渲染 Board 只读 + approve/retry + 看成片)

- 读先:`src/components/business/node/StudioNodeWorkbench.tsx:199-204`(现 matchMedia 关 dock 逻辑)、`src/hooks/use-mobile.ts`、`src/components/business/studio/board/ShotBoard.tsx`(VID-UI-2)、`docs/design/pages/node-workflow.md:152-157`(Unresolved:移动端是否画布编辑)
- 改什么:新增 `src/components/business/studio/board/MobileShotBoardReview.tsx`:移动断点(<768px)下**不挂 React Flow 画布**,改渲染 ShotBoard 的只读变体(编辑字段全 disabled,仅保留 approve/retry + 成片播放)。在 Node 路由层(`src/app/[locale]/(main)/studio/node/page.tsx` 或 Workbench 包裹层)用 useMobile 分流:移动→MobileShotBoardReview,桌面→现有 Workbench。
- 步骤:
  1. ShotBoard 加 `readOnly?: boolean` prop(VID-UI-2 已是受控,补一个 readOnly 抑制编辑 + 隐藏 regenerate,仅留 approve/retry/看成片)。
  2. MobileShotBoardReview 组装:ScriptDoc 来源沿用 use-script-doc(只读拉取);成片用现有 video 预览组件(复用 NodeMediaPreview 或 lightbox)。
  3. 路由分流:桌面优先,移动端不渲染画布(决议明确移动端不做画布编辑)。
  4. 写 `MobileShotBoardReview.test.tsx`:模拟移动视口→不渲染 ReactFlow、字段只读、approve/retry 可点;桌面视口→走 Workbench。
- 验收:390px 视口下无 React Flow DOM、Board 只读、approve/retry 触达区 ≥44px、成片可播放;桌面行为不变。
- 验证:`npx vitest run --reporter=verbose src/components/business/studio/board/MobileShotBoardReview.test.tsx`;`npx playwright test e2e/mobile.spec.ts --project=mobile`(断言无 canvas、44px 触达区);visual 移动基线 `--update-snapshots`(win32/darwin 各一套,按 memory dual-machine 基线规则)。
- 不做:移动端不做任何画布拖拽/连线/节点新增;不做桌面 Board 整合(那在 Board 主视图整合阶段)。
- 依赖:VID-UI-2, VID-UI-3

### [VID-UI-7] Node passthrough 收敛(shot/seedance/voice 去 passthrough + 存量 state 迁移)

- 读先:`src/types/node-workflow.ts:116-208`(NodeWorkflowNodeDataSchema `.passthrough()`)、`:215-234`(Node/Edge schema passthrough)、`:401-402`(`& Record<string, unknown>`)、`src/hooks/node/use-node-workflow.ts:433-493`(readWorkflowStorageFromStorage + 三套 legacy schema 解析)、`src/services/node/node-workflow.service.ts`(server 持久化校验)
- 改什么:为 shot / seedance / voice 三类节点的 data 把当前靠 passthrough 透传的字段**显式声明进 schema**,然后对这三类节点的 data 去除 `.passthrough()` 依赖(决议:passthrough 只收执行路径节点)。补一个迁移函数:读旧 localStorage / server NodeWorkflowProject.state 时,把未知 key 丢弃或映射到新显式字段,保证旧工程能 round-trip 不报错。
- 步骤:
  1. grep `import.*node-workflow` 确认 NodeWorkflowNodeData 消费方影响面(高危模块,只做兼容收紧)。
  2. 枚举 shot/seedance/voice 当前实际用到的 passthrough 字段(交叉核对 createDefaultNodeData:317-431 与 StudioNodeWorkbench 的 node.data 读取),全部显式进 schema。
  3. 引入分节点类型的 data 校验(discriminated 或 per-type refine),对三类执行节点关闭 passthrough;其余节点暂留 passthrough(分阶段)。
  4. 迁移:在 readWorkflowStorageFromStorage 解析成功后跑一遍 `migrateNodeData`,未知字段安全剔除;写 `node-data-migration.test.ts` 覆盖"旧带额外 key 的 state→新 schema 解析通过且字段不丢"。
- 验收:含历史额外字段的 shot/seedance/voice 节点 state 能被加载(不抛、不丢已知字段、剔除未知);三类节点 schema 不再依赖 passthrough;`NodeWorkflowNodeData` 类型对这三类不再需要 `Record<string, unknown>` 出口。
- 验证:`npx vitest run --reporter=verbose`(node-workflow types + migration + use-node-workflow 相关);后台 `tsc --noEmit` 捕获 exit code(高危类型改动,全量 tsc 必须绿);`npm run build`。
- 不做:不动 composer/agent/image/videoMerge 等其余节点的 passthrough(本包只收三类执行节点);不改服务端 Prisma 模型(state 仍是 JSON)。
- 依赖:VID-UI-1(scriptDocShotId 字段若由 VID-UI-4 加入需协调,避免与本包显式化冲突 —— 显式化时把 VID-UI-4 新增的 optional 字段一并纳入正式 schema)

### [VID-UI-8] videoMerge 锁死纯顺序拼接 + 尾裁(原生多镜优先 / merge 后备)

- 读先:`src/services/video-merge.service.ts:84-102`(ComposeClipInput,startSec 不 enforce 的注释)、`:253-279`(buildComposeKeyframes)、`src/app/api/node-workflow/merge-videos/route.ts`、`src/types/node-workflow.ts:145-158`(mergeSettings.clips schema)、`src/components/business/node/nodes/VideoMergeNode.tsx` + 其 Inspector(grep `mergeSettings` 找 Inspector)
- 改什么:UI 层把 videoMerge 锁成"纯顺序拼接 + 尾裁(endSec)"。在 Inspector / Board 的合成入口:① 优先引导原生多镜(Kling V3 Pro 单次多镜 / Seedance 多镜)作为首选,videoMerge 明确标为"后备拼接";② 把 startSec(head-trim)从 UI 收掉或显式标注"暂不生效"(service 已说明 fal 无 source-offset),只暴露 endSec 尾裁;③ 顺序=上游连接顺序,UI 显示拼接顺序预览。
- 步骤:
  1. 读 Inspector 里 mergeSettings 编辑控件(grep 定位),移除/禁用 startSec 输入或加显式 hint(无魔法值,文案进 i18n 三文件)。
  2. Board/合成入口加"原生多镜优先"引导文案 + videoMerge 作后备的视觉次级层级(呼应 node-workflow.md:88-99 "placeholder/后备动作不要做得和主操作一样 final")。
  3. 拼接顺序预览:按上游边顺序列出 clip 缩略 + 序号。
  4. 写/更新 VideoMergeNode Inspector test:无 startSec 控件(或 disabled + hint)、endSec 尾裁可设、顺序预览随上游变化。
- 验收:UI 不再提供生效不了的 head-trim;endSec 尾裁可设并正确传入 clips 契约;原生多镜在 UI 上层级高于 merge;拼接顺序对用户可见。
- 验证:`npx vitest run --reporter=verbose`(VideoMerge 相关);`npm run lint && npm run build`;visual 截图(Inspector 合成态)。
- 不做:不改 service 端 compose/merge 逻辑(纯顺序+尾裁已是现状,无需动 service);不接原生多镜生成逻辑(provider 侧属 DIR-DATA/视频模型包);不动 fal endpoint/payload(若确需碰 provider 字段,**前置步骤**:按 `docs/integrations/providers.md` 官方复核 fal compose schema 后再动)。
- 依赖:无(可与 1–7 并行;若与 Board 合成入口整合则排在 VID-UI-2 之后)

---

## 【SEC · P4 资源/安全】任务包

> 阶段:**资源/安全(横切补丁,可在 mainline 任意阶段提前落地;私有媒体方案为后置项)**。SEC-1 / SEC-6 提前到与图片阶段并行;SEC-2 必须早于 GAL-1/GAL-2。

### [SEC-1] 抽出统一所有权校验器 `db-scope` 扩展(project / card 引用)

- 读先:`src/lib/db-scope.ts`、`src/services/generation.service.ts`(batchAssignProject L1111-1129)、`src/services/node/story.service.ts`(createStory L106-111)、`src/services/kernel/card-recipe-compiler.service.ts`(L168/182/195)、`src/constants/`(看错误码/常量放置约定)
- 改什么:新建 `src/services/security/ownership.service.ts`(首行 `import 'server-only'`),导出按内部 userId 做存在性+归属校验的纯函数,复用现有 `db`:
  - `assertProjectOwned(userId: string, projectId: string): Promise<void>` — `db.project.findFirst({ where: { id, userId, isDeleted: false }, select: { id: true } })`,缺失抛 `OwnershipError`。
  - `assertProjectOwnedOrNull(userId, projectId: string | null)` — null 直接通过(用于「移出 project」)。
  - `assertGenerationsOwned(userId, ids: string[]): Promise<void>` — `count({ where: { id:{in:ids}, userId } })` 与 `new Set(ids).size` 比对(沿用 story 范式,去重)。
  - `assertCardsOwned(userId, { characterCardId?, backgroundCardId?, styleCardId? })` — 对每个非空 id `findFirst({ id, userId, isDeleted:false })`,缺失抛错并指明哪张卡。
  - 新增 `OwnershipError`(放 `src/lib/errors.ts`,httpStatus=404,errorCode `RESOURCE_NOT_FOUND`,i18nKey 走既有 errors.common;与 factory `handleRouteError`/`GenerationError` 体系兼容,确认其被识别为 GenerationError 子类或在 factory 中映射为 404)。
- 步骤:1) 读 `src/lib/errors.ts` 确认 GenerationError 基类构造与 factory 识别路径(`isGenerationError`);2) 加 `OwnershipError`;3) 建 ownership.service.ts;4) 写 `ownership.service.test.ts`(owned→pass / not-owned→throw / deleted→throw / null→pass / 部分卡缺失→throw)。
- 验收:4 个校验器导出且单测覆盖正/负/边界;`OwnershipError` 经 factory 返回 HTTP 404 且不泄露内部信息;无 `any`。
- 验证:`npx vitest run --reporter=verbose src/services/security/ownership.service.test.ts src/lib/errors`
- 不做:不改调用方(后续包接入);不加 signed URL;不碰 r2.ts。
- 依赖:无

### [SEC-2] 修复 `assignGenerationToProject` 目标 project 越权(安全补丁,优先)

- 读先:`src/services/project.service.ts`(assignGenerationToProject L245-255)、`src/services/generation.service.ts`(batchAssignProject L1111-1129)、`src/app/api/generations/[id]/project/route.ts`、`src/services/security/ownership.service.ts`(SEC-1)
- 改什么:`assignGenerationToProject`:在 `db.generation.update` 前调用 `assertProjectOwnedOrNull(dbUser.id, projectId)`;generation 本身已按 `{ id, userId }` 限定,保留。返回语义保持 `Promise<void>`(向后兼容)。
- 步骤:1) import SEC-1 校验器;2) projectId 非 null 时校验目标 project 归属(缺失→`OwnershipError` 404,不再让 Prisma 抛 P2025 500);3) generation 不存在/不属己同样走 404(用 `assertGenerationsOwned([generationId], dbUser.id)` 或保留 update 的 where 并捕获 P2025 转 404 — 选前者更显式);4) 补/扩 `project.service.test.ts`:自己的 gen→自己的 project ✅、自己的 gen→他人 project→404、他人 gen→404、projectId=null→清空成功。
- 验收:跨用户 project 赋值被拒(404);既有「移出 project(null)」仍可用;route 仍走 `createApiPatchByIdRoute` 不变。
- 验证:`npx vitest run --reporter=verbose src/services/project.service.test.ts`
- 不做:不动 route 文件签名;不改 batchAssignProject(已正确)。
- 依赖:SEC-1
- **注**:本包 id 在 SEC 工作流内为越权修复;排期表中 GAL-1/GAL-2 依赖的"SEC-2 私有媒体"指的是私有媒体通道(`/api/media`,即 SEC-9)的契约。GAL 实施前需确认 SEC-2(越权修复)+ SEC-9(私有媒体路由)两者落地或契约确定。

### [SEC-3] `createGeneration` 写 projectId / characterCardIds 前验权

- 读先:`src/services/generation.service.ts`(CreateGenerationInput L52-94, createGeneration L373-427)、所有 createGeneration 调用方(先 `grep -rn "createGeneration(" src/`,重点 `generate-image.service.ts`、`execution-callback.service.ts`、`generate-video.service.ts`、`upload-image.service.ts`)、`src/services/security/ownership.service.ts`(SEC-1)、cards.md L464
- 改什么:在 `createGeneration` 内、`client.generation.create` 之前,当 `input.userId` 存在且(`input.projectId` 或 `input.characterCardIds?.length`)时:`assertProjectOwnedOrNull(input.userId, input.projectId ?? null)` + `assertCardsOwned(input.userId, { ... })`(characterCardIds 用 `assertGenerationsOwned` 的同款 count 比对变体 `assertCharacterCardsOwned`)。**向后兼容铁律**:`userId` 缺省(worker/callback 旧路径无 userId)时跳过校验并 `logger.warn` 一次(暴露不确定性,不静默)。
- 步骤:1) 枚举调用方确认哪些已在上游验权(避免重复 DB 往返);2) 给 SEC-1 加 `assertCharacterCardsOwned(userId, ids)`(count 比对,去重);3) 在 createGeneration 接入;4) 扩 `generation.service.test.ts`:含他人 project/card 的 input→抛 OwnershipError;无 userId 的 input→跳过并告警;正常路径不回归。
- 验收:带 userId 时越权 project/card 被拒;旧无-userId 路径不破;`createGeneration` 签名/返回类型不变。
- 验证:`npx vitest run --reporter=verbose src/services/generation.service.test.ts`
- 不做:不改调用方业务逻辑(仅在上游已验权处可后续去重,本包不做);不动 join 表结构。
- 依赖:SEC-1

### [SEC-4] 卡片写路径(background/style/recipe)所有权收口

- 读先:`background-card.service.ts`、`style-card.service.ts`、`card-recipe.service.ts`(三者 update*/create* 全文)、`src/services/security/ownership.service.ts`(SEC-1)、cards.md L460-463
- 改什么:
  - 三个 `update*`:把 `db.X.update({ where: { id: cardId } })` 改为 `db.X.update({ where: { id: cardId, userId: user.id } })`(双重保险,与前置 findFirst 一致;Prisma 7 复合 where 支持 userId 非唯一时用 updateMany+count==1 或保留 findFirst 后 update by id —— 与代码库现状一致选 findFirst 守门即可,关键是下方 projectId/card 引用校验)。
  - create/update 中当 `input.projectId !== undefined && !== null` 时调用 `assertProjectOwned(user.id, input.projectId)`。
  - `card-recipe.service.ts` create/update:写 `characterCardId/backgroundCardId/styleCardId` 前调 `assertCardsOwned(user.id, {...})`(只校验本次传入的非空 id),把 compile 时的校验前移到写入时(cards.md L461)。
- 步骤:1) 三 service 接入校验;2) 各自补/扩 `.test.ts`:他人 project → 拒、他人卡引用 → 拒、自己的全通过、projectId 不传不校验;3) 确认错误为 OwnershipError(404) 经路由正确呈现。
- 验收:卡片 create/update 无法引用他人 project 或他人卡;现有正常 CRUD 测试全绿。
- 验证:`npx vitest run --reporter=verbose src/services/cards`
- 不做:不改 character-card.service(其 parentId 已校验,projectId 不在 create schema — cards.md L463 留作产品确认);不动 compiler 既有校验(保留为第二道防线)。
- 依赖:SEC-1

### [SEC-5] route factory 一致性迁移(裸 auth/NextResponse → factory)

- 读先:`src/lib/api-route-factory.ts`(全部 export)、待迁移路由:`character-cards/generations/route.ts`、`character-cards/[id]/generations/route.ts`、`projects/[id]/history/route.ts`、`stories/[id]/route.ts`、`likes/route.ts`、`collections/[id]/route.ts`、`collections/[id]/items/route.ts`;各自对应 service
- 改什么:逐个把 GET/POST/PUT/PATCH/DELETE 改用对应 factory(`createApiGetRoute`/`createApiGetByIdRoute`/`createApiRoute`/`createApiPostByIdRoute`/`createApiDeleteRoute`),Zod schema 从 `@/types/` 或就近定义,handler 只调 service。带 path param 的查询路由(如 `character-cards/generations` 用 query,`projects/[id]/history` 用 param+query)按签名选 factory;query+param 混合的若 factory 不支持组合,**停下来在报告里 surface**,本包先迁纯 query / 纯 param 的,混合的单列子任务标 BLOCKED。
- 步骤:一次迁一个路由文件(小切片),每个迁完即跑该路由的 `route.test.ts`(缺失则补 auth(401)→validation(400)→success→error 四件套);保持响应 JSON 形状 `{success,data}` 不变(factory 已保证)。
- 验收:目标路由不再 import `@clerk/nextjs/server` 与裸 `NextResponse.json` 做 auth/错误;route.test 覆盖 401/400/200;行为与迁移前一致。
- 验证:`npx vitest run --reporter=verbose src/app/api/character-cards src/app/api/stories src/app/api/likes src/app/api/collections src/app/api/projects`
- 不做:**不迁** `image/proxy`、`download`、`generations/[id]/poster`、`node-workflow/upload-reference-video`、`voices/upload-reference` 等返回二进制流/重定向/multipart 的路由(现有 JSON factory 不适配 — 报告中记为「factory 不覆盖,需新二进制 factory,留后续」,见 gaps);不迁 admin/internal/webhook。
- 依赖:无(与 SEC-2 独立;若被迁路由调到 SEC-2/4 改过的 service,按依赖顺序排在其后)

### [SEC-6] 私有媒体方案预研 + ScriptDoc 决策(前置门,禁止直接编码)

- 读先:`docs/architecture/storage.md`(L210-254 Private Media Access + Unresolved)、`docs/integrations/providers.md`(Hard Rules)、`src/services/storage/r2.ts`(全文)、`src/app/api/image/proxy/route.ts`、`src/app/api/download/route.ts`
- 改什么:**不写运行代码**。产出一份私有媒体实现决策记录(写入 `docs/architecture/storage.md` 的实现小节或新建 `docs/architecture/private-media.md`,中文):
  - 按 Cloudflare R2 官方当前文档核实并记录:`@aws-sdk/s3-request-presigner` `getSignedUrl` 用法、签名有效期上限、R2 是否支持/如何配置 private bucket、CDN(custom domain) 与 r2.dev 公共访问关系、proxy 流式与 signed-url 重定向两种方案的取舍。
  - 锁定 MVP:`GET /api/media/[id]` → auth → 取 Generation → public 则 302 到 CDN / private 则签发短时 signed URL 或鉴权代理流。
  - 明确存量 public URL 迁移触发条件与 `isOwnedStorageUrl` 兼容策略(见 SEC-8)。
- 步骤:1) 用 WebFetch/官方文档核实(providers.md 要求的官方复核,编码前置步骤);2) 写决策文档(含字段/有效期/方案选择/未决点);3) 在文档 Last Verified 段记录核验日期与来源 URL。
- 验收:文档给出可直接据以编码的 signed URL API 签名、有效期常量建议、方案选择与理由;明确「public 走 CDN / private 走 signed 或 proxy」边界;列出对 schema 的影响(指向 SEC-7)。
- 验证:无代码;交付为文档(人工/Codex 据此领 SEC-9/10)。
- 不做:不改任何 r2.ts / route;不引入 signed URL 实现(留 SEC-9)。
- 依赖:无(其余私有媒体包的硬前置)

### [SEC-7] `Generation.referenceImageUrl` 补配对 storageKey + 生命周期类型(schema,向后兼容)

- 读先:`prisma/schema.prisma`(Generation L204-284)、`src/services/generation.service.ts`(CreateGenerationInput L52-94, getGenerationStorageKeys L37-50, LIST_GENERATION_SELECT L148-184)、`src/types/index.ts`(GenerationRecord 相关,先 grep;改 types/index.ts 属高危——只做新增 optional 字段)、storage.md(L138-148 Reference Inputs)、`prisma/CLAUDE.md`
- 改什么:Generation 加两列(均 nullable,向后兼容):`referenceImageStorageKey String?`、`referenceImageLifecycle String?`(值域常量进 `src/constants/`:`GENERATION_REFERENCE`,如 `temporary | generation_bound | replay_required`)。`CreateGenerationInput` 加对应 optional 字段并在 createGeneration 写入。`getGenerationStorageKeys` 在 lifecycle 非 `replay_required`/可清理时纳入 referenceImageStorageKey(保守:默认仍不删,除非 lifecycle 明确为 generation_bound — 与 storage.md L143 一致)。
- 步骤:1) 加 schema 列 + `npx prisma migrate dev --name add_reference_image_storage_lifecycle` + `npx prisma generate`;2) 加常量;3) 扩 CreateGenerationInput/createGeneration(不改既有字段);4) types/index.ts 给 GenerationRecord 加 optional 字段(仅新增);5) 扩 generation.service.test.ts(写入新字段、删除时按 lifecycle 决定是否含 key)。
- 验收:迁移成功、generate 通过;旧记录(两列为 null)查询/删除不回归;新写入可带 storageKey + lifecycle。
- 验证:`npx vitest run --reporter=verbose src/services/generation.service.test.ts` + `npx tsc --noEmit`(后台、捕获 exit code)
- 不做:不真正改写删除清理的破坏性行为(默认仍保守不删 reference,除非 lifecycle 显式标记);不回填存量数据(迁移留 SEC-8)。
- 依赖:SEC-6(生命周期类型取值需与私有媒体方案一致)

### [SEC-9] `/api/media/[id]` 鉴权代理 / 短时 signed URL(按 SEC-6 方案实现)

- 读先:SEC-6 决策文档、`src/services/storage/r2.ts`、`src/services/generation.service.ts`(getGenerationById/getPublicGenerationById/getGenerationByIdForUser)、`src/lib/api-route-factory.ts`、`src/app/api/image/proxy/route.ts`(同源 302 范式)
- 改什么:
  - r2.ts 新增 `createSignedReadUrl({ key, expiresInSeconds })`(按 SEC-6 核实的 `getSignedUrl` 用法,有效期常量进 `src/constants/`,先读 providers.md)。
  - 新建 `src/app/api/media/[id]/route.ts`(GET):auth → 取 Generation(用 generation.service 的 by-id;public 用 getPublicGenerationById,私有用 getGenerationByIdForUser)→ public 则 302 到 CDN URL / private 且属己则签发 signed URL 302 或鉴权代理流 → 否则 404。因返回重定向/流,**不套现有 JSON factory**(与 SEC-5 排除一致),但仍手写 auth→ownership→响应三段并加 rateLimit。
- 步骤:1) r2 加 signed URL helper + 单测(mock s3-request-presigner);2) media route + `route.test.ts`(匿名访问 public→302、匿名访问 private→404、owner 访问 private→signed/proxy、他人访问 private→404、不存在→404);3) 不改既有 public 消费方(仅新增可选私有通道)。
- 验收:私有 generation 不再以永久 public URL 暴露给非 owner;public 仍走 CDN;signed URL 有效期符合 SEC-6;越权返回 404。
- 验证:`npx vitest run --reporter=verbose src/app/api/media src/services/storage/r2.test.ts`
- 不做:不强制全站切换到 /api/media(前端切换是独立 UI 任务);不改 upload 写入 URL 的公私分流(留 SEC-10)。
- 依赖:SEC-6(强前置:API 签名/有效期/方案)、SEC-7(lifecycle/字段)

### [SEC-8] 存量 public R2 URL 渐进迁移(后台分批 + `isOwnedStorageUrl` 新旧域名兼容)

- 读先:`src/services/storage/r2.ts`(isOwnedStorageUrl L405-414, ownedStorageHostnames L389-403)、`src/services/storage/r2.test.ts`、SEC-6 决策文档、`prisma/schema.prisma`(Generation 的 url/storageKey)
- 改什么:
  - 确认 `isOwnedStorageUrl` 兼容新私有码路域名(若 SEC-6/9 引入新 host,把它加入 `ownedStorageHostnames()`;保留 legacy `pub-...r2.dev` 硬编码兼容旧记录)。
  - 新建迁移脚本/service `src/services/storage/migrate-public-urls.service.ts`(首行 server-only):分批扫描存量 Generation,**新对象走私有码路**(即新写入由 SEC-9/10 决定)、存量旧 public URL 标记/逐步可控迁移;本包仅做「兼容判定 + 分批枚举 + dry-run 报告」,不做不可逆批量改写(破坏性操作需 owner 确认)。
- 步骤:1) 扩 `isOwnedStorageUrl` 测试覆盖新旧域名;2) 写 dry-run 枚举(输出待迁移计数/样本,logger 暴露);3) 不在本包执行真实批量写库。
- 验收:`isOwnedStorageUrl` 对新域名+legacy 域名+data:+非法 URL 全部正确(单测);dry-run 可跑并报告存量规模;无破坏性写入。
- 验证:`npx vitest run --reporter=verbose src/services/storage/r2.test.ts`
- 不做:不执行不可逆批量迁移(标 owner-gated);不删除旧对象。
- 依赖:SEC-6、SEC-9(域名/码路确定后才能定兼容集)

### [SEC-10] 新对象公私分流写入(upload / generation 持久化按可见性选码路)

- 读先:SEC-6/9 决策、`src/services/upload-image.service.ts`(USER_UPLOAD_PROVIDER 写入)、`src/services/storage/r2.ts`(uploadToR2/streamUploadToR2/uploadFromHttpToR2 的 URL+CacheControl)、`src/services/image/generate-image.service.ts`(R2 持久化处)、storage.md(Provider URLs / Private Media)
- 改什么:让持久化路径按目标可见性(isPublic)决定:public → 现有 CDN 公共 URL(`public, immutable`);private → 私有对象(不返回永久 public URL,前端经 SEC-9 `/api/media/[id]` 访问)。具体 R2 私有写法(同 bucket private object vs prefix)按 SEC-6 核实结论。
- 步骤:1) 在 upload/generation 持久化处接入分流(向后兼容:默认仍 public,仅当显式 private 时走私有码路);2) 扩相关 service 测试;3) 与 SEC-9 媒体路由联调(private 写入 → /api/media 可读、CDN 直链不可读)。
- 验收:新私有作品不再生成永久公共可读 URL;public 作品行为不变;既有调用方不回归。
- 验证:`npx vitest run --reporter=verbose src/services/upload-image.service.test.ts src/services/image/generate-image.service.test.ts`
- 不做:不回填存量(SEC-8);不强制现有 public 作品转私有;不动 provider 调用逻辑。
- 依赖:SEC-6、SEC-9、SEC-7

---

## TAIL · P5/P6 + 收尾(Gallery/Prompts 展示复用 · 3D 冻结 · 旧路由下线 · i18n 策略 · 边界记录)

> 阶段:**P5(Gallery/Prompts)+ P6(3D 冻结)+ 跨切面收尾**
> 顺序约束:P5(GAL-1/GAL-2/PR-1)依赖 P4 的私有媒体(SEC-2 越权修复 + SEC-9 私有通道)已落地或至少契约确定;GAL-CLEANUP-1(旧长视频下线)依赖 P3 的 DIR-DATA-06(planner/lineage 接管 clip→Generation)验收(见 conflicts:原排期 `DIR-5` 悬空,修正为 `DIR-DATA-06`)。3D-0 全程冻结。

### [GAL-1] Gallery / Profile 展示层去 provider-URL 审计 + referenceImageUrl 收口

- 读先:`docs/domains/gallery.md`(Storage And Media 段、Public Visibility Contract)、`docs/domains/profile.md`(Public Works On Profile 段)、`docs/architecture/storage.md`(Provider URLs 段 + Reference Inputs 段,注意 `Generation.referenceImageUrl` 无配对 storageKey)、`src/lib/generation-media.ts`、`src/app/[locale]/(main)/gallery/[id]/page.tsx`(252-271 行 referenceImageUrl 直渲染)、`src/components/business/ImageCard.tsx`、`src/components/business/PolaroidCard.tsx`、`src/services/generation.service.ts`(`getPublicGenerationById`:740、`getPublicGenerationPage`:650、`LIST_GENERATION_SELECT`)。
- 改什么:纯审计 + 一处收口。(1) 产出审计清单 `docs/design/reviews/2026-06-gallery-provider-url-audit.md`:逐文件列出 Gallery feed / Gallery detail / Profile(CreatorProfileView/PolaroidGrid/PolaroidCard)/ ImageCard 当前每个图像/视频/下载 URL 的来源(R2-derived `url`/`previewUrl`/`thumbnailUrl`/`modelUrl` vs 可能的 provider 原始 `referenceImageUrl`),每项标"已 R2 / 仍 provider / 需 SEC-9 代理"。(2) 收口实现项:把 gallery 详情页 252-271 行的公开 `referenceImageUrl` 渲染改为"仅当 referenceImageUrl 是平台 R2-derived(以 `NEXT_PUBLIC_STORAGE_BASE_URL` 前缀判定,前缀常量进 `src/constants/`,不硬编码)才展示;否则不渲染参考图块"——避免公开页泄漏 provider 临时 URL;判定逻辑抽成纯函数(如 `isPlatformMediaUrl(url)`)放 `src/lib/generation-media.ts` 并配单测。
- 步骤:1) 写审计文档;2) 在 `generation-media.ts` 增 `isPlatformMediaUrl` 纯函数(读 `NEXT_PUBLIC_STORAGE_BASE_URL`)+ 单测(平台 URL / provider URL / 空值边界);3) gallery 详情页用该函数 gate referenceImageUrl 块;4) i18n 若新增"参考图来源不可用"类提示文案则三文件同步(默认不新增文案,仅隐藏)。
- 验收:审计文档覆盖 4 个展示面每个 URL 来源;`isPlatformMediaUrl` 单测含平台/provider/空三类;gallery 详情页对非平台 referenceImageUrl 不渲染图片块(组件测断言);公开 feed 仍只显示 `isPublic=true`、`isPromptPublic=false` 时 prompt 被清空(沿用 `getPublicGenerationById` 既有行为,不回归)。
- 验证:`npx vitest run --reporter=verbose` + tsc 全量 + UI 阶梯(lint/build → `npx playwright test e2e/visual.spec.ts`,有意改动则 `--update-snapshots` 点名 gallery-detail 快照)。
- 不做:不实现 `/api/media/[id]` 代理或 signed URL(归 SEC-9);不动 `getPublicGenerationById` 的 select / 可见性逻辑;不迁移存量 public R2 URL;不动 Profile 的社交/follow。
- 依赖:建议在私有媒体契约(SEC-2/SEC-9)确定后做(私有媒体最终形态影响"需代理"项的措辞);可独立于 PR-1。

### [GAL-2] 公开/私有边界对齐私有媒体通道(私有作品下载/原图门控)

- 读先:`docs/architecture/storage.md`(Private Media Access 段)、`docs/domains/gallery.md`(Public Visibility Contract / Stability Rules)、`src/app/[locale]/(main)/gallery/[id]/page.tsx`(301、314 行 download / openOriginal 用 `generation.url`)、SEC-9 产出的 `/api/media/[id]` 契约(前置:SEC-9 必须先定义路由签名与返回结构)。
- 改什么:把 Gallery / Profile 详情中"下载 / 打开原图"对私有作品的取数从永久 public URL 切到 `/api/media/[id]` 的鉴权代理 / 短时 signed URL;公开作品继续走 CDN public URL。公开 feed/列表本身不变(公开列表只含公开作品)。
- 步骤:1) 等 SEC-9 暴露 media 解析入口(client 侧走 `src/lib/api-client`,不在组件 fetch);2) 详情页按 `generation.isPublic` 分支选 URL 来源;3) 组件测覆盖"公开作品=public URL / 私有作品(owner 自看)=代理 URL"。
- 验收:私有作品的原图/下载不再暴露永久 public URL(断言 URL 形态);公开作品行为不回归;匿名访问私有作品仍 `notFound()`(`getPublicGenerationById` 既有)。
- 验证:vitest + tsc + UI 阶梯。
- 不做:不实现私有媒体路由本身;不改公开 CDN 策略;不改可见性 toggle 路由。
- 依赖:硬依赖私有媒体通道(SEC-9,P4)。可在 GAL-1 之后。

### [PR-1] Recipe 复用血缘闭环(图→Recipe→回溯到图,打通 IMG-2/IMG-1B "存 Recipe")

- 读先:`docs/domains/prompts.md`(Responsibility / Contract 段)、`src/services/prompts/recipe.service.ts`(`createRecipeFromGeneration`:304、`listRecipeGenerations`:359 的 parentGenerationId + recipeSnapshot.path['recipeId'] 双路径、`getGenerationReferenceAssets`:111)、`src/components/business/prompts/PromptTemplateDetailEditor.tsx`、`src/components/business/prompts/PromptTemplateCreatePanel.tsx`、`src/app/api/recipes/from-generation/route.ts`、IMG 阶段的"存 Recipe"去向(roadmap P1)。
- 改什么:保证"从作品存 Recipe → Recipe 详情页展示该模板产出的全部作品"端到端可见。(1) 验证/补齐 IMG 触发的 `createRecipeFromGeneration` 写入 `parentGenerationId`(已在 343 行)且后续用该 recipe 生成时 `recipeSnapshot.recipeId` 被写入(确认生成链路写回点,若缺则在生成服务向后兼容补可选写入);(2) Recipe 详情血缘列表用 R2-derived URL 渲染缩略(复用 `getGenerationThumbnailUrl`,不依赖 provider URL);(3) 空血缘态文案三语。
- 步骤:1) grep 确认 `recipeSnapshot` 写入点(`buildRecipeSnapshot`:130 已产出 recipeId,确认调用方在生成时落库);2) 若 IMG 存 Recipe 后未回写 recipeSnapshot 则在生成服务向后兼容补;3) 详情页血缘列表渲染走 `getGenerationThumbnailUrl`;4) 单测:存 Recipe→生成→`listRecipeGenerations` 返回含该作品(含 parent + snapshot 双路径)。
- 验收:从一条作品存 Recipe 后,Recipe 详情可见 parentGeneration;用该 Recipe 再生成的作品也出现在血缘列表;血缘缩略不依赖 provider URL;i18n 三文件含血缘空态。
- 验证:vitest(recipe.service + 详情组件)+ tsc。
- 不做:不做生成执行;不改 InspirationPrompt clone;不改 `Recipe` 与 `CardRecipe` 边界(仍是不同 model);不实现 CardRecipe 管理页(见 BND-1)。
- 依赖:与 IMG-2 配对(IMG-2/IMG-1B 提供"存 Recipe"入口);可独立于 GAL-\*。

### [GAL-CLEANUP-1] VideoPipeline 旧长视频路由安全下线(收敛期保留 → DIR-DATA-06 后删)

- 读先:`src/app/api/generate-long-video/route.ts`(+ `status/route.ts`、`cancel/route.ts`、`retry/route.ts`)、`src/services/video-pipeline.service.ts`、`src/lib/api-client/generation.ts`(825-924 行 4 个 API 函数)、`src/hooks/use-generate-long-video.ts`、`src/app/api/internal/execution/long-video/advance/route.ts`(worker 回调)、`src/constants/config.ts`(177-180 端点 / 513 rateLimit / 546 maxDuration)、`prisma/schema.prisma`(`VideoPipeline`/`VideoPipelineClip`/`Generation.videoPipeline`)、`docs/plans/execution-roadmap-2026-06.md`(DIR-DATA-05/06)。
- 改什么:分两步、两个独立 PR。**第一步(本包,收敛期)**:仅确认零外部依赖 + 标注弃用,不删代码。grep 复核 `useGenerateLongVideo` / `submitLongVideoAPI` 等在 `src/components` / `src/app/[locale]` 下确实 0 命中(实读已确认:仅 hook 自身 + api-client + 各自 .test 互引,无组件挂载);在 route 与 service 顶部加 `@deprecated` 注释 + logger.warn 标记"legacy long-video pipeline, superseded by DIR planner";产出下线清单 `docs/plans/2026-06-long-video-decommission.md`(列出 route/service/client/hook/常量/Prisma 模型的删除批次与触发条件)。**第二步(DIR-DATA-06 验收后,单独 PR,不在本包)**:删除 route + service + client 函数 + hook + 端点常量;Prisma 模型删除走独立迁移包(向后兼容评估)。
- 步骤:1) grep 三处目录复核零 UI 消费并写入清单;2) 加 deprecation 标记与 warn 日志;3) 写下线清单含触发条件 + 删除批次顺序(先 hook/client → route → service → 常量 → 迁移删模型);4) 不动 internal worker advance 路由(它是 service 的合法 inbound,随 service 一起在第二步处理)。
- 验收:清单证明 route→service→client→hook 为自洽死链(每项给出 grep 证据:调用方仅测试/自身);deprecation 标记到位;保留期内现有 .test 仍绿(不破坏行为);明确写出"第二步删除的硬前置 = DIR-DATA-06(planner/lineage 接管 clip→Generation + shot lineage)已验收"。
- 验证:vitest(现有 video-pipeline.service.test + advance route.test 仍通过)+ tsc + lint。
- 不做:本包不删任何文件、不删 Prisma 模型、不删端点常量;不动 DIR-DATA 的新 planner;不动 `videoMerge`(纯顺序拼接锁死,归低杠杆)。
- 依赖:第二步硬依赖 **DIR-DATA-06**(原排期写 `DIR-5`,为悬空 id,见 conflicts 修正);第一步可立即做(独立于 P3 进度)。

### [BND-1] 边界记录:CardRecipe 不做管理页 / CharacterCard 付费 refine 闭环延后

- 读先:`docs/domains/prompts.md`(Boundary Notes:54-57,`CardRecipe` 属 Cards 域)、`docs/domains/cards.md`(CardRecipe 段 + CharacterCard refine 相关)、`docs/product/mainline.md`(资产层 Cards 段:46)。
- 改什么:纯文档。在 `docs/domains/cards.md`(或其 Unresolved/边界段)显式记录两条已锁定取舍:(1) **CardRecipe 不做独立管理页**——CardRecipe 仅作为 Studio card-mode 的组合配方存在,不开 `/card-recipes` CRUD 管理界面(与 Prompts 域的 `Recipe` 库区分:Recipe 有 `/prompts` 库页,CardRecipe 没有);(2) **CharacterCard 付费 refine 闭环延后**——refine(付费精修角色一致性)不在当前 mainline,记录为 deferred 并指向触发条件(核心创作链 + 资产链稳定后再评估)。同步在 `docs/status.md` 末尾追加一行边界确认。**可并入** Kling V3 Pro extend endpoint 第一期处置(见 gaps):明确记录"第一期不启用 extend、长视频第二期再验证"。
- 步骤:1) cards.md 增/补两条边界记录(中文,标识符/路径保留英文);2) status.md 追加确认行;3) 不写代码。
- 验收:两条边界在 cards.md 有明确"不做/延后 + 理由 + 触发条件";status.md 可检索到该确认;与 prompts.md 既有 `Recipe` vs `CardRecipe` 区分不冲突。
- 验证:无(纯文档);`npm run lint` 不涉及(仅 .md)。
- 不做:不删任何 CardRecipe 服务/类型/API(它们作为 Studio 内部配方仍存活);不实现 refine。
- 依赖:无。可随时做。

### [I18N-1] 新增视频/导演/声音术语三语策略包(默认严格三语)

- 读先:`CLAUDE.md`(Hard Rule "i18n 三文件同步" + Common Pitfalls 1)、`docs/plans/execution-roadmap-2026-06.md`(0.1 全局规则)、`src/messages/en.json`、`src/messages/ja.json`、`src/messages/zh.json`(实读:各 81 个顶级 namespace 完全对齐;`VideoScript`/`LongVideo` 三语已有;`NodeWorkflow`/`Director`/`ShotBoard`/`VoiceCard` 顶级 namespace 三语均无)、`/i18n-check` skill。
- 改什么:纯策略 + 校验门,**不预先翻译**。产出 `docs/development/i18n-video-director-terms.md`:(1) 锁定默认策略=**严格三语**——P2/P3 新增的视频/导演/声音术语(如未来的 `ScriptDoc`/`ShotBoard`/`Director`/`VoiceCard` namespace 文案)en/ja/zh 必须同步新增,不允许 zh-only;(2) 唯一有时点豁免=**视频导演 UI 仍在迭代且 namespace 明确标 `_draft` 时,可 zh-only 至 UI 定稿**,但必须在该 namespace 顶部留 `// i18n-draft: zh-only until UI lock` 标记并登记到本文档的"豁免清单",UI 定稿即补齐 ja/en——默认不启用豁免,需 owner 在引入时显式批准;(3) 给出术语对照表骨架(中/英/日列,初始可空,由各实现包填)。校验门:本包把现有 81-namespace 三语对齐作为基线断言写进一个 i18n 一致性测试(若仓库已有 i18n-check 测试则复用并扩展,否则新增 `src/messages/i18n-parity.test.ts` 断言三文件顶级 + 一层嵌套 key 集合相等,draft 豁免清单除外)。
- 步骤:1) 写策略文档 + 豁免规则 + 术语对照骨架;2) 新增/扩展 i18n parity 单测(读三文件,断言 key 集合相等,允许 draft 白名单);3) 跑 `/i18n-check` 确认现状基线绿。
- 验收:策略文档含"默认严格三语 + 豁免条件 + 豁免清单 + owner 批准要求";parity 单测对当前三文件通过(81 namespace 对齐基线被锁住);故意删一个 zh key 时测试变红(自验)。
- 验证:`npx vitest run --reporter=verbose`(i18n parity 测试)+ `/i18n-check`。
- 不做:不预先翻译尚不存在的视频/导演术语(由各实现包按本策略落地);不改现有文案内容;不引入新 namespace。
- 依赖:无(为 P2/P3 实现包提供契约)。建议早做,作为后续视频/声音包的前置约束;并在每个新增 namespace 的实现包验收时随手补齐三语。

### [3D-0] 3D 冻结边界记录(仅维护 GLB/poster 生命周期)

- 读先:`docs/architecture/storage.md`(3D Files 段:178-185,GLB=主资产 / poster=封面 / 删 3D 删两者 / poster 非作品本体)、`docs/product/mainline.md`(3D 段:158-165 待确认项)、`docs/status.md`(22 行:6 个 3D model option)。
- 改什么:纯文档/冻结声明。在 `docs/architecture/storage.md` 或 `docs/domains` 适当处确认:3D 当前**冻结**——不新增 surface、不进 Node workflow、不进短期主线;唯一允许的改动=GLB/poster 生命周期出现 bug 时的最小维护(删 3D 必须同删 `modelStorageKey` 对应 GLB 与 `storageKey` 对应 poster,沿用 `r2.ts` 既有 `deleteManyFromR2` 路径)。记录 mainline 未决项(3D 在 Gallery/Profile 是否同级展示、多视角参考/中间 mesh 生命周期)为 deferred。
- 步骤:1) 在 storage.md 3D Files 段补"冻结状态 + 唯一维护例外";2) 不写功能代码。
- 验收:3D 冻结状态与维护边界在文档明确;无新增 API/组件/类型。
- 验证:无(纯文档)。
- 不做:不开发任何 3D 新功能;不动 generate-3d.service / generation-poster.service 现有行为;不进 Node。
- 依赖:无。

---

## 附录 A:依赖图

```
图片(P1)
  IMG-1A ──┬─→ IMG-1C
           └─→ IMG-1B ←── IMG-3
  IMG-2 ──────→ IMG-3
  IMG-4 ──────→ IMG-6
  IMG-7 ──────→ IMG-8
  IMG-5(独立)
  IMG-2 ──────→ PR-1(P5,但紧随 IMG-2 即可)

声音(P2)
  VOICE-1 ──→ VOICE-2
  VOICE-7 ──→ VOICE-8
  VOICE-3 / VOICE-4 / VOICE-5 / VOICE-6(各独立)

视频/数据(P3)
  DIR-DATA-07(前置门)──┬─→ DIR-DATA-02 ←── DIR-DATA-01
                        ├─→ DIR-DATA-03 ←── DIR-DATA-02
                        ├─→ DIR-DATA-05 ←── DIR-DATA-04
                        └─→ DIR-DATA-06
  DIR-DATA-01(契约,与 VID-UI-1 同锚点)
  DIR-DATA-04(高危独立 PR)──→ DIR-DATA-05

视频/UI(P3)
  VID-UI-1(锚点)──┬─→ VID-UI-2 ──┬─→ VID-UI-3 ──┬─→ VID-UI-5
                   │              │              └─→ VID-UI-6
                   │              └─→ VID-UI-6
                   ├─→ VID-UI-4
                   └─→ VID-UI-7
  VID-UI-8(独立)

资源/安全(P4 横切)
  SEC-1 ──┬─→ SEC-2
          ├─→ SEC-3
          └─→ SEC-4
  SEC-5(独立)
  SEC-6 ──┬─→ SEC-7 ──→ SEC-9 ──┬─→ SEC-8
          └─→ SEC-9 ←──────────┘
  SEC-7 + SEC-9 + SEC-6 ──→ SEC-10

Gallery(P5)+ 收尾(P6)
  SEC-2/SEC-9 ──→ GAL-1 ──→ GAL-2
  DIR-DATA-06 ──→ GAL-CLEANUP-1
  BND-1 / I18N-1 / 3D-0(独立收尾)
```

跨工作流耦合点:

- **Shot id 锚点**:DIR-DATA-01(服务端契约)与 VID-UI-1(客户端类型)是同一锚点,两侧 schema 必须不漂移。
- **私有媒体通道**:SEC-9(`/api/media`)是 GAL-2 硬前置;SEC-2(越权修复)是 GAL 实施前安全前提。
- **存 Recipe**:IMG-1B/IMG-2 提供入口,PR-1 验收闭环。
- **IMG-1B 转视频执行**:UI/context 载体在 IMG 阶段,实际视频执行验收留 DIR-DATA 阶段。

---

## 附录 B:实现中需注意(conflicts / gaps)

### B.1 冲突(必须在对应包开工前澄清或写成硬约束)

1. **`DIR-5` 悬空 id(排期断链)** — GAL-CLEANUP-1 原 `dependsOn: ['DIR-5']`,但任务包列表无 `DIR-5`(DIR-DATA 工作流用 `DIR-DATA-01..07`)。**修正**:GAL-CLEANUP-1 第二步删除的硬前置改指 **DIR-DATA-06**(clip 全量落 Generation + shot lineage),必要时同时参考 DIR-DATA-03(planner 吸收 video-pipeline 考量)。本文档已在 GAL-CLEANUP-1 与排期表中应用该修正。

2. **IMG-1B 范围 vs mainline 顺序倒挂** — IMG-1B(转视频带语义参考)在 mainline 第 1 顺位,但"转视频走通"隐含依赖 DIR-DATA 阶段(第 3)的 Seedance reference 执行链。**约束**:IMG-1B 只做"携带语义参考切到视频模式的 UI/context 载体"(不触发执行),执行验收留给 DIR-DATA 阶段。已写入 IMG-1B 范围澄清。

3. **StyleCard modelId 软解耦是行为级变更** — IMG-4 把 `compileRecipe` 的 `MISSING_MODEL_IN_STYLE` 从硬抛错改成回退 fallback FAL,改变现有 card-mode 调用方运行时行为(原本必抛错路径现在静默走 fallback)。**约束**:必须在 IMG-4 内显式覆盖测试所有 compileRecipe 调用方能接受回退而非报错,不能当纯松绑处理。已写入 IMG-4 告警。

4. **fal_f5tts 同名歧义** — `AI_MODELS.FAL_F5_TTS`(audio model,被 generate-audio.service/fal.adapter/models.ts AVAILABLE 列表引用)与 `VOICE_CARD_PROVIDER.FAL_F5TTS`(VoiceCard provider)是两个不同对象。VOICE-5 **只删 VoiceCard provider 死分支**,严禁误删 audio model,否则破坏 audio 生成链。已写入 VOICE-5 硬约束。

5. **VolcEngine 进 planner 需多处同步改 + 不得违反 auto 首选 Gemini** — 给 `ADAPTER_CAPABILITIES.VOLCENGINE` 加 `'planner'` 后,`node-planner-route.service` auto 分支 `providerOrder` 必须把 volcengine 追加到**末位**(不得插到 gemini 之前)。VOICE-7 + VOICE-8 必须同时改 capability + providerOrder + CanvasPlannerRouteSelector switch + i18n 三语 setupVolcengine,缺一即半成品。已写入 VOICE-7/VOICE-8。

### B.2 缺口(覆盖不全,需在对应包显式拆解或确认)

1. **lineage 必填 vs DB 只能 optional** — 锁定方向要求 Generation lineage 必填,但高危 Prisma 类型只能加 nullable 列(存量无 lineage 无法 NOT NULL)。**调和**:DB 列 nullable(DIR-DATA-04)+ service 层条件 required(DIR-DATA-05:对"导演台 clip 来源"在 createGeneration 校验层强制要求 lineage)。已分别写入两包。

2. **role → provider payload 端到端** — 类型地基(ReferenceSlotRole)已铺,但需确认 IMG-3 把 role 一路透传到 provider payload(Seedance `image_urls` 的 subject/style 语义),否则语义角色仅装饰。已在 IMG-3 步骤 6 + gap 提醒固化为验收硬项。

3. **CharacterCard↔VoiceCard 软引用落点** — VOICE-4 覆盖 CharacterCard 加 optional `defaultVoiceCardId` 列;Node 角色绑定消费明确留后续 Node 域排期。已在 VOICE-4 gap 填补说明。

4. **route factory 不覆盖二进制/重定向路由** — `image/proxy`、`download`、`generations/[id]/poster`、`node-workflow/upload-reference-video`、`voices/upload-reference` 等返回流/重定向/multipart 的路由不适配现有 JSON factory。SEC-5 显式登记为豁免(报告记"需新二进制 factory,留后续"),`/api/media/[id]`(SEC-9)同样不套 JSON factory。未来若要统一,需单独排「二进制 route factory」包。

5. **StyleCard 贴合检查落点** — 已由 IMG-5 承接(`style-scoring.service` + LLM style system prompt,复用 character-scoring 模式)。gap 已填。

6. **Kling V3 Pro extend endpoint 第一期处置** — `fal-ai/kling-video/v3/pro/extend-video` 在 providers.md L140 标为未被官方文档暴露的本地 model-config fact。第一期 ≤60s/3–6 镜不需要 extend。**处置**:DIR-DATA-07 显式记录"第一期不启用 extend、长视频第二期再验证",并可在 BND-1 文档化。已写入 DIR-DATA-07 步骤④ + BND-1。

---

## 附录 C:X-PROV 官方复核清单(编码前置门)

凡触碰以下内容的包,在编码前必须按 `docs/integrations/providers.md` / `docs/architecture/storage.md` 对照官方文档复核,与本文记录不符先停下 surface:

| 复核项                                           | 关联包                                        | 复核来源                             | 关键待核实点                                                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seedance 2.0 Reference / Fast Reference fal 字段 | DIR-DATA-07(门)→ DIR-DATA-02/03/05、IMG-3     | fal 官方模型页 + providers.md        | `image_urls`/`video_urls`/`audio_urls` 上限、跨模态总 cap(代码假设 ≤12)、duration `'auto'`、resolution 枚举、`generate_audio` 字段名、`@AudioN`/`@VideoN` token 大小写与范围 |
| Kling V3 Pro fal 字段                            | DIR-DATA-07 → DIR-DATA-03/05、IMG-3、VID-UI-8 | fal 官方模型页 + providers.md L140   | t2v/i2v endpoint、duration clamp(3–15)、aspect_ratio 枚举、`cfg_scale`/`negative_prompt`、**extend-video endpoint 未验证(第一期禁用)**                                       |
| 视频模型价格单位                                 | DIR-DATA-07                                   | providers.md L197 + builders.ts 注释 | `cost` 仅平台 allowance 单位非 provider 计费真值;记录已知 fal 计费倍率                                                                                                       |
| reference role → provider 字段映射               | IMG-3                                         | providers.md                         | Seedance subject via `image_urls`、Kling `reference_image_urls`、Veo subject/scene 语义                                                                                      |
| VolcEngine Ark 豆包文本补全                      | VOICE-7、VOICE-8                              | providers.md VolcEngine Ark 段       | doubao chat completions endpoint / model id `doubao-1.5-pro-32k` / 鉴权,与 `volcengineTextCompletion` 一致性                                                                 |
| Cloudflare R2 私有访问                           | SEC-6(门)→ SEC-9/SEC-10                       | R2 官方文档 + storage.md L210-254    | `getSignedUrl` 用法、签名有效期上限、private bucket 支持、CDN(custom domain) 与 r2.dev 关系、proxy vs signed-url 取舍                                                        |
| StyleCard fallback 默认 model/adapter            | IMG-4                                         | providers.md                         | fallback 默认 model/adapter 合法性                                                                                                                                           |
| Ark(Seedance 直连)/ Gemini(Veo 直连)             | —                                             | providers.md                         | **本期不实现**,明确列后续独立包                                                                                                                                              |

---

## 附录 D:未决项(需 owner 拍板,任务包遇到时停下 surface)

1. **VolcEngine 平台 system key** — VOICE-8 沿用现有 `getSystemApiKey` 行为;若要为 VolcEngine 引入平台 system key 强依赖,需 owner 另行决策。
2. **CharacterCard projectId 写路径** — SEC-4 不改 character-card.service 的 projectId 校验(其 create schema 无 projectId,cards.md L463 留作产品确认)。
3. **route factory 二进制扩展** — 是否新建「二进制/流 route factory」统一 `image/proxy`/`download`/`media` 等路由,留后续(SEC-5 登记为豁免)。
4. **存量 public URL 不可逆批量迁移** — SEC-8 仅做 dry-run 枚举;真实批量改写为 owner-gated 破坏性操作,需 owner 确认后单独排期。
5. **ScriptDoc JSON→Prisma 提升** — DIR-DATA-01 / VID-UI-1 先 JSON;触发条件(跨设备协作持久化 / 服务端按 shotId 查询 / 逐镜 status 服务端事务一致性)满足时再单独排提升包。
6. **旧 VideoScript / VideoPipeline 实际下线** — VID-UI-5 与 GAL-CLEANUP-1 均为收敛期标注;真实删除分别由"Board 全链路 e2e 绿"与"DIR-DATA-06 验收"硬条件触发,届时单独排删除 PR(含 Prisma 模型迁移)。
7. **3D 在 Gallery/Profile 是否同级展示、多视角参考/中间 mesh 生命周期** — 3D-0 记为 deferred,冻结期不决策。
