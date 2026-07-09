# 产品主线

最后更新：2026-06-13

本文档是 Personal AI Gallery 后续开发的长期主线。它记录 owner 已确认的产品方向、功能分工和开发取舍。未来涉及产品方向、功能优先级、Studio、图片、视频、音频、3D、画布、素材、公开展示或提示词库的任务，都应在读取 `docs/status.md` 后先读本文档。

本文档不替代代码事实源、不替代 provider 官方文档、不替代具体 task packet。实现前仍必须按项目工作流读取相关 domain / architecture / integrations 文档并检查代码。

## 一句话主线

Personal AI Gallery 是一个以创作控制为核心的个人 AI 创作工作台：先让用户稳定生成、沉淀、管理和复用自己的作品与创作资产，再选择性公开展示。

默认保护的第一主路径是：

```text
选择模型 -> 输入 prompt / 素材 -> 生成 -> 持久保存 -> 管理 / 复用 -> 可选公开
```

当路线冲突时，优先级是：

1. 创作控制和生成成功率
2. 持久归档和可复用资产
3. 模型 / provider / API 正确性
4. Studio 主创作体验
5. Assets / Prompts / Cards / Gallery 的资产化闭环
6. 公开展示和社交扩展

## 产品分层

### 创作层

创作层负责当前正在发生的生成、编辑和编排。

- `Studio image / video / audio`：默认创作工作台。
- `Node workflow`：高级画布编排层，用于角色、声音、脚本、镜头、素材和视频步骤连接。
- `LoRA`：高级模型 / 风格能力，服务创作控制和素材复用。
- `3D`：Studio 下的支线能力，不驱动短期主线。

### 资产层

资产层负责把创作结果变成可管理、可检索、可复用的长期资产。

- `Generation`：所有生成结果的统一数据源。
- `Assets`：私有素材库、文件夹、批量操作、上传、筛选和详情管理。
- `Project`：私有文件夹 / 归类系统，不做公开项目页。
- `Cards`：可复用创作上下文，包括 CharacterCard、StyleCard、BackgroundCard、CardRecipe，以及需要和 Audio / Node 继续确认边界的 VoiceCard。
- `Prompts`：Recipe 模板和 InspirationPrompt 灵感库。

### 展示层

展示层负责用户主动公开的作品呈现。

- `Gallery`：公开作品 feed 和详情页。
- `Profile`：创作者公开主页。
- 公开展示不应反向决定生成链路、资产私有边界或 provider 执行架构。

## 模块主线 / 支线速查

最简记法:**主线 = 这个模块核心是干嘛的;支线 = 它附带的、次要的或暂时不推的部分。** 整体一句话:选模型 → 创作 → 存档 → 复用 → 可选公开;所有模块的核心北极星是——在画布上做长视频。

本速查为 2026-06-13 owner 两轮方向核对后的确认状态,执行任务包见 [`docs/plans/execution-roadmap-2026-06.md`](../plans/execution-roadmap-2026-06.md)。它取代下文「后续媒体方向」里关于「视频第一期场景是角色短片/系列镜头/长视频」「视频中间 clip 何时永久」等原「仍待确认」项的悬置状态(现已确认:第一期系列镜头、clip 全量升格)。

### 创作层

| 模块                | 主线(核心)                                                                          | 支线(次要/支撑)                                                          |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 图片                | 专业图片工作台:选模型→prompt/参考图→生成→存档复用;参考图、StyleCard、结果去向是重点 | 图片编辑套件(放大/抠图/扩图/换背景/风格迁移…),高频进主画布、重型留独立页 |
| 声音                | 角色声音库(VoiceCard):可复用声音人格,给角色配音/旁白                                | Audio Studio 快速试音、出成品音频(TTS)——是入口不是核心                   |
| 视频                | 在画布上做长视频(项目核心);第一期先做「系列镜头」(几个连续镜头、同一角色一致)       | Studio Video:一条 prompt+参考图快速出短片,轻量,不做复杂分镜              |
| 画布 / 导演台(Node) | 把「剧本→分镜→逐镜生成→拼接成片」串成可控流程,是长视频的生产台                      | 本身即视频主线的载体,无独立支线                                          |
| 剧本智能(LLM)       | 把想法/剧本分析成可编辑的分场/分镜,用户确认后再编译成生成计划                       | 更深的台词分析/连续性检查/导演建议,第一期先不做(字段预留)                |
| LoRA                | 还原(来源图一键同款)+ 定制(锁角色身份、改可变层)                                    | 训练/导入自定义 LoRA                                                     |
| 3D                  | 本轮冻结,无主线                                                                     | 从图片/多视角分叉出 3D 模型,只维护不推进                                 |

### 资产层

| 模块              | 主线(核心)                                                            | 支线                                                              |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cards(创作卡)     | 角色卡(保持角色一致)是核心;画风卡/声音卡/背景卡是可复用素材           | 配方卡(组合多卡)有能力但不做独立管理页;角色卡付费精修闭环本轮延后 |
| Assets(素材库)    | 私有素材管理:浏览、上传、文件夹、批量移动/删除/收藏、单资产详情与复用 | 纯管理面,自己不生成                                               |
| Project(项目)     | 私有归类/文件夹,把作品和卡片归类(与「画布工作流项目」是两回事)        | 不做公开项目页                                                    |
| Prompts(提示词库) | Recipe 模板 + 灵感库,从作品存模板、模板到作品的血缘                   | 不执行生成;prompt 增强/助手属 Studio 创作链                       |

### 展示层

| 模块          | 主线(核心)                                | 支线                            |
| ------------- | ----------------------------------------- | ------------------------------- |
| Gallery(画廊) | 公开展示:只展示主动公开的作品 feed + 详情 | 不管私有素材、不管生成执行      |
| Profile(主页) | 创作者公开主页 `/u/用户名`,展示公开作品   | follow/like 等社交,不是主推方向 |

### 次要域(有但不在近期主推)

| 模块               | 主线                                                | 支线                |
| ------------------ | --------------------------------------------------- | ------------------- |
| Storyboard(故事板) | 把已有作品排成有顺序、有文案的故事(长图/漫画式呈现) | 只消费作品、不生成  |
| Arena(竞技场)      | 多模型同题对战 + 投票 + 排名                        | 次要域,不在近期主线 |

一句话:图片/声音各自把专业能力做扎实 → 卡片提供可复用的角色/画风/声音 → 最终在画布上组装成长视频(核心);Assets/Project 管私有,Gallery/Profile 管公开;3D、Storyboard、Arena 是支线。

## 已确认方向

### 图片

图片是主创作入口，也是视频、3D、画布、素材、提示词和风格资产的源头。

图片方向采用：

```text
专业创作者工作台为内核，默认入口保持轻量。
```

具体规则：

- 默认体验温和，只突出 prompt、模型、参考图、比例和生成。
- 专业能力通过 chip / 面板渐进披露，不拆成割裂的新手模式和专业模式。
- 保留经典 prompt 主输入，不恢复复杂 Prompt Composer。
- 参考图是一等能力，贯穿上传、Assets 选图、上一张结果复用、Gallery 复用、卡片和画布节点。
- 生成完成后必须有明确去向：变体、继续编辑、用作参考、转视频、转 3D、存 Recipe、存 StyleCard、发布、放入 Project。
- 图片 Studio 不承担完整素材库职责；批量管理、文件夹、筛选、删除和发布管理仍归 Assets / Project / Gallery。
- 图片执行继续遵守 Worker-first：Next.js 负责 auth、validation、job create、signed dispatch 和 callback finalization；provider 执行、轮询、下载和 R2 入库由 Worker 或受控 runner 负责。

### StyleCard

StyleCard 必须资产化。它不是一次性 preset，而是可复用、可进化的风格契约。

StyleCard 的一致性来自：

- 结构化风格定义：媒介、线条、色彩、光照、构图、质感、镜头、禁止项。
- 参考样张：用于风格提取、人工判断和模型参考。
- 模型适配：推荐模型、兼容模型、不推荐模型、模型专用 prompt 变体。
- 参数快照：比例、负面词、LoRA 栈、seed 策略、参考强度等。
- 结果反馈：好结果回流强化风格卡，跑偏结果可标记为不匹配。

StyleCard 应支持两种应用强度：

- 轻度应用：作为 prompt / 参数增强，适合快速创作。
- 严格应用：带参考图、负面约束、固定模型 / LoRA、参数锁定和风格贴合检查，适合系列图和高一致性生产。

### 声音

声音不是单纯 TTS 输出，而是角色、旁白、视频和画布的可复用声音资产层。

声音方向采用：

```text
角色声音库为核心，旁白 / TTS 是入口。
```

具体规则：

- Audio Studio 负责快速试音和成品音频：旁白、台词、短句试音、角色声音测试。
- 成功音频结果仍然是 `Generation(outputType=AUDIO)`，可进入 Assets、Project、Gallery。
- VoiceCard 是长期声音人格，承载 provider、modelId、voiceId、参考音频、声线描述、语速、音高、情绪倾向、发音词典、试音文本和示例音频。
- Reference audio 需要区分生命周期：一次性参考、VoiceCard 训练 / 克隆素材、Node / video 上游素材。
- Node workflow 是声音发挥长期价值的地方，应支持 `Character -> Voice -> Script -> Shot / Video` 的连接。
- 可以支持“动漫感语气 + 原创稳定声线”；不应把未授权的具体动漫角色或声优复刻产品化。

### VoiceCard

VoiceCard 应保持独立资产身份，同时允许绑定到 CharacterCard。

默认方向：

- 先独立管理声音卡，避免把声音强行塞进视觉角色卡。
- 允许 CharacterCard 引用一个默认 VoiceCard。
- 允许 Node workflow 在角色节点、声音节点和视频节点之间建立显式关系。
- VoiceCard 的一致性来自固定 voiceId、参考样本、发音词典、样本文本、情绪 / 语速参数和生成反馈。

## 后续媒体方向

### 视频

视频不应只是 prompt-to-video。视频主线应围绕角色、镜头、动作、参考图、参考视频、声音和片段连续性展开。

已确认分工：

- `Studio Video` 是默认短片入口，保留温和、直接的体验：通过 prompt、参考图、参考视频、声音和参数快速生成一个短片。
- `Studio Video` 不承载复杂分镜，也不变成小型 Node workflow。它的价值是快、轻、容易把图片或少量素材转成视频。
- `Node workflow` 是真正的视频导演台。长视频、系列镜头、角色一致性、声音绑定、分镜、参考视频和片段合并，都应进入 Node workflow。
- 视频一致性不依赖单一 prompt，而来自 `CharacterCard`、`StyleCard`、`VoiceCard`、镜头规格、参考帧 / 参考视频 / 参考音频和片段连续性的组合约束。

仍待确认：

- 视频中间 clip 何时成为永久资产。
- 声音 / 脚本 / 角色 / 镜头节点如何定义服务端执行边界。
- Node workflow 的第一期视频场景是角色短片、系列镜头还是长视频。

### 画布

画布是高级编排层，不是另一个普通生成模式。

视频方向确认后，画布的第一主场景应围绕导演式视频生产展开：把角色、声音、脚本、镜头、参考图、参考视频和片段合并连接成可控流程。

待确认问题：

- 是否需要服务端 graph execution planner。
- 角色、声音、脚本、参考图、视频片段之间的边语义如何固化。
- 哪些节点输出必须落为 `Generation`，哪些只是 workflow 内部临时状态。

### 3D

3D 保持支线。它可以从图片和多视角素材分叉，但不进入短期主推进范围。

待确认问题：

- 3D 结果在 Gallery / Profile 中是否和 image / video 同级展示。
- GLB、poster、多视角参考图和中间 mesh 的生命周期。
- 3D 是否需要进入 Node workflow，还是保持 Studio branch。

## 资源管理边界

### Assets

Assets 是私有素材库，不是公开展示页。

它负责：

- 私有作品浏览。
- 上传素材。
- 文件夹 / Project 归类。
- 批量移动、删除、公开、收藏。
- 单资产详情、下载、复用、保存 prompt / StyleCard / VoiceCard 等入口。

### Gallery

Gallery 是公开展示层，只展示 owner 主动公开的作品。

它不负责：

- 私有素材管理。
- 项目文件夹。
- provider 执行。
- credit / quota 决策。
- 社交扩张主线。

### Prompts

Prompts 是 Recipe 和灵感库，不是生成执行层。

它负责：

- 从作品保存 prompt 模板。
- 管理用户自己的 Recipe。
- 从 InspirationPrompt clone 为用户模板。
- 展示模板到作品的血缘。

Prompt 增强、助手、翻译、看图描述、守卫等仍属于 Studio 创作链路。

## 近期开发布局

推荐顺序：

1. 固定图片主线：参考图、StyleCard、结果动作和资产去向。
2. 固定声音主线：Audio Studio、VoiceCard、Reference Audio、Node 上游关系。
3. 落地视频 + 画布分工：`Studio Video` 做轻量短片入口，`Node workflow` 做导演式视频生产台。
4. 收紧 Assets / Project 权限与资源生命周期。
5. 再扩展 Gallery / Prompts 的展示和复用体验。
6. 3D 继续保留支线，等主创作链和资产链更稳后再推进。

## 开发规则

- 不为了 UI 包装牺牲 provider/API 正确性。
- 不为了统一抽象把 image / video / audio / 3D 的执行层强行合并。
- 不把 Assets、Gallery、Prompts 的职责塞回 Studio。
- 不把公开展示做成默认主线。
- 不凭记忆修改模型、provider、payload、价格、限制或返回结构；相关实现前必须重新查官方资料。
- 非 trivial 实现前必须确认 task packet。
- 方向不清楚时停止问 owner，不由 AI 自行补完路线。

## Source of Truth

- `docs/product/scope.md`
- `docs/domains/studio.md`
- `docs/domains/cards.md`
- `docs/domains/node-workflow.md`
- `docs/domains/projects.md`
- `docs/domains/gallery.md`
- `docs/domains/prompts.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/integrations/providers.md`
- `src/constants/models.ts`
- `src/constants/models/`
- `src/constants/workflows.ts`
- `src/constants/voice-cards.ts`
- `src/services/generation.service.ts`
- `src/services/generate-audio.service.ts`
- `src/services/cards/voice-card.service.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-12
- Method: owner direction confirmation in discussion, focused documentation inspection, focused code inspection, and official provider documentation lookup for image/audio/video direction.
- Runtime validation: not run; this is a product direction document, not an implementation change.
