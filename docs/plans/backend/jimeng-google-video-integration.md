# 火山方舟 Seedance / Google Veo 3.1 Lite 视频接入与 Studio 体验参考计划

> Last updated: 2026-04-02
> Status: research complete, implementation pending

## 背景

当前仓库已经具备较完整的视频生成抽象：

- `src/services/generate-video.service.ts` 已使用“提交任务 -> 轮询状态 -> 产物落库”的统一流程。
- `src/services/providers/types.ts` 已定义 `submitVideoToQueue` / `checkVideoQueueStatus` 等 provider contract。
- `src/services/providers/fal.adapter.ts` 已覆盖队列式视频模型。
- `src/services/providers/volcengine.adapter.ts` 已存在，说明项目已经有火山系 provider 入口，不需要为 Seedance 另造一条完全独立的后端路径。
- `src/services/providers/gemini.adapter.ts` 目前只有图片生成，没有视频能力。
- `src/constants/models.ts` 已有 `VEO_3`，但当前实现走的是 `fal.ai`，不是 Google 原生 API。
- `studio` 页当前已经形成明确的工作区结构：
  - route: `src/app/[locale]/(main)/studio/page.tsx`
  - image mode: `StudioLeftColumn` / `StudioCenterColumn` / `StudioRightColumn`
  - video mode: `VideoGenerateForm` + `HistoryPanel`

本计划目标已经从“接即梦 CLI”修正为更符合产品的两条主线：

1. 火山方舟 Ark API 接入 `Seedance`
2. Google Veo 3.1 Lite 接入

同时补充一个产品方向目标：

3. 学习即梦的创作型 UI 方法，但不复制它的账号与 CLI 体系

## 目标

- 保持主站的 auth / credits / DB / R2 责任边界不变。
- 继续沿用现有 provider adapter 架构，不引入第二套视频生成流程。
- 为 `Seedance` 选择适合多用户网站的官方 API 路线，而不是消费端 CLI 路线。
- 为视频模型补齐模型级参数约束，不污染现有通用 schema。
- 为后续 `studio` 页改造沉淀一份可执行的“即梦式创作体验”拆解。
- 把所有结论沉淀为后续 `前端` / `后端` thread 可以直接执行的清单。

## 非目标

- 本计划不直接实现代码。
- 本计划不修改 gallery / profile / public page。
- 本计划不把即梦 CLI 做成正式产品方案。
- 本计划不在当前阶段做数据库 schema 迁移，除非实现时出现无法复用 `generationJob.externalRequestId` 的证据。

## 决策摘要

### Seedance

- 当前网站不应继续走 Dreamina CLI 作为主接入方案。
- 当前产品应改为接 `火山方舟 Ark API`。
- 如果当前账号/API 权限还只能稳定使用 `Seedance 1.5 Pro`，可以先按同一 adapter 路线接入 `1.5 Pro`，并为 `2.0` 预留切换位。
- 一旦 Ark 侧 `Seedance 2.0` 权限可用，应直接在现有火山 provider 内切换/扩展，不再引入 Dreamina Runner。

### Dreamina CLI

- 技术上可跑通。
- 但它更像“平台运营工具”或“内部体验入口”，不适合作为面向多用户 SaaS 的正式后端集成层。
- 可保留为研究记录或临时能力验证手段，不建议进入正式产品路线图。

### Google Veo 3.1 Lite

- 可以接。
- 推荐分两步：
  1. 先用现有 `fal.ai` 路径快速上线 `Veo 3.1 Lite`。
  2. 如果后续需要 Google BYOK 或降低对 `fal.ai` 的依赖，再补 Google 原生 `Gemini` 视频 adapter。

### Studio 体验

- 即梦最值得学习的是“创作流程设计”和“视觉层级”，不是登录体系或 CLI。
- 当前仓库的 `studio` 已有不错的工作区骨架，应在这个骨架上做“结果优先、参数渐进暴露”的升级，而不是推翻重做。

## 现状与约束

### 仓库内已确认的适配点

- `src/services/generate-video.service.ts`
  - 已统一处理 job 创建、轮询、成功落库、失败回写。
- `src/services/providers/registry.ts`
  - 新增 adapter 的接入点已经存在。
- `src/services/providers/volcengine.adapter.ts`
  - 是 Seedance 官方 API 最应该复用的接入位。
- `src/constants/models.ts`
  - 现有模型目录已经支持视频模型、`i2vModelId`、`videoDefaults`、`videoExtension`。
- `src/types/index.ts`
  - 当前视频 schema 允许 `duration: 1-10`、`resolution: 480p/540p/720p/1080p`。
- `src/constants/config.ts`
  - 当前全局默认时长为 `5s`，选项为 `3/5/10`。

### 已知不匹配

- Dreamina CLI 是本地状态型集成，不适合网站多用户后端。
- Veo 3.1 Lite 官方支持的是 `4s/6s/8s`，而不是项目当前的 `3s/5s/10s`。
- Veo 3.1 Lite 官方支持的是 `720p/1080p`，而不是项目当前 schema 中的 `480p/540p`。
- `Seedance 2.0` 和 `Seedance 1.5 Pro` 的真实可用模型、权限、价格，受 Ark 账号权限和模型开通状态影响，实施前必须在火山方舟控制台再次核实。
- 视频模型真实成本通常随时长、分辨率、工作流变化，而当前 `ModelOption.cost` 是固定值。

## 当前推荐路线

### 对这个网站的现实建议

1. `Seedance` 走 `火山方舟 Ark API`
2. `Google Veo 3.1 Lite` 先走 `fal.ai`
3. `Dreamina CLI` 从主计划中降级为“实测记录与备选研究”

这是当前最符合产品、运维和多用户边界的方案。

---

## 方案 A：火山方舟 Ark API（Seedance）

### A.1 为什么要从 Dreamina CLI 改为 Ark API

`Dreamina CLI` 的问题不在“能不能跑”，而在“产品抽象不对”：

- 它依赖本地登录态、本地文件和本机任务库。
- 它更像“人在一台机器上使用即梦”的自动化壳层。
- 对多用户网站来说，这会把平台接入错误地建模成“共享一个消费端账号”。
- 每个用户自带即梦账号的多租户实现也会非常复杂，且与 CLI 的本地状态模型不匹配。

`Ark API` 则是正确的服务端抽象：

- 官方开放 API
- 标准提交与查询任务
- 更适合平台统一鉴权、统一扣费、统一落库
- 更适合未来多模型共存

### A.2 官方能力判断

截至 `2026-04-02`：

- 火山方舟已公开 `Seedance 2.0 API 参考官方文档`。
- `创建视频生成任务 API` 文档页最近更新时间为 `2026-02-23`。
- `查询视频生成任务 API` 也已公开。
- 此前官方社区文章已说明 `Seedance 2.0` 上线火山方舟体验中心，并计划开放 API。

因此，当前产品方向应以 `Ark API` 为准，而不是 `即梦 CLI`。

### A.3 推荐架构

推荐结构：

`Next.js 主站 -> Volcengine adapter -> Ark 视频生成 API -> 轮询结果 -> R2 / DB`

职责拆分：

- 主站负责：
  - Clerk 鉴权
  - credits 预扣或扣费
  - generation job 落库
  - 统一调用 provider adapter
  - 成功后将产物写入 R2 和 generation record

- Volcengine adapter 负责：
  - 构造 Ark 视频生成请求
  - 记录外部任务 ID
  - 查询任务状态
  - 规范化响应到现有 `ProviderVideoQueueResult`

### A.4 实施前决策

在编码前先确认这些点：

1. 首发模型到底是 `Seedance 1.5 Pro` 还是 `Seedance 2.0`
2. 当前 Ark 账号是否已开通目标模型
3. credits 是否继续固定计费，还是改成按视频参数动态计费
4. 首发工作流是否只做：
   - text-to-video
   - image-to-video
5. 是否把更复杂的多参考素材 / 多模态混输放到第二阶段

### A.5 账号与模型前置条件

和 Dreamina CLI 不同，Ark API 侧的核心前置条件不是会员，而是：

- 火山方舟账号已实名/可用
- 对应模型已开通
- API key/AK-SK 可正常调用
- 当前区域和产品线已具备视频模型权限

实施前必须做一次“开通核实”：

1. 控制台确认 `Seedance 1.5 Pro` / `Seedance 2.0` 哪些模型已对当前账号开放
2. 记录真实 model ID、支持的工作流和参数范围
3. 用最小请求做一次文本生成视频 API 冒烟测试

如果 `2.0` 尚不可用，则第一阶段直接上线 `1.5 Pro`，但代码结构按 `2.0` 兼容设计。

### A.6 应用层实施清单

### A0. 先复用现有火山 provider

目标文件：

- `src/services/providers/volcengine.adapter.ts`
- `src/services/providers/registry.ts`
- `src/constants/models.ts`

动作：

- 不新增 `Dreamina` adapter。
- 继续使用现有 `VOLCENGINE` / Ark 路线。
- 把 `Seedance` 视频能力挂到现有火山 provider 上。

### A1. 新增或整理 Seedance 模型目录

目标文件：

- `src/constants/models.ts`
- 可选：`src/constants/volcengine.ts`

动作：

- 为火山视频模型补齐明确配置项：
  - `AI_MODELS.SEEDANCE_15_PRO`
  - `AI_MODELS.SEEDANCE_20`
- 每个模型至少声明：
  - `adapterType`
  - `externalModelId`
  - `outputType`
  - `cost`
  - `videoDefaults`
  - `supportsImageToVideo`
  - `supportsMultiReference`（如适用）

建议：

- 不把真实 model ID 散落在 adapter 里。
- 把火山视频模型 ID、工作流名、默认参数集中放进常量层。

### A2. 扩展 Volcengine 视频提交流程

目标文件：

- `src/services/providers/volcengine.adapter.ts`

动作：

- 实现或补强：
  - `submitVideoToQueue`
  - `checkVideoQueueStatus`
- 与火山方舟视频任务 API 对齐：
  - 创建任务
  - 查询任务
- 统一映射状态：
  - `IN_QUEUE`
  - `IN_PROGRESS`
  - `COMPLETED`
  - `FAILED`

要求：

- 不要在 route handler 中拼 Ark 请求。
- Ark API 的字段归一化必须留在 provider adapter 层。

### A3. 统一任务结果与落库

目标文件：

- `src/services/generate-video.service.ts`
- 可选：存储层相关模块

动作：

- 沿用现有 `generationJob.externalRequestId` 保存 Ark 外部任务标识。
- 成功后继续把最终视频进入 R2。
- DB 中保存平台可控的最终 URL，而不是直接依赖外部临时地址。

### A4. 参数与 schema 收口

目标文件：

- `src/types/index.ts`
- `src/constants/config.ts`
- `studio` 相关视频表单组件

动作：

- 不急着把全局视频 schema 改成某个模型专用规则。
- 先做“通用 schema + 模型级二次校验”。
- 每个 Seedance 模型声明自己的：
  - duration 范围
  - resolution 范围
  - aspect ratio 范围
  - 是否支持图生视频
  - 是否支持多模态输入

### A5. credits 策略

可选方案：

1. 第一阶段继续固定 cost
2. 第二阶段再做“按参数动态计费”

建议：

- 第一阶段保持固定 cost，先把模型跑通
- 同时在 backlog 中记录“视频模型动态计费重构”

### A6. 首发能力边界

第一阶段建议只做：

1. `text-to-video`
2. `image-to-video`

第二阶段再评估：

- 多图参考
- 音频参考
- 多模态混合输入
- 长时长扩展

### A.7 验证清单

- Ark 账号可正常调用目标视频模型
- 文生视频成功提交并拿到任务 ID
- 图生视频成功提交并拿到任务 ID
- 轮询正确进入 `COMPLETED`
- 结果成功入 R2 与 generation record
- 非法参数组合能在服务层被明确拒绝
- Studio 中能根据模型切换可选视频参数

### A.8 实施顺序建议

1. 先补模型级视频参数校验能力
2. 在现有 `volcengine.adapter.ts` 上补视频 submit/query
3. 先上线 `Seedance 1.5 Pro` 或当前账号可用的 Ark 视频模型
4. 拿到 `Seedance 2.0` 权限后，再补或切换对应 model config

---

## 方案 B：Google Veo 3.1 Lite

### B.1 路线选择

### 路线 1：先走 fal.ai

这是推荐的最小改动方案。

原因：

- 仓库已有 `fal` 视频 adapter
- 当前 `VEO_3` 就是走 `fal.ai`
- `fal.ai` 已公开 `Veo 3.1 Lite` 的：
  - text-to-video
  - image-to-video
  - first/last-frame-to-video

### 路线 2：走 Google Gemini Developer API 原生接入

这是推荐的第二阶段方案。

原因：

- 可支持 Google 原生 BYOK
- 减少对 `fal.ai` 的中间依赖
- 更贴近官方能力和定价模型

代价：

- 需要补 `Gemini` 视频 adapter
- 需要处理 Google 的 operation polling 与视频下载鉴权

### B.2 路线 1：fal.ai 快速接入清单

### B0. 新增模型定义

目标文件：

- `src/constants/models.ts`

动作：

- 新增 `AI_MODELS.VEO_3_LITE`
- 增加 message key、family label、可选排序位置
- 模型配置建议：
  - `adapterType: AI_ADAPTER_TYPES.FAL`
  - `externalModelId: 'fal-ai/veo3.1/lite'`
  - `i2vModelId: 'fal-ai/veo3.1/lite/image-to-video'`
  - 暂不配置 `videoExtension`

说明：

- 当前已确认 `fal.ai` Lite 支持 text-to-video 与 image-to-video
- first/last-frame 另有独立端点，可作为第二阶段能力，不建议第一版塞进现有单图 schema

### B1. 参数与校验收口

目标文件：

- `src/types/index.ts`
- `src/constants/config.ts`
- 相关 video form 组件

动作：

- 为 `VEO_3_LITE` 加入 model-aware 参数约束：
  - `duration`: `4/6/8`
  - `resolution`: `720p/1080p`
  - `1080p` 仅允许 `8s`
  - `aspectRatio`: `16:9` / `9:16`
- 保持现有全局 schema 不变也可以，但必须在模型级校验中拒绝非法组合

建议：

- 不要为了 Veo Lite 把全局视频 schema 直接改成只支持 `4/6/8`
- 先做“全局 schema + 模型级二次校验”，避免影响其他视频模型

### B2. 成本与 credits

Google 官方定价与 `fal.ai` Lite 页面都说明 Veo 3.1 Lite 是按秒、按分辨率计费。

实施前需要选一个产品策略：

1. 继续固定 credits
2. 引入按参数计算 credits

如果保持第一版最小改动，建议：

- 先给 `VEO_3_LITE` 一个固定 cost
- 同时在 backlog 中记录“视频模型动态计费”重构

### B3. 功能边界

第一阶段建议只做：

- text-to-video
- image-to-video

第二阶段再评估：

- first/last-frame
- 更多 Veo Fast / Standard / Lite 的同族扩展

### B4. 验证

- 文生视频成功提交
- 图生视频成功提交
- 720p / 1080p 约束生效
- 非法 duration / resolution 组合被正确拒绝
- 生成成功后可正常入库、回显和下载

### B.3 路线 2：Google Gemini 原生接入清单

### B5. 补齐 Gemini 视频 adapter

目标文件：

- `src/services/providers/gemini.adapter.ts`
- 可选：拆分为 `src/services/providers/gemini-video.adapter.ts`

动作：

- 为 `Gemini` adapter 实现：
  - `submitVideoToQueue`
  - `checkVideoQueueStatus`

参考官方模式：

- 提交：`POST /v1beta/models/{model}:predictLongRunning`
- 轮询：`GET /v1beta/{operation.name}`
- 下载：使用 `x-goog-api-key` 获取生成视频文件

### B6. Google 模型定义

目标文件：

- `src/constants/models.ts`

建议新增：

- `AI_MODELS.VEO_31_LITE_GOOGLE`

模型配置建议：

- `adapterType: AI_ADAPTER_TYPES.GEMINI`
- `externalModelId: 'veo-3.1-lite-generate-preview'`
- `outputType: 'VIDEO'`
- `timeoutMs: 300_000`
- `videoDefaults` 中写入默认分辨率和时长约束说明

### B7. Google 下载与持久化

Google 原生 Veo 的实现重点不是提交，而是完成后的下载：

- operation 完成后返回视频文件 URI
- 下载该 URI 时需要继续带 `x-goog-api-key`

仓库当前 `ProviderVideoResult` 已有 `fetchHeaders` 字段，因此可以复用：

- adapter 返回 `videoUrl`
- 同时返回 `fetchHeaders`
- 存储层下载远端文件时带上这些 header

这意味着 Google 原生接入不一定需要改动 DB schema。

### B8. Google 参数差异

官方已确认 Veo 3.1 Lite：

- 支持 `Text-to-Video`
- 支持 `Image-to-Video`
- 不支持 `referenceImages`
- 不支持 `video extension`
- 支持 `720p / 1080p`
- 支持 `4s / 6s / 8s`

因此实现时需要：

- 禁止把当前多参考图逻辑映射到 Veo Lite
- 禁止把长视频 extend 流程映射到 Veo Lite
- 在模型能力层显式声明这些限制

### B9. Google BYOK 体验

如果要支持用户自带 Google Key：

- 继续复用现有 `apiKeyId` 机制
- 在 provider guide 中指向 Gemini / AI Studio API key 获取页
- 明确该模型是 paid tier 能力，不能默认假设免费可用

### B.4 Google 推荐顺序

推荐顺序：

1. 先加 `fal.ai` 版 `VEO_3_LITE`
2. 等参数校验与 credits 策略稳定后，再加 Google 原生版

这样可以复用当前视频链路，先把产品能力上线，再决定是否值得为原生 BYOK 增加第二条实现。

---

## 即梦 UI 拆解：如何让当前 studio 更像“舒服的创作产品”

### C.1 先判断即梦到底哪里值得学

即梦当前最值得学的不是“模型品牌感”，而是这几件事：

1. 先给用户“创作结果想象”，再给参数
2. 把模型能力翻译成收益，而不是翻译成技术术语
3. 复杂参数按需展开，不在第一屏压用户
4. 社区与创作是同一条漏斗，不是两个孤立入口

即梦首页能明显看到这些特征：

- 第一屏先讲“灵感即刻成片”
- 用“流畅运镜，生动自然”“从首帧到尾帧，精准掌控”“中文创作，得心应手”这种收益型文案
- 社区内容被当成创作灵感来源

### C.2 当前仓库 studio 的优点

当前 `studio` 不是空白状态，已经有几个很好的基础：

- 页面结构清晰，已经有 image mode 与 video mode 分流
- image mode 有三栏工作区，适合长期创作
- 历史记录、项目、参考图、prompt、生成预览已经是完整工作流
- i18n 和组件拆分也已经比很多竞品更干净

所以正确方向不是“照抄即梦首页”，而是：

`保留你现有的工作区骨架，把视觉重心和交互顺序改得更像创作产品`

### C.3 当前 studio 不像即梦的地方

从体验上看，当前 studio 更像“功能完整的内部工作台”，而不是“创作驱动的产品界面”。

主要原因：

1. 参数入口比结果想象更重
2. 模型选择器偏工具感，偏“数据库浏览”，不够“创作导向”
3. `API route`、高级配置、项目管理等运营型信息权重偏高
4. video mode 还是“表单 + 历史”的组合，缺少强视觉中心
5. 缺少“灵感复用”“推荐起步方式”“场景模板”这类降低起步门槛的层

### C.4 对这个仓库最适合的 UI 升级原则

#### 原则 1：结果优先

用户进入 `studio` 时，第一感受应该是：

- 我能创作什么
- 我现在要输入什么
- 我生成出来会出现在哪里

而不是：

- 我可以配置多少种模型和 provider

这意味着：

- prompt 区和结果预览应该成为视觉中心
- 模型和设置应成为“服务创作”的层，而不是主角

#### 原则 2：渐进暴露复杂度

即梦不是没有复杂参数，而是把复杂参数放在“你已经有创作意图之后”。

落到当前仓库就是：

- 第一屏只保留：
  - mode
  - prompt
  - reference
  - generate
  - current result
- 高级设置折叠到：
  - side panel
  - drawer
  - expandable toolbar

#### 原则 3：收益化文案

不要第一时间对用户强调：

- provider
- adapter
- API route
- technical model ID

要优先强调：

- 适合什么创作
- 输出偏什么风格
- 速度 / 质量 / 可控性的差异

#### 原则 4：把历史和灵感分开

当前 `HistoryPanel` 很重要，但“历史记录”和“创作灵感”不是一回事。

建议后续拆成：

- 我的历史
- 推荐预设 / 最近配置 / 灵感模板

这样更接近即梦“探索即创作前厅”的感觉。

### C.5 对当前组件的具体改造建议

### `src/components/business/StudioWorkspace.tsx`

建议：

- video mode 不再满足于“简单 stack 表单”
- 把视频创作升级成真正的“hero workspace”
- 形成：
  - 顶部轻量模式切换
  - 中央大 prompt / 参考素材 / 生成 CTA
  - 右侧或下方大结果预览
  - 高级设置抽屉

### `src/components/business/studio/StudioLeftColumn.tsx`

建议：

- 保留项目管理，但视觉权重下调
- `API route` 管理不应该作为创作流主视觉区块
- `ModelSelector` 在默认态应先展示推荐模型/最近使用模型，再进入完整列表

### `src/components/business/ModelSelector.tsx`

建议：

- 保留当前强大的筛选和分组能力
- 但默认展示应更“策展化”
- 第一层只展示：
  - 推荐
  - 最近使用
  - 适合写实 / 二次元 / 视频 / 快速预览
- 第二层再打开完整 searchable browser

这会从“工具列表”转向“创作起点”。

### `src/components/business/studio/StudioCenterColumn.tsx`

建议：

- 继续作为创作主轴
- prompt area 要更像画布入口，而不是普通表单 textarea
- generate bar 要更像单一主 CTA，而不是参数控制条

适合补的元素：

- 场景模板 chips
- 风格建议 chips
- 上次成功配置一键复用
- prompt 质量提示

### `src/components/business/studio/StudioRightColumn.tsx`

建议：

- 强化“当前结果是主舞台”
- 不只是把 preview 和 history 摆在一起
- 应让 preview 更像作品查看器：
  - 更大的媒体框
  - 更清晰的 remix / use as ref
  - 更弱化历史列表的噪音

### `src/components/business/VideoGenerateForm.tsx`

建议：

- 这是最应该吸收即梦体验的地方
- 视频创作不该看起来像一张更长的参数表单
- 第一阶段应改成：
  - 顶部：一句清晰价值承诺
  - 中部：prompt + reference + mode
  - 下部：生成按钮 + 关键信息（时长、比例、消耗）
  - 高级参数折叠展开

### C.6 更像即梦的内容层设计

如果后续要让 `studio` 更有“舒服的创作产品”质感，建议补这些内容层：

1. `推荐起步`
   - 例如“广告感短片”“故事片镜头”“角色动效”

2. `一键复用`
   - 不是只有历史记录，而是“复用这次配置继续做”

3. `灵感提示`
   - 给用户一个更容易开始的 prompt scaffold

4. `模型收益标签`
   - 例如“更稳的写实感”“更快预览”“更强运动表现”

5. `结果驱动的下一步`
   - 生成后直接给：
     - 继续扩写
     - 用作参考
     - 生成变体
     - 进入故事板

### C.7 适合当前仓库的最小 UI 改造顺序

1. 先重做 video mode 信息层级
2. 再重做 `ModelSelector` 默认展示逻辑
3. 再把 `API route` / 管理型模块降权
4. 最后补灵感模板与推荐起步

这条顺序能最大程度保留现有架构，又最能快速看到“即梦式舒适度”提升。

---

## Dreamina CLI 实测记录与教训

### D.1 本次实测记录

本次已在 EC2 上完成过一次完整可行性验证：

1. AWS EC2
   - Region: Tokyo
   - OS: Amazon Linux 2023 x86_64
   - 通过 Session Manager 进入实例

2. Dreamina CLI 环境
   - 成功安装 `dreamina`
   - 成功安装 `google-chrome`
   - `dreamina -h`、`login -h`、`import_login_response -h` 都可执行

3. 登录链路
   - `dreamina login --headless` 可启动
   - 终端未稳定渲染二维码字符画，但会保存二维码 PNG 并给出手动导入地址

4. 账号权益实测
   - 非 VIP 账号访问 `dreamina_cli_login` 返回：
     - `ret=3019`
     - `msgDetail=not vip user`
   - 升级后，`standard VIP` 账号可成功返回完整 credential JSON
   - `dreamina import_login_response` 成功
   - `dreamina user_credit` 成功
   - `dreamina list_task` 成功

### D.2 这次真正学到的东西

#### 教训 1：消费端 CLI 能跑通，不代表适合做 SaaS 后端

这是本次最重要的教训。

Dreamina CLI 的问题不是功能不够，而是抽象层错了：

- 它解决的是“一个人如何在一台机器上用即梦”
- 我们要解决的是“一个网站如何为很多用户稳定提供视频生成能力”

这两者不是同一个问题。

#### 教训 2：要尽早区分“能力存在”与“账号可用”

研究外部模型时，要分清三层：

1. 官方有没有这个能力
2. 文档有没有这个能力
3. 当前账号/租户有没有调用权限

这三件事经常不是同一时刻成立。

#### 教训 3：接入层要优先选择正式 API，而不是周边入口

即梦网页、即梦 CLI、体验中心、社区入口都很适合研究体验；
真正适合网站后端的是：

- 正式 API
- 标准鉴权
- 稳定的任务查询语义

#### 教训 4：敏感登录材料绝不能进入聊天、日志或普通文档

本次手动导入链路会产生完整 credential JSON。

这类内容应视为敏感登录材料：

- 不能写进代码库
- 不能写进持久文档
- 不能进普通日志
- 不应在聊天里传播

#### 教训 5：平台账号托管虽然可做，但产品/条款风险要先想清楚

哪怕技术上能用一个即梦账号为全站服务，也不代表：

- 产品上合理
- 条款上允许
- 风控上可长期维持

因此它不应成为默认产品方案。

### D.3 Dreamina CLI 在本项目中的最终定位

保留如下定位：

- 研究记录
- 体验验证路径
- 临时内部工具参考

不再作为当前网站正式视频后端方案。

---

## 风险清单

### Seedance / Ark API

- 当前账号未必已开通 `Seedance 2.0`
- 模型 ID、参数、价格和速率限制可能按租户能力变化
- 当前固定 `ModelOption.cost` 难以准确表达视频参数差异

### Google

- Veo 3.1 Lite 仍是 preview，参数、限额和模型名可能变化
- Google 原生下载流程带鉴权 header，若实现遗漏，最终会卡在下载而不是生成

### Studio 体验

- 如果直接照抄即梦首页，会破坏当前工作区的专业创作能力
- 如果只做视觉皮肤，不改信息层级，体验提升会很有限

## 验证清单

### 代码验证

- 新 model 配置不破坏现有 model selector
- provider registry 能正确路由到新 adapter
- 非法参数组合会在服务层被拒绝
- 成功结果能进入现有 R2 与 generation record 流程

### 产品验证

- Studio 中可以区分不同视频模型的参数范围
- 视频 mode 的首屏更强调创作结果，而不是参数堆叠
- credits 展示与实际策略一致
- 用户看到的错误文案可翻译、可理解

## 实施顺序建议

### P0

- 确认 Ark 账号已开通的 Seedance 模型
- 先补“模型级视频参数校验”能力
- 同时整理 credits 决策

### P1

- 在现有 `volcengine.adapter.ts` 上接入可用的 Seedance 视频模型

### P2

- 上 `VEO_3_LITE` via `fal.ai`

### P3

- 重做 `studio` 的 video mode 体验

### P4

- 如果确定有 Google BYOK 需求，再上 Google 原生 `Gemini` 视频 adapter

## 官方资料

### 火山方舟 / Seedance

- Seedance 2.0 API 参考官方文档：
  - https://www.volcengine.com/docs/82379/1520757
- 查询视频生成任务 API：
  - https://www.volcengine.com/docs/82379/1521309
- Seedance 2.0 上线火山方舟体验中心，API 即将开放：
  - https://developer.volcengine.com/articles/7606009619928449070
- 即梦 AI 携手火山引擎全面开放 API 服务：
  - https://developer.volcengine.com/articles/7546180861461266483

### 即梦体验参考

- 即梦官网：
  - https://jimeng.com/
- 即梦 CLI 体验指南：
  - https://bytedance.larkoffice.com/wiki/FVTwwm0bGiishxkKOoScdHR2nsg
- 官方安装入口：
  - https://jimeng.jianying.com/cli

### Google

- Gemini API 视频文档：
  - https://ai.google.dev/gemini-api/docs/video
- Gemini API 定价：
  - https://ai.google.dev/gemini-api/docs/pricing

### fal.ai

- Veo 3.1 Lite Text to Video：
  - https://fal.ai/models/fal-ai/veo3.1/lite/api
- Veo 3.1 Lite Image to Video：
  - https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video/api
- Veo 3.1 Lite First/Last Frame：
  - https://fal.ai/models/fal-ai/veo3.1/lite/first-last-frame-to-video/api

### 部署参考

- Vercel Sandboxes 概念：
  - https://vercel.com/docs/vercel-sandbox/concepts
