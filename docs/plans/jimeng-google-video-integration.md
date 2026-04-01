# 即梦 CLI 与 Google Veo 3.1 Lite 视频接入计划

> Last updated: 2026-04-01
> Status: research complete, implementation pending

## 背景

当前仓库已经具备较完整的视频生成抽象：

- `src/services/generate-video.service.ts` 已经使用“提交任务 -> 轮询状态 -> 产物落库”的统一流程。
- `src/services/providers/types.ts` 已定义 `submitVideoToQueue` / `checkVideoQueueStatus` 等 provider contract。
- `src/services/providers/fal.adapter.ts` 已覆盖队列式视频模型。
- `src/services/providers/gemini.adapter.ts` 目前只有图片生成，没有视频能力。
- `src/constants/models.ts` 已有 `VEO_3`，但当前实现走的是 `fal.ai`，不是 Google 原生 API。

本计划目标是在不破坏现有架构的前提下，为项目增加两条视频接入能力：

1. 即梦官方 CLI
2. Google Veo 3.1 Lite

## 目标

- 保持主站的 auth / credits / DB / R2 责任边界不变。
- 继续沿用现有 provider adapter 架构，不引入第二套视频生成流程。
- 在最小改动下为视频能力增加新的 provider / model 选项。
- 把所有新接入方案沉淀为后续 `前端` / `后端` thread 可以直接执行的清单。

## 非目标

- 本计划不直接实现代码。
- 本计划不修改 gallery / profile / public page。
- 本计划不引入新的前端交互模式，除非接入所需的参数校验无法复用现有 UI。
- 本计划不在当前阶段做数据库 schema 迁移，除非实现时出现无法复用 `generationJob.externalRequestId` 的证据。

## 决策摘要

### 即梦

- 可以接。
- 推荐方案是“主站 + Dreamina Runner”双层结构。
- 不建议在 Vercel Functions 内直接执行 `dreamina` CLI。
- 需要一台常驻的 Linux x86_64 计算节点保存 CLI 登录态与本地配置。
- 实测发现账号权益存在前置门槛，非 VIP 账号在登录导入链路上会被服务端拒绝。

### Google Veo 3.1 Lite

- 可以接。
- 推荐分两步：
  1. 先用现有 `fal.ai` 路径快速上线 `Veo 3.1 Lite`。
  2. 如果后续需要 Google BYOK 或降低对 `fal.ai` 的依赖，再补 Google 原生 `Gemini` 视频 adapter。

## 现状与约束

### 仓库内已确认的适配点

- `src/services/generate-video.service.ts`
  - 已统一处理 job 创建、轮询、成功落库、失败回写。
- `src/services/providers/registry.ts`
  - 新增 adapter 的接入点已经存在。
- `src/constants/models.ts`
  - 现有模型目录已经支持视频模型、`i2vModelId`、`videoDefaults`、`videoExtension`。
- `src/types/index.ts`
  - 当前视频 schema 允许 `duration: 1-10`、`resolution: 480p/540p/720p/1080p`。
- `src/constants/config.ts`
  - 当前全局默认时长为 `5s`，选项为 `3/5/10`。

### 已知不匹配

- 即梦 CLI 是本地状态型集成，不适合直接放进无状态 serverless。
- Google Veo 3.1 Lite 官方支持的是 `4s/6s/8s`，而不是项目当前的 `3s/5s/10s`。
- Google Veo 3.1 Lite 官方支持的是 `720p/1080p`，而不是项目当前 schema 中的 `480p/540p`。
- Veo 3.1 Lite 的真实成本随 `duration` 和 `resolution` 变化，而当前 `ModelOption.cost` 是固定值。
- 即梦官方 CLI 文档当前未明确写出具体会员档位要求，但实测非 VIP 账号会返回 `ret=3019`、`msgDetail=not vip user`。

## 实施前的共享决策

这些决策应在真正编码前确认，否则实现容易中途漂移：

1. 积分定价策略
   - 继续使用固定 `ModelOption.cost`
   - 还是引入“按时长/分辨率计算”的视频成本规则

2. 上线顺序
   - 先上即梦
   - 先上 Veo 3.1 Lite
   - 还是先做两边共同需要的参数校验和 adapter 扩展

3. Google 路线
   - 快速版：`fal.ai`
   - 原生版：Google Gemini Developer API

4. 即梦运营方式
   - 平台托管账号
   - 还是未来支持平台管理员手动切换 Dreamina 登录态

## 方案 A：即梦 CLI

### A.1 推荐架构

推荐结构：

`Next.js 主站 -> Dreamina Runner -> dreamina CLI -> 即梦任务结果 -> R2 / DB`

职责拆分：

- 主站负责：
  - Clerk 鉴权
  - credits 预扣或扣费
  - generation job 落库
  - 向 runner 发起内部请求
  - 最终 generation 记录持久化

- Runner 负责：
  - 执行 `dreamina` 命令
  - 维护 `~/.dreamina_cli` 登录态
  - 解析 `submit_id` / `gen_status`
  - 查询结果并返回下载地址或下载后的文件

### 为什么不直接跑在 Vercel

- 即梦 CLI 依赖本地状态文件：
  - `config.toml`
  - `credential.json`
  - `tasks.db`
- Vercel Sandboxes 和函数环境都不是这类长期状态型 CLI 的理想宿主。

### A.2 基础设施清单

### A0. 常驻节点

- 选择一台 Linux x86_64 常驻节点。
- 可选宿主：
  - AWS EC2
  - 任何长期在线的 Linux VM
  - 自托管 Linux 主机
- 第一版不建议：
  - Vercel Functions
  - Vercel Sandboxes
  - 纯临时容器

### A1. Runner 环境准备

- 安装即梦 CLI：
  - `curl -fsSL https://jimeng.jianying.com/cli | bash`
- 先确认用于登录的即梦账号具备 CLI 所需权益
  - 当前已验证：非 VIP 账号会在 `dreamina_cli_login` 接口返回业务错误，而不是 credential JSON
  - 当前未从官方文档中确认到“具体需要哪一种会员档位”
- 完成一次 `dreamina login`
- 确认 runner 进程能访问：
  - `dreamina user_credit`
  - `dreamina list_task`
  - `dreamina query_result --submit_id=...`

### A1.1 账号权益前置条件

当前关于账号资格的结论应写死为前置条件，而不是实现细节：

- 官方 CLI 文档和安装页当前没有清晰写明“普通账号 / VIP / 专业版”的精确门槛。
- 但实际调用 `https://jimeng.jianying.com/dreamina/cli/v1/dreamina_cli_login?...` 时，
  非 VIP 账号会返回：
  - `ret: 3019`
  - `msgDetail: not vip user`
- 因此，Dreamina Runner 上线前必须先准备一个已验证可用的账号。

建议流程：

1. 先用网页端确认该账号能正常使用即梦生成能力。
2. 再验证该账号能通过 CLI 登录导入链路。
3. 只有在 `auth_token` 等字段非空时，才继续 `dreamina import_login_response`。

这意味着 Dreamina 接入的真正 blocker 不是机器部署，而是账号权益。

### A2. Runner 安全边界

- 主站与 runner 之间使用内部 token 或 HMAC 校验。
- runner 不对公网开放匿名调用。
- runner 日志不能泄漏：
  - 即梦账号信息
  - 本地配置路径中的敏感内容
  - 失败时的完整登录响应

### A.3 应用层实施清单

### A3. 新增 provider 类型

目标文件：

- `src/constants/providers.ts`
- `src/services/providers/registry.ts`

动作：

- 新增 `AI_ADAPTER_TYPES.DREAMINA_CLI`
- 为其增加默认 `ProviderConfig`
- 增加 API guide 文案，明确这是平台托管能力，不是普通 API Key provider

### A4. 新增 Dreamina adapter

目标文件：

- `src/services/providers/dreamina-cli.adapter.ts`
- 可选：`src/services/providers/dreamina-runner.client.ts`

动作：

- adapter 不直接执行 shell，改为调用内部 runner HTTP API。
- 实现 `submitVideoToQueue`
- 实现 `checkVideoQueueStatus`
- 根据不同工作流把请求映射到 CLI 命令：
  - `text2video`
  - `image2video`
  - `multimodal2video`
  - `multiframe2video`
  - 可选：`frames2video`

建议：

- 不要把“CLI 子命令名”散落在组件或 service 里。
- 为 Dreamina 建一个专用常量模块，例如：
  - `src/constants/dreamina.ts`

### A5. Dreamina 工作流建模

建议不要把所有 CLI 子命令直接暴露成单独 adapter type。

建议做法：

- 保持一个 `DREAMINA_CLI` adapter
- 用 model config 或专用常量描述工作流 profile，例如：
  - `command`
  - `model`
  - `supportsReferenceImage`
  - `supportsMultiFrame`

最小上线版本建议只覆盖：

1. 文生视频
2. 图生视频
3. 多模态视频

`multiframe2video` 和 `frames2video` 放到第二阶段。

### A6. 主站与 runner 的任务协议

建议 API：

- `POST /jobs`
  - 输入：prompt、workflow、duration、ratio、resolution、reference images
  - 输出：`submitId`、`status`

- `GET /jobs/:submitId`
  - 输出：统一状态
  - `IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED`

建议把 CLI 原始字段映射到现有 job metadata：

- `requestId` <- `submit_id`
- `statusUrl` <- runner 查询地址
- `responseUrl` <- runner 结果地址或同一查询地址

这样可以复用当前 `generationJob.externalRequestId` 的 JSON 结构，不必立即改 schema。

### A7. 文件与产物处理

需要确认 runner 最终返回哪一种结果：

1. 返回可下载的结果 URL
2. runner 直接下载文件后上传到 R2，再把 R2 URL 回传给主站

推荐第一版：

- runner 下载结果
- runner 或主站上传到 R2
- DB 中只保存平台可控的最终 URL

理由：

- 即梦结果链接的生命周期和访问策略未必稳定
- 统一进入 R2 更符合当前产品“永久归档”目标

### A8. 前端与参数层清单

目标文件：

- `src/types/index.ts`
- `src/constants/models.ts`
- 相关 video form / selector 组件

动作：

- 为 Dreamina 模型或 workflow 增加可选项
- 收敛参数：
  - CLI 实际支持哪些 ratio / duration / resolution
  - 哪些工作流必须带图
  - 哪些工作流支持多图
- 如果某工作流依赖多张输入图，当前 `referenceImage` 单字段不够，需要在第二阶段评估扩展 schema

### A9. 运营与可观测性

- 记录每次 runner 请求的：
  - workflow
  - submitId
  - 最终状态
  - 总耗时
- 明确处理这些错误：
  - 未登录
  - 登录态失效
  - 账号不具备 CLI 权益，例如 `ret=3019 / not vip user`
  - `AigcComplianceConfirmationRequired`
  - 下载失败
  - CLI 超时

### A.4 Dreamina 验证清单

- 用一个已确认具备权益的账号完成登录导入
- `dreamina -h` 可正常执行
- `dreamina user_credit` 返回正常
- 文生视频提交流程成功拿到 `submit_id`
- 主站轮询到 `COMPLETED`
- 成功写入 R2 和 generation record
- 登录失效时，用户看到安全且可理解的错误

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
- 同时在计划外 backlog 中记录“视频模型动态计费”重构

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

## 风险清单

### Dreamina

- CLI 登录态可能失效
- 平台托管账号可能需要人工合规确认
- 本地状态文件会增加 runner 运维复杂度
- CLI 支持矩阵可能比文档描述更新更快，必须在实现时再次用 `dreamina <subcommand> -h` 核实

### Google

- Veo 3.1 Lite 仍是 preview，参数、限额和模型名可能变化
- Google 原生下载流程带鉴权 header，若实现遗漏，最终会卡在下载而不是生成
- 当前固定 `ModelOption.cost` 结构无法准确表达分辨率/时长差异

## 验证清单

### 代码验证

- 新 model 配置不破坏现有 model selector
- provider registry 能正确路由到新 adapter
- 非法参数组合会在服务层被拒绝
- 成功结果能进入现有 R2 与 generation record 流程

### 产品验证

- Studio 中可以区分不同视频模型的参数范围
- credits 展示与实际策略一致
- 用户看到的错误文案可翻译、可理解

## 实施顺序建议

### P0

- 先补“模型级视频参数校验”能力
- 同时整理 credits 决策

### P1

- 上 `VEO_3_LITE` via `fal.ai`

### P2

- 上 Dreamina Runner + Dreamina adapter

### P3

- 如果确定有 Google BYOK 需求，再上 Google 原生 `Gemini` 视频 adapter

## 官方资料

### 即梦

- 即梦 CLI 体验指南：
  - https://bytedance.larkoffice.com/wiki/FVTwwm0bGiishxkKOoScdHR2nsg
- 官方安装入口：
  - https://jimeng.jianying.com/cli
- 官方 CLI skill：
  - https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta/SKILL.md

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
