# Enhance 域 — 超分与画质增强（施工基准）

> owner 于 2026-09-06 确认。本文是「视频超分 + 图片 Topaz 超分」的唯一规格来源。
> 模型接入流程见 [`../../scenes/new-model.md`](../../scenes/new-model.md)，schema 变更流程见
> [`../../scenes/db-migration.md`](../../scenes/db-migration.md)，画布节点造型见
> [`../pages/canvas-video-card.md`](../pages/canvas-video-card.md) 与
> [`../pages/canvas-image-card.md`](../pages/canvas-image-card.md)。

## 0 · 域定义

Enhance 域负责**把一段已存在的媒体变清楚**：接收一个已完成的视频或图片，调用超分/修复模型，产出一个**新的**媒体产物并记录它与源产物的血缘。

- **负责**：源媒体准入校验、超分模型路由与参数契约、执行编排、结果归档、血缘记录、计价档位。
- **不负责**：文生视频 / 图生视频的生成本身（归 Studio 与画布视频域）、素材浏览与整理（归 Assets）、公开展示（归 Gallery）、prompt 规划。
- Enhance **不是一个新页面**，它是画布节点上的一个动作；产物回流 Assets 的路径与其它 Generation 完全一致。

## 1 · 能力与边界

- 源视频有两个来源，都支持：站内已生成的视频，以及用户上传的视频。二者在增强链路上是同一件东西——一个已归档的视频产物。
- 源视频准入边界：**时长 ≤ 60s、体积 ≤ 200MB、容器 MP4**。三项均由服务端校验，客户端提示只是前置便利，不作为准入依据。
- 输出上限 **4K**。
- 图片增强不改变现有默认档；Topaz 是并列新增的「高保真」档。
- 超出边界的源媒体不进入增强链路，按真实原因拒绝，不静默降级到低档模型。

## 2 · 入口与交互

- **唯一入口**是画布视频节点工具条上的「增强」动作。触发后产出一个**新的视频节点**，并从源节点向它连一条边——增强结果是下游产物，不是对源节点的原地覆盖。
- **上传场景**走视频节点空态的「上传视频」。上传完成后该节点即是一个合法的可增强源节点，与站内生成的视频节点没有区别，因此上传路径不需要第二套增强入口。
- 源节点在增强运行期间保持可用，不被锁定；新节点自身走视频卡既有的「生成中 / 失败 / 就绪」态，不伪造进度百分比。
- **本期不做的入口**：资产库详情页、Studio 视频工作台。二者若要接入，属于后续切片，不在本规格内。
- 图片 Topaz 档不新增入口，它出现在现有图片编辑的 upscale 档位选择里。

## 3 · 模型与参数契约

三个模型全部走 fal，全部使用 **BYOK 的 fal key**。缺 key 时按 Hard Rule 8 路由到 `QuickSetupDialog` 内联配置，**不禁用 UI**。

### 3.1 视频 · Topaz Proteus（默认稳档）

- endpoint：`fal-ai/topaz/upscale/video`
- 请求字段：`video_url` · `model` · `upscale_factor` · `target_fps` · `H264_output`
- 输出：`video` File
- 价格量级：约 $0.20 / 10s @1080p

### 3.2 视频 · SeedVR2（生成式修复档）

- endpoint：`fal-ai/seedvr/upscale/video`
- 请求字段：`video_url` · `upscale_mode` · `upscale_factor` · `target_resolution`（`720p` / `1080p` / `1440p` / `2160p`）· `output_format`
- 输出：`video` File + `seed`
- 价格量级：$0.001 / 百万像素，像素量按 宽 × 高 × 帧数 计

Topaz Proteus 是默认档：它保真、可预期。SeedVR2 是生成式档：它会重建细节，适合源画质差的素材。Starlight 与 Astra 本期不放。

### 3.3 用户可调参数只有两项

| 参数       | 取值            | 说明                                        |
| ---------- | --------------- | ------------------------------------------- |
| 目标分辨率 | 1080p / 2K / 4K | 映射到各模型自己的 factor / resolution 字段 |
| 插帧       | 关 / 60fps      | 映射到 `target_fps`；不支持的模型不渲染该项 |

其余字段一律取模型默认值，不暴露给用户。参数与模型能力的对应关系由模型配置声明；模型不支持的参数**不渲染**，不做置灰。

### 3.4 图片 · Topaz（高保真档）

现有 upscale 分支（`src/services/image/image-edit.service.ts` 的 `resolveUpscaleModel` / `upscaleImage`，当前是 fal Aura SR 4x 与 Clarity 2x）**新增**一个 Topaz 档：

- endpoint：`fal-ai/topaz/upscale/image`
- 请求字段：`image_url` · `model`（默认 `Standard V2`）· `upscale_factor`（1–4）· `output_format` · `face_enhancement`
- 输出上限 512MP
- 价格量级：≤24MP $0.08 · ≤48MP $0.16 · 512MP $1.36

它作为「高保真」档与现有两档**并列**，不替换默认档。

## 4 · 数据模型与血缘

- 增强结果是一条**新的 Generation**，与普通生成产物同构：同样归档到 R2、同样回流 Assets、同样可继续参与画布连线。
- 新增列 **`Generation.sourceGenerationId`**：可空的自引用外键，指向被增强的源 Generation。它是本域唯一的血缘事实，读它就能回答「这段视频是谁的增强结果」。
- 图片 Topaz 档同样写这一列——血缘不区分媒体类型。
- owner 已授权本任务执行这一次 migration。存量行该列为空，不回填。
- 不在 `Generation` 上再堆增强专属的参数列；增强的输入参数走既有的 `snapshot`。

## 5 · 计费

- **不新增计价层**。增强复用现有 `cost` 机制。
- 按输出分辨率两档静态 `cost`：**1080p 一档**，**2K / 4K 一档**。
- `cost` 是平台额度单位，不是 provider 计费真值；§3 的价格量级只用于选型与档位定价的判断依据，不进入运行时。
- BYOK 用户走自己的 fal key，不受这两档影响。

## 6 · 运行时与上传

### 6.1 视频走 worker-only 异步范式

- 视频增强**只**走执行 worker：Cloudflare Workflows 的 fal queue + webhook 回调。**不走 Vercel 同步路径**——超分是分钟级任务，同步路径没有容纳它的时间预算。
- 超分模型有**自己的 timeout（30–60 分钟量级）与 maxAttempts**，通过 per-run 的 `timeoutMs` / `maxAttempts` 传递（`src/services/generate-video.service.ts:275` 已按 per-run 传 `timeoutMs`，`maxAttempts` 当前写死默认值，本域要求它同样按模型可配）。默认的 10 分钟窗口对超分是必然超时。
- worker 把视频回存 R2 的实现改为**流式或 multipart**：`workers/execution/src/index.ts` 的 `downloadAndUploadVideoArtifactToKey`（约 3157 行起）当前先 `await response.arrayBuffer()` 再整块 `put`（约 3185 行），4K 长视频会把整个文件读进 Worker 内存。这条是视频增强的**硬前置**。

### 6.2 图片沿用同步路径

- 图片 Topaz 档继续走现有同步编辑路由，**必须在 `src/app/api/image/edit/route.ts:15` 的 `maxDuration = 120` 内完成**。
- 若某个尺寸/参数组合无法在这个预算内返回，该档在那个组合下**标记为不可用**，给出真实原因——**不因此改动路由形状**，不为一个档位把图片编辑整条链改成异步。

### 6.3 上传

- 新的视频上传路径是**预签名直传 R2**，请求体不经过 Vercel 函数。
- 服务端校验时长、大小、格式（§1 的三项边界）；校验通过后才建立 Generation 并成为可增强的源节点。

## 7 · 实现约束

这两条是已核实的现状阻碍，实现时必须正面处理，不能绕。

### 7.1 没有 video-to-video 的输入通道

现有 `videoUrls`（`src/types/index.ts:606`）**是 Seedance 参考素材语义**——最多 3 段、总时长 2–15s、总计 ≤50MB，只被 Seedance reference-to-video 端点消费。它表达的是「参考这几段的运镜/风格」，不是「把这一段变清楚」。**不能复用**：复用会让容量上限、语义和计价三处同时说谎。

需要新增一个**源视频字段**，并沿依赖关系一路贯通：schema（Zod）→ service → `WorkerRunContext` → worker 的 payload builder。这是 Hard Rule 6 的分层实现，任何一层缺口都会让请求在 worker 里 500 而不是在入口 fail fast。

同时，`WORKER_CAPABLE_VIDEO_ADAPTERS`（`src/services/generate-video.service.ts:64`）的注释已经说清楚：在那里登记只是一半，worker 必须有匹配的 `submitProviderQueue` / `pollProviderQueue` 分支。超分模型要么复用 fal 分支的既有序列化，要么显式补分支，不能只加名册项。

### 7.2 providers.md 关于视频契约的描述已过期

`docs/references/providers.md:21` 把 `ProviderVideoInput/Result` 描述成视频接入契约。**实际的视频接入点在 worker 的 `submitProviderQueue` / `pollProviderQueue`**（`workers/execution/src/index.ts` 约 2625 / 2640 行）。按那份过期描述去找接入点会找错地方。

这条纠错**留到收尾切片**统一改，不在功能切片里顺手动 providers.md。

## 8 · 切片与验证

### 8.1 切片顺序

| #   | 切片          | 内容                                                                                                 | 依赖   |
| --- | ------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| ①   | 基础设施      | worker 视频回存改流式/multipart · 超时与 maxAttempts 按模型 per-run · `sourceGenerationId` migration | —      |
| ②   | 服务与 worker | 源视频字段贯通 · 两个视频超分模型的常量四件套 · 三语 i18n · 图片 Topaz 档                            | ①      |
| ③   | 上传          | 预签名直传 R2 + 服务端时长/大小/格式校验                                                             | —      |
| ④   | 画布 UI       | 视频节点工具条「增强」动作 · 新节点与连线 · 两项参数 · 空态上传入口                                  | ② 与 ③ |
| ⑤   | 收尾          | §7.2 的文档纠错 + 全量闸门                                                                           | ④      |

① 与 ③ 可并行。② 依赖 ①（没有 per-run 超时和流式回存，模型接上去也跑不完）。④ 依赖 ② 与 ③。

### 8.2 验证

按 [`../testing.md`](../testing.md)，每个切片完成后：

- 全量 **vitest**（模型目录 / adapter / schema 的改动必然波及跨文件测试，定向子集必漏）
- 全量 **tsc**
- **i18n-check**（三语 label/description 完整性）
- **`npm run models:check-docs`**（确认 officialUrl 可达）

schema 切片额外按 [`../../checklists/database.md`](../../checklists/database.md) 核对；worker 改动同时跑 worker 的独立测试。

## Source of Truth

`src/services/generate-video.service.ts`（worker 路由与 run context）· `workers/execution/src/index.ts`（queue 提交/轮询、视频回存）· `src/services/image/image-edit.service.ts`（upscale 分支）· `src/app/api/image/edit/route.ts`（同步预算）· `src/constants/execution.ts`（执行常量）· `prisma/schema.prisma`（`Generation`）· `src/types/index.ts`（视频请求 schema）

## Last Verified

- 2026-09-06 · 域首次成文；owner 确认场景、入口、三个模型与参数、`sourceGenerationId` 血缘与 migration 授权、两档静态计价、worker-only 异步范式、预签名直传、两条实现约束与五个切片。文中所有文件路径与行号本次逐条核对。
