# Comfy Runner — 本地与部署形态调研（2026-07）

> 任务包 [`comfy-runner-recipe-clone.md`](comfy-runner-recipe-clone.md) 的配套调研：架构决策（RUNNER adapter / Worker 调 / Worker 传 R2 / 结构化契约）不变，本文回答两个实操问题——**本地怎么跑（Phase 0/1）**、**生产怎么部署（Phase 2+）**，并给出推荐路线。
>
> 状态：调研完成，待 owner 拍板路线。文档中文，代码标识符/路径英文。

---

## 0. 结论先行（TL;DR）

1. **本机（RTX 4060 Laptop 8GB）足够做 Phase 0 和 v1 单用户 runner。** 有直接对口实测：同款 GPU + WAI-Illustrious，1024×1024 约 15s/图，不开 `--lowvram`，挂 LoRA 峰值 ~5.6GB。多 LoRA（3–5 个）额外 <1GB，不是瓶颈。红线：**不要加 ControlNet**（8GB 装不下）。
2. **本地安装选 `comfy-cli`**（headless 优先、可脚本化），不选 Desktop 版（GUI 桌面壳，无法作为服务编排）。
3. **runner 自己写薄层（~200–400 行），直接调 Comfy 原生 API（localhost:8188），不引第三方包装层。** SaladTechnologies 的 `comfyui-api`（MIT）验证了这个形态可行，但它外露的是 raw workflow JSON——恰是我们契约明令禁止的；它解决的痛点（无状态水平扩展、多存储后端、LRU 模型缓存）v1 单机都用不上。**参考它的设计，不依赖它。**
4. **路线已定为 RunPod-first**：生产直接上 RunPod Serverless（fork 官方 `worker-comfyui`），成本约 **$0.002–0.006/图**（4090 按秒计费、scale-to-zero）。RunPod 平台自带鉴权 + 队列 + `/run`/`/status` 端点，**吃掉了原「本地 TS runner + Cloudflare Tunnel」整整一层**——不再自建 runner 宿主，也不再有家用机开机依赖 / `runner_offline` 一等错误路径。
5. **本地只作调试台，不作宿主**：本机（4060/8GB）装 ComfyUI GUI 仅用于手搭 workflow、调参贴近来源图、导出模板 JSON、零成本验证复刻效果（go/no-go 闸门）。`recipe→workflow` 映射写成纯函数模块（放 Cloudflare Worker，TS），RunPod 端 fork 只加 LoRA 动态下载 + 缓存。详见 §2.2。

---

## 1. 本地怎么做（仅调试台：调 workflow + 导出模板）

> ▶ **路线更新（RunPod-first）**：本地不再作为生产 / v1 runner 宿主。本机只装 ComfyUI GUI，用途收窄为三件事——手搭/调 workflow、导出模板 JSON、零成本验证复刻效果。原 §1.3「自写 TS runner 服务」+ §1.4「Cloudflare Tunnel」降为**备选**（仅当 RunPod 复刻效果不达标、想退回本地自托管时才捡回）。生产宿主见 §2.2。

### 1.1 硬件现实：RTX 4060 Laptop 8GB

本机 `nvidia-smi`：RTX 4060 Laptop GPU，8188 MiB，驱动 610.47。

| 事实                                                                                   | 来源/依据                       |
| -------------------------------------------------------------------------------------- | ------------------------------- |
| 同款 GPU + WAI-Illustrious 实测：1024×1024 ≈ 15s，无需 `--lowvram`，挂 LoRA 峰值 5.6GB | lilting.ch 实测文（见文末来源） |
| 3–5 个 LoRA 叠加额外显存 <1GB，几乎不构成瓶颈                                          | SynpixCloud GPU 指南            |
| 4060 一般性预期 14–22s / 1024×1024（对比 4090 的 3–5s）                                | 同上                            |
| SDXL + ControlNet + 2 LoRA 需要 12GB 起 → **8GB 上禁 ControlNet**                      | 同上                            |
| `--lowvram` 是兜底不是首选（CPU/GPU 换页拖慢速度）；先降分辨率/去重支路                | apatero.com 低显存指南          |

**结论**：任务包 §3 Phase 0 的验证矩阵（checkpoint + 多 LoRA + sampler/clipSkip/seed/832×1216）在本机完全可行，出图 15–25s 量级。Phase 0 不需要花一分钱。

### 1.2 安装形态选择

| 形态                                                       | 适合        | 不选原因                                         |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------ |
| **comfy-cli**（`pip install comfy-cli` → `comfy install`） | ✅ 选这个   | —                                                |
| ComfyUI Desktop（Windows 安装包）                          | 纯 GUI 用户 | 桌面应用壳，难以作为 headless 服务被 runner 编排 |
| Windows Portable（压缩包）                                 | 快速试玩    | 依赖管理不可脚本化，和将来容器化路径不同构       |

comfy-cli 的关键能力（正对我们需求）：

- `comfy install --fast-deps`：用 `uv` 装依赖，快很多。
- `comfy launch -- --listen 127.0.0.1 --port 8188`：headless 起服务，**只绑 localhost**（任务包 §7 红线 1：8188 绝不外露）。
- `comfy model download`：脚本化拉 checkpoint/LoRA。
- 全命令支持 `--json` 输出，方便 runner 侧健康检查/自动化。

Phase 0 精简清单（本地只装 GUI 调模板，RunPod-first 下这就是本地的**全部**职责）：

```bash
# venv 里
pip install comfy-cli
comfy install --fast-deps          # 装 ComfyUI + manager（含 GUI）
# checkpoint / LoRA 放 ComfyUI/models/{checkpoints,loras}/
comfy launch                       # 起本地 GUI（默认 127.0.0.1:8188），浏览器打开手搭
```

在 GUI 里做完这几件事，本地的活就结束了：

1. 手搭固定 workflow：`CheckpointLoader → LoRA Loader stack → CLIPTextEncode(pos/neg) → KSampler → VAEDecode → SaveImage`。
2. 用一张真实来源图的完整 recipe 喂参数（prompt/neg/seed/steps/cfg/sampler/scheduler/clipSkip/尺寸 + 每个 LoRA 权重），反复调到**肉眼明显比现在的 Replicate/noobai-xl 路径更像来源图**。
3. 不达标 → 调模板/参数，别急着上 RunPod（省下白配端点的功夫）。达标 → **Export (API)** 导出为 `sdxl-recipe-clone/v1.json`，这是 §2.2 里 `recipe→workflow` 映射的目标结构，也是 RunPod handler 的执行模板。

注：RunPod-first 下本地**不需要** headless（`--listen`/`--port` 调服务）、不需要 `cloudflared`、不需要写 runner 服务——那些只在「本地自托管备选」里才用到。

### 1.3 runner 服务形态：自写薄层 vs 复用现成包装（本地自托管备选）

> RunPod-first 下本地不跑 runner 服务，本节是「退回本地自托管」备选时的分析。`recipe→workflow` 映射的最终归属见 §2.2（放 Cloudflare Worker）。以下对 comfyui-api / worker-comfyui 的设计对比仍然有效，供选型参考。

调研到的现成方案与我们契约的关系：

| 方案                                                                 | 形态                                                                                                               | 与我们契约的匹配度                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ComfyUI 原生 API**（`POST /prompt` + WebSocket 事件 + `/history`） | 最底层                                                                                                             | runner 内部用它。缺点（连接状态、输出文件定位、异步事件）由 runner 薄层消化                                                                                                                               |
| **SaladTechnologies `comfyui-api`**（MIT，Fastify）                  | 包在 Comfy 外的无状态 REST：sync/async、签名 webhook、模型按需下载 + LRU 缓存、warmup workflow、`/health` `/ready` | **形态同构但接口错位**：它接的是 raw ComfyUI workflow JSON，我们契约（任务包 §4/§7）只接结构化 recipe、明令拒绝 raw workflow。若引入，只能藏在 runner 内侧，等于多一层进程却仍要自写 recipe→workflow 映射 |
| RunPod `worker-comfyui`                                              | serverless handler，输入也是 workflow JSON + base64                                                                | 部署期方案（见 §2），本地不适用                                                                                                                                                                           |

**决策建议：自写薄 runner，直接调 Comfy 原生 API。** 理由：

1. recipe→workflow 映射（我们的核心安全边界 + 增值）无论如何都要自己写；
2. `comfyui-api` 的增值点（水平扩展、多云存储、动态模型下载）v1 单机单队列全用不上；
3. 少一层进程 = 少一个故障面；Comfy 原生 API 的提交→轮询 `/history/{prompt_id}` → 读输出文件，一共 ~200 行；
4. 它的**设计**值得抄：`/health` + `/ready` 分离、warmup workflow（启动时跑一遍空任务把 checkpoint 载进显存）、LoRA 按 hash 落盘缓存。

runner 技术栈建议 **Node/TypeScript**（Fastify 或 Hono）：与 PixelVault/Worker 同语言，Zod 校验 recipe 请求体可直接共享 schema 形状；Python 无优势（不需要 import comfy 内部，纯 HTTP 调用）。

### 1.4 本地暴露公网（仅本地自托管备选）

> RunPod-first 下**不需要**：RunPod 端点由 RunPod API key 保护，Worker 直连，无隧道。以下仅当退回本地自托管时适用。

维持任务包 §7 决策：**Cloudflare Tunnel**（`cloudflared`），Worker → Tunnel → runner(:某私有端口) → Comfy(localhost:8188)。Tunnel service token 限定唯一调用方，无入站端口。Windows 上 `cloudflared` 可注册为系统服务，开机自起。

### 1.5 本地形态的固有限制（如实列出）

- 笔记本必须开机在线 → `runner_offline` 错误路径（任务包 §6）是一等公民，不是边角。
- 8GB 上限：SDXL 文生图 OK；将来想加 hires-fix 二段放大、ControlNet、视频 → 必须上云。
- 出图 15–25s + 单任务队列 → 并发 = 1，v1 单用户可接受。
- 家用上行带宽：PNG ~2–4MB 回传 Worker，无压力。

---

## 2. 部署怎么做（生产形态，Phase 2+）

### 2.1 三档形态对比

| 档                                             | 形态                                                    | 成本                                                                                                                                               | 优点                                                                                                                                 | 缺点                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. 本地常驻 + Tunnel**                       | 现状延伸                                                | $0                                                                                                                                                 | 零成本、环境完全可控、Phase 0/1 已就绪                                                                                               | 开机依赖、8GB 上限、单并发                                                                                                                                                                                                           |
| **B. RunPod Serverless**（推荐）               | fork 官方 `worker-comfyui` 镜像 + Network Volume 放模型 | 4090 $0.34–0.69/hr 按秒计费，scale-to-zero；**~$0.002–0.004/图**（20s@4090）；Volume $0.07/GB/月（checkpoint 6.5GB + LoRA 缓存 ≈ 20GB → ~$1.4/月） | 调用形态（`/run` 异步提交 → `/status` 轮询 → base64/S3 输出）与我们 Worker→runner 轮询**天然同构**；官方镜像维护活跃；不用管基础设施 | 冷启动：宣传 FlashBoot sub-200ms 是容器启动，**从 Network Volume 载 6.5GB checkpoint 实测会是 30s–2min 量级**，低频调用体验差；缓解：checkpoint 烧进镜像（镜像变大但走 RunPod 内网缓存）或保 1 个 active worker（~$180/月，v1 不值） |
| **C. Modal**                                   | Python 定义镜像+函数                                    | 略贵（L40S ~$2/hr 档），有免费额度                                                                                                                 | 一切皆代码、git 部署、DX 好                                                                                                          | 要写 Python 包装层（与我们 TS 栈错位）；workflow 塞进 Python 函数，模板版本化反而更绕                                                                                                                                                |
| （管理型：Comfy Deploy / Runflow / ViewComfy） | 托管平台                                                | 订阅制                                                                                                                                             | 点击即部署                                                                                                                           | 把 workflow 交给第三方平台管理，与「私有 runner、结构化契约」方向冲突，**不考虑**                                                                                                                                                    |

### 2.2 推荐路线：RunPod-first（本地只调 workflow，生产直接上 RunPod）

```
本地（仅调试台，一次性）        生产（常驻形态）
┌──────────────────────┐      ┌──────────────────────────┐
│ ComfyUI GUI          │      │ RunPod Serverless        │
│ 手搭/调 workflow      │  →   │ fork worker-comfyui      │
│ Export(API) 出模板    │ 模板  │ + LoRA 动态下载/缓存      │
│ 零成本验证复刻(go/no) │      └──────────────────────────┘
└──────────────────────┘                 ▲
                          Cloudflare Worker（TS）
                          recipe→workflow 映射(纯函数) + 安全边界
                          直连 RunPod /run+/status（API key 鉴权）
```

关键点：

1. **`recipe→workflow` 映射放 Cloudflare Worker（TS 纯函数）。** 结构化 recipe → ComfyUI prompt JSON 的转换、allowlist 校验、模板版本 pin 全在 Worker 侧确定性完成，然后把成型的 workflow POST 给 RunPod。映射逻辑留在 PixelVault 主栈（TS + Zod，可测、可版本化），RunPod 端 fork 几乎开箱——**主要只需加 LoRA 按 `modelVersionId+sha256` 动态下载 + 缓存**（worker-comfyui 原生就接 workflow JSON + base64 输入）。
2. **安全边界的威胁模型变了（诚实标注）。** 任务包 §7 红线「runner 只接结构化 recipe、拒 raw workflow」的初衷是：本地 runner 经 Tunnel 暴露公网，怕有人塞恶意 workflow 蹭 GPU。RunPod-first 下 **RunPod 端点由 RunPod API key 保护、唯一调用方是我们的 Worker**，威胁面从「公网任意人」缩到「持 key 的 Worker」。因此「Worker 组装 workflow 后发给 RunPod」不再违背原红线的意图——恶意 raw workflow 进不来（外部无 key）。allowlist / 模板 pin 仍由 Worker 强制，只是位置从 runner 内移到 Worker 内。
3. **Worker 侧循环基本不变。** RecipeCloneWorkflow 仍是「提交→轮询→拿 bytes→`GENERATION_BUCKET.put`→回调」，只是 endpoint 换成 RunPod、鉴权换成 RunPod API key。RunPod 的 `/run`（异步提交返回 jobId）+ `/status`（轮询）与既有轮询形态同构。RunPod 返回的 base64/S3 输出与错误 envelope，在 Worker 侧解包后映射进 `WORKER_GENERATION_ERROR_CODES`。
4. **模型分发**：checkpoint **烧进 Docker 镜像**（低频自用推荐，省 Network Volume 月费、换更快冷启动）；LoRA 运行时动态下载 + 缓存到 worker 本地盘（跨请求复用，冷 worker 才重拉）。
5. **本地那台的职责到「导出模板」为止。** 模板 JSON 交付给映射 + RunPod handler 后，本地不再参与生产链路。想改 workflow（加节点/换 checkpoint）时再回本地 GUI 调、重新导出。

### 2.3 成本参考（RunPod，2026-07 价格）

| 项                               | 价格                                           |
| -------------------------------- | ---------------------------------------------- |
| RTX 4090（Community）            | $0.34/hr ≈ $0.0019/图（20s）                   |
| RTX 4090（Secure）               | $0.69/hr ≈ $0.0038/图                          |
| RTX A5000                        | $0.27/hr（更慢，SDXL ~30s/图，约 $0.0023/图）  |
| Network Volume                   | $0.07/GB/月（<1TB）                            |
| Active worker 常驻（避免冷启动） | ~25% 月度在线起步才划算（~180h/月），v1 不建议 |

即使每天复刻 100 张，月成本 <$12（烧镜像则省掉存储那 ~$1.4）。**成本不是决策变量，冷启动体验才是。**

### 2.4 成本上限与护栏

RunPod 是**预付费制**，这本身就是最硬的上限——余额花完自动停机，**无自动续费，不会继续刷信用卡**。控制月度支出 = 一次充多少。从硬到软全开：

| 护栏                                 | 设置                    | 作用                                                          |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------- |
| **预付费余额**                       | 一次充 $10              | 硬上限，花完自动停所有 worker；credits 不可退（自用无所谓）   |
| **Max Workers = 1**                  | 端点配置                | 并发上限 = 成本上限，防跑飞起一堆 worker；v1 单用户正好       |
| **Execution Timeout = 120s**         | Advanced（默认 600s）   | 单任务超时即 kill，防卡死任务无限计费；SDXL 15–25s，120s 留足 |
| **Min Workers = 0（scale-to-zero）** | 端点配置                | 无请求不计费；代价是冷启动，低频自用值得                      |
| **Idle Timeout = 5s**                | 端点配置                | 出图完尽快释放 worker，减少闲置计费                           |
| **余额低通知**                       | Settings → Notification | 余额低于阈值（如 $3）邮件提醒，不至于用一半突然停             |

账户还有默认 **$80/hr spend limit**（防跑飞，非省钱工具；真正管钱的是预付费余额）。

**结论**：上表配置下，不用 = $0，用一点花一点，充多少封顶多少。单用户低频复刻，月度 **$2–5 很现实，$10 是宽松天花板**。

---

## 3. 对任务包的增补（RunPod-first 覆盖部分宿主决策）

> 任务包 §2 架构图与 §10 任务 1/2 假设「本地 TS runner + Tunnel」宿主。**RunPod-first 下宿主决策更新如下**（架构分层、契约字段、错误码表、manifest 等其余决策不变）：

1. **Phase 0 精简**：本地只装 ComfyUI GUI 调 workflow + 导出模板（本文 §1.2），不再需要 headless / 服务化。导出用 **Export (API)** 格式（不是普通 Save，API 格式才能作为 workflow JSON 提交）。
2. **`recipe→workflow` 映射归属**：从「本地 runner 内」移到 **Cloudflare Worker（TS 纯函数）**（§2.2）。任务包 §10 任务 1「独立 runner 服务」在 RunPod-first 下**不再需要**——被 Worker 侧映射 + fork worker-comfyui 取代。
3. **生产宿主**：RunPod Serverless，fork worker-comfyui，checkpoint 烧镜像、LoRA 动态下载缓存、Max Workers=1 + scale-to-zero（§2.2 / §2.4）。
4. **错误模型**：任务包 §6 错误码不变，但来源从「runner 结构化 code」改为「RunPod job status/error envelope + ComfyUI 执行错误」，Worker 侧解包后映射进 `WORKER_GENERATION_ERROR_CODES`；`runner_offline` 语义从「家用机关机」变为「RunPod 端点不可达 / 余额耗尽停机」。
5. **本地自托管备选**：§1.3 / §1.4 保留为 fallback——若 RunPod 复刻效果不达标或想彻底离线自托管，再捡回 TS runner + Tunnel 路线（届时 warmup / health-ready 分离等设计仍适用）。

---

## 来源

- [comfy-cli 官方文档](https://docs.comfy.org/comfy-cli/getting-started) · [Comfy-Org/comfy-cli](https://github.com/Comfy-Org/comfy-cli) · [ComfyUI Wiki: comfy-cli 指南](https://comfyui-wiki.com/en/install/install-comfyui/comfy-cli)
- [SaladTechnologies/comfyui-api](https://github.com/SaladTechnologies/comfyui-api)（MIT，无状态包装层设计参考）
- [runpod-workers/worker-comfyui](https://github.com/runpod-workers/worker-comfyui) · [RunPod ComfyUI serverless 教程](https://docs.runpod.io/tutorials/serverless/comfyui) · [部署文档](https://github.com/runpod-workers/worker-comfyui/blob/main/docs/deployment.md)
- [RunPod 定价](https://www.runpod.io/pricing) · [Serverless 定价文档](https://docs.runpod.io/serverless/pricing) · [Northflank RunPod 价格分析](https://northflank.com/blog/runpod-gpu-pricing)
- [RTX 4060 Laptop 8GB + WAI-Illustrious 实测](https://lilting.ch/en/articles/comfyui-local-rtx4060-wai-illustrious) · [SynpixCloud: ComfyUI GPU 指南](https://www.synpixcloud.com/blog/comfyui-complex-workflow-gpu-guide) · [apatero: 低显存 ComfyUI](https://apatero.com/blog/low-vram-no-problem-running-comfyui-on-budget-hardware)
- [Runflow: Self-Host vs Serverless vs Managed 2026](https://www.runflow.io/blog/comfyui-deploy-self-host-serverless-managed)
