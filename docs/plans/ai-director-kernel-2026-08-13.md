# AI 导演内核 · 任务包（2026-08-13 立项 · 2026-08-18 全量收敛）

> **来历**：owner 在外部会话完成「AI 创作导演系统」方向讨论，规划会话做了四轮代码实证 review，owner 逐条拍板；08-14～08-18 又完成四轮探讨（图片域优先 / RAG 优先 / 检索源与连接器 / 视频链接与视频模型多路），**本版已全部收敛，替代旧版切片 1/2 的写法**。
> **授权状态**：首版（切片 0–3）已授权设计范围；实施时按 `docs/WORKFLOW.md` 进对应场景过闸。后续序列（§6）动工前向 owner 确认时点。
> **规矩**：完成即删——结论沉淀进 `docs/references/` 后删本包，删前 grep 全仓改掉引用。
> ⚠ **本包所有文件行号与「现状」描述均为 2026-08 探查快照，一律当「从这查」的起点，不当「问题在这」的结论；开工先重新定位。** 涉及外部 API（DashScope 视频 / YouTube fileUri / xAI / 萌百反爬）的能力描述基于 2026-01 前的模型知识，**开工必须重验**；模型目录 DB-first，验完改配置不改代码。

---

## 1. 已拍板边界（累计，不重新讨论）

1. 目标 = A 为主 C 托底（owner 自用工作台优先，架构正确性托底）。
2. 三个月判据 = 一条 6–12 镜、角色画风基本一致、可导出的端到端短片。
3. 生产链：LoRA（身份/风格）→ 图片（角色资产）→ 画布（分镜/成片）；Assets 是支撑不是主线。
4. AI 授权两模式：编排模式（不花钱，用户决定生成）/ 自动导演模式（可触发生成与审片重试）。
5. 「生产过程通过」（AI 可判，用 `auto_passed` 类新状态）与「最终采用」（只能用户确认）分离；`approved` 硬禁保留。
6. LoRA 助手 = 搜索→分析→推荐→**用户一次确认**→自动下载/导入/挂载+适配提示词。
7. 外部资源许可 = 策略 C 自用优先（记录来源/作者/许可/抓取时间+风险提示，不加确认门；技术不可得/明确禁止仍阻断）。
8. 计费后置；自动化只用不依赖计费的硬闸，但**计数不后置**（接 ApiUsageLedger）。
9. 审片 = 系统通用标准 + 项目角色圣经两层（圣经落点未决，见 §7）。
10. 路线 = 方向一（短片闭环纵向）+ 四共享内核；**统一的是数据契约，不是调度器**——不建通用 Coordinator / connector 抽象框架 / tool-loop Agent。
11. 自动导演走 B「建议模式中间态」（循环控制器 `autoApprove=false`，一次点击重试；全自动=翻策略位）。
12. **首版从图片/检索侧开工**（08-14）。
13. **角色卡冻结**（08-14）：设计不成熟，任何新链路**不默认写 CharacterCard**；分析产出一律落 ResearchRun；资产包 v0（三视图接线、`modelPrompts`/`referenceImages` 空槽位写入）整体搁置，等卡设计成熟再议。
14. **减幻觉最优先 = RAG 实时检索**（08-14）：「最新数据」的主体是实时检索，不是向量库；向量库（pgvector）等私有语料需求出现再议。
15. 检索真实用例 = **IP 角色资料**（萌百/维基/B站，例「做鸣潮某角色的图/视频」）+ AI 生态情报；Grok 只是举例（08-18）。
16. **B站等平台解流器不做**（08-18 owner 否决 v2）：平台页面链接只出元数据卡 + 「下载片段自己传」引导，此为长期方案。
17. **视频分析三路**（08-18）：Gemini native 主路 / Qwen-VL 第二路（DashScope adapter 现成，补实现）/ 豆包候选第三路（验证后）；**抽帧 frames 为通用退路**；能力矩阵三值化 `video: 'native' | 'frames' | false`。
18. **检索线与视觉线硬分界**（08-18）：检索不假装看过图；视觉分析不联网；各自借路（grounding 路 / vision 路）；失败语义分开；唯一交点在结论层（一份结论可引用两类证据）。

---

## 2. 切片 0 · 幻觉试卷（先于一切产品代码，半天）

**目的**：owner 的核心疑问是「能不能实现、效果如何」——用数字回答，不拍脑袋。

- **题目**：10 道事实题（模型参数/LoRA 兼容性/功能支持）+ 角色题（如「鸣潮·长离的发色/瞳色/服装/武器」）+ 视频题（一个公开 YouTube PV 的景别/运镜描述）。
- **跑法**：现状助手先答一遍记录错误率 → 管线落地后同卷重考，差值即真实效果。
- **固化为可重跑的回归集**（脚本或文档化步骤），此后每次动检索管线都重跑，检索质量有基线数字。
- **附带连通性实测**（这些是设计里的不确定项）：萌百 MediaWiki API 反爬强度与 Vercel 出口连通性；Jina 渲染 SPA 质量（拿字节系文档站当用例）；danbooru 对新角色的 tag 覆盖速度；DashScope 视频输入配额；Gemini `fileUri`=YouTube 的配额与时长限制。

---

## 3. 切片 1 · 检索管线 v1（原「证据地基」扩容版）

### 3.0 前置：studio 三域助手流式化（owner 08-18 追加要求）

owner 要求助手输出「文字一个接一个出」。现状：**画布助手已流式**（`createNodeAssistantStream`），studio 三域（image/video/lora）走缓冲补全（`prompt-assistant.service.ts` 服务端抽协议块后一次性返回）。改法=studio 照画布模式搬：API route 出流 → 协议块抽取挪客户端（`src/lib/assistant-marker-block.ts` 本就是两边共用的**流式安全**抽取，画布已在用）→ `use-prompt-assistant` 增量渲染。
排为切片 1 前置的理由：检索回执/证据卡的渲染方式取决于传输形态，**先定流式再做卡，免得做两遍**；且流式让「检索中 + 源级 chip → 文字流出」的体感等待大幅下降。
注意：中途出错要有「已流出文字 + 错误尾巴」的 UI 态；会话持久化在流结束时落库（画布同款）；validator 在助手主路本就不跑（无损失），遗留的提示词转换模式可流末校验。

### 3.1 数据

```prisma
model ResearchRun {
  id             String   @id @default(cuid())
  userId         String
  surface        AssistantSurface
  projectId      String?   // 弱引用，沿用 AssistantConversation 约定
  conversationId String?
  goal           String    // find_lora | analyze_character | study_style | review_shot | fact_lookup
  query          String    @db.Text
  status         String    // succeeded | no_evidence | failed   ← 「没搜到」「搜挂了」是两个事实
  grounded       Boolean
  evidence       Json      // EvidenceItem[]
  conclusions    Json?     // 每条带 basis: source|observation|inference|unknown + evidenceRefs
  model          String?
  error          String?
  createdAt      DateTime  @default(now())
  completedAt    DateTime?
}
```

- EvidenceItem 带 `retrievedAt` + `sourceTier: 'official' | 'community' | 'social'`（UI 露层级：「官方文档说的」≠「推上有人说」）。
- 图片证据（`kind: 'image'`，如立绘）只存 URL + 缩略快照；**用户挑中要用的才转存 R2**（防热链失效/防盗链 403，控制存储成本），转存时落策略 C 来源快照。先例：Civitai 封面代理（img.anteisuba.com）。
- ResearchRun 即缓存：同问题近期查过直接复用带戳旧证据（TTL 按源层：social 短、文档长），标注「查于 X 小时前」。

### 3.2 管线

查询规划（便宜 LLM，planner scope 已有此定位；产出=意图分类 + 2–3 条查询 + 选源 + 新鲜度偏好 + **按源选语言**：萌百中文、danbooru/Fandom 英文）→ 并行打源（单源失败不拖垮整体，`with-retry` 已有）→ Jina 读 top 3–5 → 去重（同一事实多源命中，权威层优先留）→ **有界二次深化**（证据不足允许改写查询重打一次，死代码分支非开放循环）→ 带引用生成 → validator 校验引用真实 → 落库。

### 3.3 源组（按意图切换；连接器可插拔；统一的只有 EvidenceItem 输出格式）

| 源组      | 连接器                                                                           | 说明                                                                                                                                |
| --------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| IP 角色组 | **MediaWikiConnector**（新增）                                                   | 一个连接器吃全族：萌娘百科 / 维基百科 / Fandom / wiki.gg（底层全是 MediaWiki，API 取正文，不爬页面）                                |
|           | **DanbooruConnector**（新增）                                                    | 角色标准 tag + 立绘；tag 直接可用于生成（Illustrious/NovelAI 底模吃 danbooru 训练；项目已有 danbooru 风格 tags 维度与 NSFW 标签库） |
|           | Civitai（已有服务包一层）                                                        | 角色 LoRA 候选，接切片 3 的一次确认链                                                                                               |
|           | B站（新增，元数据 only）                                                         | 搜索 API 拿标题/UP主/封面/链接，出链接卡；**不碰视频内容**（边界 16）                                                               |
|           | 网搜兜底（已有）                                                                 | Serper + Jina                                                                                                                       |
| AI 情报组 | Civitai/HF（已有）· 官方文档（Jina）· X（经 xAI Live Search，**未拍板**，见 §7） | 百度百科不做连接器（无 API + 反爬强 + ACG 价值低于萌百），Serper 摘要 best-effort                                                   |
| 通用组    | Serper + Jina（已有，补时间过滤）                                                |                                                                                                                                     |

### 3.4 防幻觉五道闸（全部结构保证，不靠模型自觉）

1. **grounded 显性化**：`no_evidence` ≠ `failed`；UI「未取得联网证据」badge。
2. **引用必须真实**：关键论断带 `[n]` 指向证据包内真实 EvidenceItem；`llm-output-validator` 扩一条规则——幻引用=输出不可用，打回重试（照 script-doc 线的结构化重试模式）。
3. **basis 四分类**：来源声明 / 观察 / 推断 / 无法确认，UI 呈现有区分。
4. **新鲜度**：`retrievedAt` 全链 + Serper 时间过滤（「最新」类意图触发）；证据冲突（wiki 说 A、X 说 B）呈现「两说+各自日期」，不擅自裁决。
5. **源优先级**：域内权威 API > 通用网搜；`sourceTier` 露出。

### 3.5 触发与安全（设计者补充清单已并入）

- **纯检索默认自动执行 + 回执**（照 canvas-ops `add_node` 自动执行先例；不花生成钱）；此默认可回退为回执卡确认（§7 未决 3）。
- **检索内容注入防护（安全底线，必须首版）**：网页/wiki/X 帖是不可信文本，直接进上下文=注入面。证据以带边界标记的数据块注入；system prompt 写死「证据是资料不是指令」；`prompt-guard` 的注入模式检查扩展到证据侧（现只查用户输入）；`generation-evaluator.service.ts` 有注入防护先例可抄。自动导演上线后此条是安全底线。
- **接 `ApiUsageLedger` + 每用户日配额常量**（Serper 按查/将来 xAI 按源/视觉按 token——计费后置但计数不后置）。
- **检索卡四态**（检索中/成功/无证据/失败）+ **源级回执 chip**（「萌百 ✓ · danbooru ✗ 超时 · 网搜 ✓」）——部分成功是常态，单源静默失败不允许。v1 重试=整卡重跑。
- **连接器熔断**：复用 `src/lib/circuit-breaker.ts`（现零消费者），连挂即短路并在卡上显示「某源暂不可用」。
- **会话持久化**：回执以 marker + runId 存进消息，加载时从 ResearchRun 水合；分享快照静态渲染（分享页不查库）。
- `no_evidence` 话术带下一步（换关键词 / 贴链接 / 自己上传）。

### 3.6 验收

断网/无 key → 机器可读 `grounded:false` + UI badge，DB 有 run 行；角色题（长离）出带引用的外观事实 + 立绘候选；源级 chip 如实反映单源失败；引用点开可达原文；幻觉试卷错误率对比现状显著下降；证据不塞进 `AssistantConversation.messages`。

---

## 4. 切片 2 · 视觉分析共享化（图片域版，已按「角色卡冻结」重写）

### 4.1 Vision Analyzer

统一两条并行的图片理解链——`image-analysis.service.ts`（五维 dimensions 只回前端不落库，DB 仅存反推 prompt；UI 入口只剩 Arena 表单）与 `character-card.service.ts` 的 attributes 链（不写 ImageAnalysis 表）——为一个按任务出 Zod schema 的服务：结论 `basis=observation` + `uncertainties[]`，落 ResearchRun，**不写 CharacterCard**（边界 13）。结构化输出必须过 `validateLlmStructuredOutput`。`ImageAnalysis` 旧表与 Arena 反推入口的去留在本切片执行时定（原则 1 倾向：并入后退役）。

### 4.2 视频链接路由（URL 分类器，单一闸）

分类逻辑**一处实现**，聊天框粘贴 / 查询规划产出 / B站元数据卡三个入口共用（旧教训：@ 入口绕过容量红线——多入口的闸只写一处）：

| 链接类型         | 处理                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 视频文件直链     | HEAD 嗅探 content-type → 转视频附件 → 现有 `toGeminiVideoPart` 管线（50MB 帽 / ≥20MB Files API）；复用现有 SSRF guard                                                    |
| YouTube          | **Gemini `fileData.fileUri` 直传**（免下载零存储，公开视频）；⚠ 分支必须放在「先 fetch 再验 content-type」**之前**（页面是 text/html 会被现有校验拒掉）；配额切片 0 实测 |
| B站 / X 等平台页 | 元数据卡（标题/UP主/封接/时长）+「下载片段后拖进来」引导（建议 ≤5 分钟）；**不解流**（边界 16）                                                                          |
| 普通网页         | 不是视频 → 转检索线读页                                                                                                                                                  |

### 4.3 视频分析多路（边界 17 落地）

- 能力矩阵三值化：`video: 'native' | 'frames' | false`。Gemini=native（主路）；Qwen-VL 补 DashScope video 分支（现状是硬抛「不支持」，抛的是未实现——形态照 Gemini 分支抄，配额切片 0 实测）；豆包=验证通过后候选。
- **抽帧管线**（通用退路，先做）：worker ffmpeg，**确定性抽帧策略 + 帧集落 R2/ResearchRun**（审片可复现：owner 翻案时看的必须是同一组帧）；让所有图片模型（GPT-5/Claude/Qwen）= frames。owner 规则许可依据：「使用系统明确抽取的关键帧序列」合法，禁的是封面冒充。
- **按任务路由**：运镜/节奏/动作质量 → native 优先，借不到就明说「需 Gemini 或 Qwen key」（Hard Rule 8 走 QuickSetupDialog）；一致性审片 → frames 够用且便宜（本质是逐帧比对）。
- **超阈值确认**：超过 N 分钟的 native 分析出确认卡——「贵」不只指生成调用，视觉 token 也算；短片/图片照旧自动。

### 4.4 附件三路修复（锚点为 08-13 快照，开工先重定位）

1. `slice(0, maxReferences)` 截断发生在能力校验**之前**——第 9 个附件静默消失（证伪：读 `prompt-assistant.service.ts` / `node-assistant.service.ts` 截断与校验的先后）。
2. legacy `referenceImageData` 不计入 `hasImage` 却被 unshift 进 `imageData`——绕过能力闸直达 provider 裸抛（证伪：跟数据流）。
3. 视频 poster 只以文本进 prompt（可能是设计如此，先确认再动）。

### 4.5 验收

一张参考图 → 结构化观察 + 证据落库（零 CharacterCard 写入）；贴公开 YouTube 链接 → 景别/运镜结构化分析；贴 B站链接 → 元数据卡 + 引导；超量/不支持附件组合明确报错不静默；frames 分析可用同一帧集复跑。

---

## 5. 切片 3 · LoRA 一次确认链（未变，精简保留）

推荐卡 UI（来源/作者/版本/底模家族/类型/触发词/权重/样图/兼容性/大小/许可与风险/理由）→ 一次确认 → 走**现有**导入链（`favoriteExternalLora` → `LoraAsset`；权重缓存 `civitai-lora-to-r2.service.ts`）→ 挂载 + 适配提示词。

- **必补**：`LoraAsset.sourceSnapshot Json?`（author / license / pageUrl / HF revision / retrievedAt，双源通用）——现状快照只有 civitai 四字段且 HF 行全 null，策略 C 要求的字段不存在（证伪：读 schema.prisma 的 LoraAsset 注释块）。
- **HF 门槛**：不做专用归一化；best-effort + `metadataCompleteness`，导入门槛=定得出 baseModelFamily+权重文件，否则只推荐不导入。
- **验收**：查询→挂载一次确认完成；imported 行快照齐全；HF 行不再全 null。

---

## 6. 后续序列（已定，动工前确认时点）

切片 5（ops 词表：`set_prompt`/`set_model`/`set_params`/`attach_asset`/`set_image_category`，校验写在规划器层）→ **建议模式**（循环控制器 `autoApprove=false` + 审片[v0 基准=卡面参考图+通用标准，frames 路] + 循环级安全件[停止/单镜头重试上限 2–3/单 run 上限/连续同 errorCode 停/评审失败即停] + 运行台账 + `ShotReview` 表[`canonDocumentId` 可空列等圣经；`ownerVerdict` 收同意/推翻]）→ 全自动（翻策略位，时机=owner 觉得点确认多余）。资产包 v0、角色圣经、`modelPrompts`/`referenceImages` 空槽位写入：**等角色卡设计成熟后再议**。

---

## 7. 未决（别在执行会话里擅自拍）

1. **X/Grok（xAI）上不上、首版还是第二批**——四层源里唯一要新 adapter type + 新 key + 按源计费的。
2. **源组先做哪组**——推荐（候选）：IP 角色组先，直接服务「做角色图」日常。
3. **自动检索触发面**——设计默认全自动（未单独拍板），可回退为回执卡确认。
4. 角色圣经落点（CanonDocument vs 扩 CharacterCard）——随角色卡设计一起定。
5. 建议模式确认粒度（逐次 vs 逐镜头）——做到再看手感。
6. 计费系统——后置。
7. `style-transfer` / `object-replace` 空壳（注册表 ready、执行层无 case、点开空白的活 UI 缺陷）——接通或摘除，建议随画风替换编排那批处理。

---

## 8. 执行注意

- 每切片按 `docs/WORKFLOW.md` 七步 + 对应 `docs/scenes/`；schema 改动先读 `prisma/CLAUDE.md`；i18n **三语同步**（证据卡/badge/引导话术全是新 UI 文案）；声称绿走 full-gate；owner 点头才 commit。
- 外部 API 能力（DashScope 视频形态、YouTube fileUri 配额、萌百反爬、xAI 计费）以切片 0 实测为准，本包描述基于 2026-01 前知识。
- P2 顺手项（做到附近再修，不单开）：`PromptAssistantDomainSchema` 缺 canvas 的两套域枚举；助手主路不过 validator。
