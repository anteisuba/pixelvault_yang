# 画布详情体 GAP 群 · 分阶段端到端实现计划

> 2026-06-20。范围:把「Node 导演台」详情面板(声音/角色/背景/视频)此前因「缺后端字段/管线」而省略的全部 GAP **由 Claude 端到端实现**(prisma / Zod schema / constants / service / worker / provider adapter / hook / UI / i18n / test 全套)——owner 改口不再分 Codex,本计划再次覆盖 `feedback-ui-on-claude`。
>
> 依据:workflow `canvas-gap-endtoend-plan`(6 路后端调研 + 综合)。所有断点行号为调研当时的事实,实现前以代码现状为准。
>
> **状态(2026-06-20):** 决策 ①(扩后端 emotion enum)②(Phase 1 起逐阶段)③(B1 先占位)已拍板。**✅ Phase 1(V1 语速/音量 + V2 emotion + G3 negativePrompt)已完成并通过全量验证(tsc 0 / lint 0 / 2596 测绿)。** pitch 确认 Fish 不支持 → 不做。剩 Phase 2-6。

---

## 0. 已确证的硬事实(非「待验证」)

| 事实                                                                                                                                                   | 影响                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `NODE_STUDIO_VOICE_EMOTIONS`(none/calm/**angry/sad/surprised**) ≠ `AUDIO_EMOTIONS`(none/calm/**excited/whisper/narration/dialogue**),仅 none/calm 交集 | V2 阻塞前置,emotion 集要么迁就后端要么加映射 → **决策点 ⑤** |
| Fish Audio S2 prosody 只有 speed / volume / normalize_loudness,**无 pitch**                                                                            | 语调(pitch)全栈空缺 → 建议删/标灰,**非实现项**(决策点 ⑤b)   |
| 视频 `negativePrompt` 下游(schema/service/worker)全通,只断在 hook `use-node-media-generation.ts` 不读 advancedParams                                   | G3 = 单点修复,S                                             |
| `--node-amber: #8c8a82` 颜色值已中性,只是 127 处命名债                                                                                                 | amber pass = 命名重构,非颜色债                              |
| `GenerateVideoRequestSchema`:`referenceImages.max(3)`、无 `seed`、无 `generateAudio`、`negativePrompt` 已有                                            | G4 需放宽 cap;G1/G2 需加字段                                |

**需先 spike 验证的未知(会卡 GAP):**

- **G2 seed**:fal 各视频端点(Seedance20/Reference/Veo31/KlingV3Pro/LTX23)+ volcengine ark video 是否接受 `seed`——仓内零证据,盲发可能 400。
- **B1 环境音**:现有 audio model 全是 TTS;非-TTS 声效生成(ElevenLabs `/v1/sound-generation`)本仓未接,需 spike 证明能出环境音。

---

## 1. 逐 GAP 卡片

### V1 — 语速 / 音量(voiceSpeed / voiceVolume)

- **目标**:声音详情加 speed/volume 滑块,值真正进 Fish TTS prosody。
- **改动层**:`node-workflow.ts` 加 2 optional 字段;`node-studio.ts` 复用 `audio-options.ts` 的 `TTS_SPEED_RANGE/TTS_VOLUME_RANGE`;`use-node-media-generation.ts`(audio 分支 ~L302)补转发 **← 唯一断点**;`StudioNodeWorkbench` audio 分支(~L873)读 node.data 传 generate;`VoiceDetailBody.tsx` 加滑块(照搬 `StudioAudioParams.tsx`);i18n ×3;test。
- **可行性**:✅ 零未知(Fish prosody 已在 Studio 生产用)。
- **工作量 S** · 风险低(仅 `node-workflow.ts`,非 `index.ts`)。

### V2 — emotion 进入生成(含常量对齐)

- **目标**:已存的 emotion 选择真正进生成(现在存了不用)+ 修两套常量不一致。
- **阻塞前置**:决策点 ⑤(方案甲:画布改用 `AUDIO_EMOTIONS` / 方案乙:加映射层)。
- **改动层**:`VoiceDetailBody` emotion chips 换数据源;`use-node-media-generation` 加 `emotion?`;`StudioNodeWorkbench` audio 分支用 `AUDIO_EMOTIONS.includes()` 守卫(非法/none/空→不传);`voiceEmotion` **保持 string 不收窄**(防旧值反序列化失败);i18n。
- **可行性**:✅ 后端 `emotion: z.enum(AUDIO_EMOTIONS)` 已就绪,service `applyAudioStylePrompt` 把 emotion 注成 prompt 前缀(Fish 无独立 emotion 字段,前缀注入是唯一正确做法)。
- **工作量 S** · 与 V1 共用 5 文件,**同批落**。

### V-pitch — 语调(建议不做)

- ❌ Fish prosody 确证无 pitch;`VoiceCardRecord.pitch`(low/medium/high)是卡元数据,未进 provider。硬上=造死字段。
- **建议**:草稿删 / UI 标灰(对齐 baseline §5.1「不兼容标灰」)。**owner 决策,非实现项。**

### G3 — negativePrompt 提交被丢(视频)

- **目标**:修 hook 层静默丢弃。
- **改动层**:`use-node-media-generation.ts` **L272-285** video 分支不读 advancedParams → 加扁平 `negativePrompt?`,`submitVideoAPI` 带上;`StudioNodeWorkbench` L878-894 用已读出的局部变量传入。下游(schema L396/service/worker/`applyNegativePrompt`)全 ready。
- **可行性**:✅ 零未知。**工作量 S**(单文件主改)。

### G1 — generateAudio per-node 覆盖(视频)

- **目标**:视频节点加 audio 开关,覆盖当前只读模型默认的 `generate_audio`。
- **改动层(9 层 additive)**:`node-workflow.ts` 加 boolean;`src/types/index.ts` `GenerateVideoRequestSchema` + `WorkerVideoProviderInputSchema`(L1301)各加 **← 唯一触 333-core,纯 additive**;`generate-video.service.ts` providerInput(L250-278);`workers/execution/src/index.ts`(接口 + `parseWorkerRunContext` L713 readBoolean);`fal/video-request-builders.ts`(5 个 build 函数 `providerInput.generateAudio ?? readDefaultBoolean(...) ?? true`);hook/workbench 转发;`VideoComposer.tsx` detail 加 toggle;i18n;test。
- **volcengine**:`buildVolcEngineVideoQueueBody` 现只读默认值,但 volcengine video 路径当前不 reachable(`canSubmitVideoViaExecutionWorker` 只放行 FAL)→ 后置「铺未来线」。
- **可行性**:✅ fal 支持(夹具已证)。需验证(非阻塞):`video-model-capabilities` audio 能力位驱动 UI 显隐(缺则全模型显示);Seedance reference 模式自动 audio 下的开关语义。
- **工作量 M** · 风险中(触 index.ts + worker schema,均 additive)。

### G2 — seed(视频复现,全链路从零)

- **目标**:视频加 seed 复现。
- **改动层**:同 G1 同构(node-workflow / index.ts ×2 schema / service / worker index + builders / volcengine adapter `buildVolcEngineVideoQueueBody` + `ProviderQueueSubmitInput` / hook / workbench / VideoComposer seed 输入 + 骰子 / i18n / test)。
- **⚠ 阻塞未知**:fal 各视频端点 + volcengine ark video 的 **seed 支持矩阵**仓内零证据 → **Phase 0 spike 逐端点核对官方 schema,不支持的端点 UI 标灰/不发**。另:复现闭环是否回写 `Generation.seed`(决定是否触 prisma/callback)需验证。
- **工作量 L** · 风险中-高(provider 能力未验证)。

### G4 — per-asset @token + count/cap(视频参考)

- **目标**:族名 chip 升级为 `@I1/@V1/@A1 + N/cap`,放宽 schema 让 Seedance 9 张图可达。
- **真实瓶颈**:builder 内部已允许 9(`Math.min(9, maxImages)`),但 `src/types/index.ts` `referenceImages.max(3)`(L365)在入口砍到 3 → **放宽到 9**(触 333-core 但放宽=向后兼容)。
- **改动层**:constants 加 per-kind cap + @token 前缀(image 用 per-model `getReferenceCapabilityMax`);`use-video-composer.ts` referenceKinds(L100-110)升级为 per-asset(复用 `node-workflow-graph.ts:279` `summarizeUpstreamSeedanceReferences`);`VideoComposer.tsx` 两处 chips 改渲 @token + N/cap + 超 cap 标灰;i18n;test。
- **可行性**:✅ provider 早 ready。需验证:放宽 `.max` 后 grep 确认无其它路径把「最多3」当硬契约。**决策点 ⑦**:@token 编号按 kind 分组 vs 全局连号,需对齐 builder 侧 `@Image`/`@Audio1` 命名。
- **工作量 M** · 风险低(仅改一个 `.max` 数字)。

### C1 — 角色音色集 picker(character ↔ voiceCard 绑定)

- **目标**:角色详情加可编辑「音色集」picker,声音节点继承角色音色(替换当前只读 boundVoice 绿框)。
- **数据建模(决策点 ⑥)**:MVP(纯 `node.data.voiceCardId` 等 4 字段,不碰 prisma)/ 完整(+ prisma `CharacterCard.defaultVoiceCardId String?` 软引用 + `CharacterCardRecord`/`UpdateCharacterCardSchema` additive + service/mapper 透传)。
- **编排核心**:`StudioNodeWorkbench:874` `audioVoiceId` 现只读 `node.data.voiceId` → 改为 resolve VoiceCard;**需新增反向遍历 `getDownstreamCharacterNodes`**(现仅单向 `getUpstreamNodes`;edge 是 voice→character);无 character 时 fallback 自身。
- **复用**:VoiceCard 实体 + `voice-card.service` + `use-voice-cards` + api-client 全就绪。
- **可行性**:✅ 复用面大。需验证:reactflow edge 方向稳定性(用户可能 voice 直连 video,须 fallback);`character-cards/[id]` PATCH 是否白名单字段。
- **工作量 M(MVP)/ M-L(完整)** · 风险中(触 index.ts additive + 可能 prisma + 新图遍历需测试护栏)。

### B1 — 背景环境音 / 氛围(最重,provider 未知)

- **致命前提**:现有 audio model 全是 TTS,把「雨声」prompt 喂 TTS 只会朗读这俩字 → **必须接真正的 text-to-audio/SFX**。
- **三路径**:
  - (i) 背景节点双口(image+audio):破坏 `NODE_MEDIA_KIND_BY_NODE_TYPE` 单值契约(49 文件引用)。**L,高危,不推荐。**
  - (ii) 独立 `ambientAudio` 节点(kind=audio,符合单值结构,零破坏):复用整条 audio 管线;新 adapter 方法 `/v1/sound-generation` + 新 `AI_MODELS` 条目(**触 models.ts 99 files CRITICAL**)。**M(+provider M-L)。推荐完整方案。**
  - (iii) 诚实占位(detail 加 disabled「环境音·待接入」+ i18n):**S,零风险。推荐即时止血。**
- **⚠ 最大闸门**:Phase 0 spike 先证明 ElevenLabs sound-generation 能出环境音(仿 comfy-runner「本地证明先行」)。
- **工作量**:(iii) S / (ii) L / (i) L+高危。

---

## 2. 公共地基(先做,多 GAP 共用,避免多轮改同一处)

- **P0-A · node.data 字段统一批次** — `node-workflow.ts` `NodeWorkflowNodeDataSchema` 一次加全部 optional(passthrough 自动持久化,先例 resolution/aspectRatio/negativePrompt L164):`voiceSpeed/voiceVolume`(V1)、`seed/generateAudio`(G1/G2)、`voiceCardId/voiceCardName/inheritVoiceFromCharacter/defaultVoiceCardId`(C1)、`ambientPrompt/ambientIntensity`(B1 若做);`voiceEmotion` 保持 string。**唯一动 types 目录的批次,集中 grep。**
- **P0-B · hook input 统一扩展** — `use-node-media-generation.ts` `NodeMediaGenerationInput` 一次加 audio(`speed/volume/emotion`)+ video(`negativePrompt/generateAudio/seed`),对应分支批量补转发。**所有 GAP 的接线热点都在这一文件。**
- **P0-C · workbench 编排统一接线** — `handleGenerateMediaNode`(L700-894)audio + video 分支一次补全;C1 改 audioVoiceId resolve + 反向遍历。
- **P0-D · video schema + worker 统一扩展**(G1/G2 共用)— `index.ts` 两 schema + `generate-video.service` + worker index/builders 一次加 `generateAudio/seed`。**唯一触 333-core 的视频批次,全 additive。**
- **P0-E · emotion 常量对齐裁决**(V2 阻塞,决策点 ⑤)。
- **P0-F · i18n 三文件同步纪律** — 每 GAP 的 label 一次进 en/ja/zh,防 completeness 测试红。

---

## 3. 分阶段路线图

| Phase                         | 含             | 为什么这个顺序                                                                                 | 关口                                                                     |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **1** 纯接线(低风险高价值)    | V1 + V2 + G3   | 后端全 ready 只断 hook/编排一环;零 provider 未知;不碰 worker/prisma/models。打通 P0-A/B/C 一半 | lint/build → vitest(VoiceDetailBody/hook/守卫)→ 手验真实 Fish 输出       |
| **2** video additive 批次     | G1 + G4        | 集中动 333-core 一次(全 additive / 放宽 .max);能力已 ready                                     | + **全量 vitest**(动 index.ts 防漂移)→ 手验 audio 开关 + 9 张图 + @token |
| **3** G2 seed(单拆)           | G2             | 唯一被 provider 未知卡住,**Phase 0 先验证 fal/volcengine seed 矩阵**,不验证不实现              | spike → vitest(仅白名单端点发 seed)→ 全量 → 手验同 seed 一致             |
| **4** C1 角色音色集           | C1             | 唯一需 prisma migration + 反向遍历 + 域边界未定;前序建好护栏后做                               | migration dry-run → vitest(遍历/继承/service)→ 全量 → 手验继承+覆盖      |
| **5** amber 命名 pass(可并行) | 12 文件 127 处 | 值已中性,命名债;与 GAP 文件几乎不重叠                                                          | 逐文件 grep 递减 → 归零后删 token → **visual.spec diff 应为空**          |
| **6** B1 环境音(最重)         | B1             | 唯一需新 provider + 触 models.ts(99) + 最大未知                                                | 即时落 (iii) 占位;完整 (ii) 以 ElevenLabs spike 为闸门                   |

---

## 4. 需要 owner 拍板的决策点

1. **B1 环境音范围** — 推荐分两步:即时 (iii) 诚实占位止血,完整走 (ii) 独立 ambient 节点(非 (i) 双口)且以 spike 为前置闸门。
2. **整体优先级** — 推荐按路线图从 Phase 1 起逐阶段做(每阶段验证+汇报)。
3. **provider 未知** — 不卡:V1/V2/G1/G4(已证);卡 G2(seed 矩阵)、B1(声效 provider)→ 必须 spike;pitch 确证不支持 → 删/标灰。
4. **amber 手法** — 推荐「逐处替换」(124 处按语义分流到 edge/focus-ring/muted 三个 token,机械 sed 会混色),不改 token 值。
5. **【V2 阻塞 · 立即拍板】emotion 常量对齐** — 推荐**方案甲**:画布 emotion chips 改用 `AUDIO_EMOTIONS`(none/calm/excited/whisper/narration/dialogue),删 `NODE_STUDIO_VOICE_EMOTIONS`;否则 angry/sad/surprised 被 z.enum 拒。代价:声音详情的情绪集从草稿的 沉稳/愤怒/悲伤/惊讶 变成后端支持的 兴奋/耳语/旁白/对白。
6. **C1 数据建模** — MVP(纯 node.data 不碰 prisma,先 ship)vs 完整(+ prisma 持久化默认音色)。
7. **G4 @token 编号** — 按 kind 分组(@I1/@V1/@A1)vs 全局连号,需对齐 builder 侧 `@Image`/`@Audio1`。

---

## 5. 推荐第一阶段

**Phase 1:V1(speed/volume)+ V2(emotion)+ G3(negativePrompt)。**

理由:① 零 provider 未知(全链路已证 ready,只缺 hook/编排一环);② 价值高可见(消除「画了滑块/选了情绪/填了负向词点了没反应」);③ 风险最低(仅 `node-workflow.ts` + hook + 编排 + VoiceDetailBody,不碰 worker/prisma/models/provider);④ 一次打通 P0-A/B/C 一半,Phase 2+ 复用;⑤ V1+V2 同文件协同(5 文件覆盖)。

**唯一前置**:决策点 ⑤(emotion 对齐,30 秒拍板)。G3 无前置,可并行。
