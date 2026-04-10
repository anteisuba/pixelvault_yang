# 服务器扩展方案分析 — Personal AI Gallery

## Context

项目当前部署在 **Vercel (Serverless)** 上，所有 AI 生成都委托给外部 API（FAL、Gemini、OpenAI 等）。用户想了解：如果用户量增长，哪些地方需要自建服务器，以及图片/视频生成方面还有什么服务器能做的事。

---

## 当前架构总览

| 层        | 当前方案                                                   | 瓶颈                        |
| --------- | ---------------------------------------------------------- | --------------------------- |
| 部署      | Vercel Serverless                                          | 函数最长 300s，无持久进程   |
| 数据库    | Neon PostgreSQL                                            | Serverless，连接池有限      |
| 存储      | Cloudflare R2                                              | 无瓶颈，按量付费            |
| 缓存/限流 | Upstash Redis                                              | 无瓶颈                      |
| AI 生成   | 外部 API（FAL/Gemini/OpenAI/Replicate/NovelAI/VolcEngine） | 按调用付费，排队等待        |
| 视频      | FAL 异步队列 + 客户端轮询                                  | 无后台 worker，依赖外部队列 |
| 图片处理  | 无（直接存原图）                                           | 无后处理能力                |

**核心问题：** 目前是纯 Serverless + 外部 API 模式。用户量小时没问题，但规模增长后有三个痛点：

1. **成本** — 外部 API 按调用付费，量大后费用指数增长
2. **控制力** — 无法自定义模型、无法训练 LoRA、无法做后处理
3. **并发** — Serverless 函数有冷启动和超时限制，长任务受限

---

## 方案一：GPU 服务器 — 自托管推理（最大价值）

### 做什么

在 GPU 服务器上部署 **ComfyUI / Stable Diffusion WebUI** 或直接用 **diffusers** 跑模型推理。

### 能解决的问题

| 能力               | 说明                                                        |
| ------------------ | ----------------------------------------------------------- |
| **自托管图片生成** | 跑 SDXL、FLUX、SD3 等开源模型，不再按次付费                 |
| **LoRA 训练**      | 用户上传图片 → 服务器训练 LoRA → 用于后续生成（个性化风格） |
| **ComfyUI 工作流** | 复杂多步生成（生图 → 放大 → 换脸 → 后处理）一次完成         |
| **视频生成**       | 本地跑 AnimateDiff、SVD、CogVideoX 等视频模型               |
| **图片后处理**     | 超分辨率（Real-ESRGAN）、去背景（RMBG）、水印、格式转换     |
| **批量生成**       | 一次提交多张图，后台队列异步处理                            |

### 推荐配置

| 用途              | GPU                 | 显存  | 参考月费          |
| ----------------- | ------------------- | ----- | ----------------- |
| 轻量推理（SDXL）  | RTX 4090 / A5000    | 24GB  | $200-400/月（云） |
| 中等推理（FLUX）  | A100 40GB           | 40GB  | $800-1500/月      |
| 全能（训练+推理） | A100 80GB × 2       | 160GB | $3000+/月         |
| 经济方案          | RunPod/Vast.ai 按需 | 按需  | $0.3-1/GPU·小时   |

### 架构改动

```
当前：  Client → Vercel API → FAL/OpenAI → R2
改后：  Client → Vercel API → Job Queue (Redis/BullMQ)
                                    ↓
                            GPU Worker Server
                            (ComfyUI / diffusers)
                                    ↓
                                   R2
```

需要新增：

- `src/services/providers/self-hosted.adapter.ts` — 新 adapter，调用自托管 ComfyUI API
- Redis/BullMQ 任务队列 — 替代 Vercel 函数直接调用
- Worker 进程 — GPU 服务器上跑的消费者
- Webhook 回调 — 生成完成后通知 Vercel API → 更新 DB

---

## 方案二：CPU 服务器 — 后处理 + 任务编排

### 做什么

不需要 GPU，用普通服务器处理图片/视频的后处理和长任务编排。

### 能解决的问题

| 能力           | 说明                                                    |
| -------------- | ------------------------------------------------------- |
| **图片后处理** | Sharp 批量处理：缩略图、水印、格式转换、EXIF 清理       |
| **视频拼接**   | FFmpeg 拼接长视频 pipeline 的多个 clip（目前依赖 FAL）  |
| **视频转码**   | 不同分辨率/格式输出（MP4/WebM/GIF）                     |
| **PSD 处理**   | 图层合成、导出（目前 decompose 依赖 HuggingFace Space） |
| **任务队列**   | BullMQ worker 处理异步任务，不受 Vercel 300s 限制       |
| **WebSocket**  | 实时推送生成进度（替代客户端轮询）                      |
| **定时任务**   | 清理过期数据、模型健康检查、使用量统计                  |

### 推荐配置

| 规模             | 配置                         | 参考月费  |
| ---------------- | ---------------------------- | --------- |
| 小（<1000 用户） | 2 vCPU / 4GB RAM             | $20-40/月 |
| 中（1000-10000） | 4 vCPU / 8GB RAM             | $40-80/月 |
| 大（10000+）     | 8 vCPU / 16GB RAM + 按需扩容 | $100+/月  |

---

## 方案三：混合方案（推荐）

### 阶段 1：加 CPU 服务器（用户 < 5000）

- 部署 **BullMQ + Redis** 任务队列
- Worker 处理：视频拼接（FFmpeg）、图片后处理（Sharp）、定时任务
- WebSocket 服务推送生成进度
- 继续用外部 API 做 AI 推理
- **月费：$40-80**

### 阶段 2：加 GPU 服务器（用户 > 5000 或需要定制化）

- 部署 ComfyUI，承担 **免费用户** 的生成量（降低 API 费用）
- 付费用户继续用外部高端 API（质量保证）
- 开放 LoRA 训练功能（付费特性）
- **月费：$200-800**（按需）

### 阶段 3：全面自托管（用户 > 50000）

- 多 GPU 节点 + 负载均衡
- 自建模型服务（vLLM / TGI for LLM，ComfyUI for 图片）
- CDN 边缘缓存
- **月费：$3000+**

---

## 具体功能机会清单（图片/视频生成相关）

### 有了服务器可以做的新功能

| 功能              | 需要                 | 价值                     |
| ----------------- | -------------------- | ------------------------ |
| **图片超分辨率**  | GPU（Real-ESRGAN）   | 生成的图放大到 4K/8K     |
| **AI 去背景**     | GPU（RMBG-2.0）      | 一键抠图，替代手动       |
| **AI 换脸**       | GPU（InsightFace）   | 角色卡换脸生成           |
| **ControlNet**    | GPU（ComfyUI）       | 姿势/线稿/深度图控制     |
| **LoRA 训练**     | GPU（kohya_ss）      | 用户训练自己的风格       |
| **视频本地生成**  | GPU（CogVideoX/Wan） | 不依赖 FAL 队列          |
| **视频拼接/转码** | CPU（FFmpeg）        | 长视频 pipeline 自主完成 |
| **批量生成**      | CPU + 队列           | 一次提交 10-100 张       |
| **实时进度推送**  | CPU（WebSocket）     | 替代轮询，体验更好       |
| **定时批处理**    | CPU（Cron）          | 夜间批量处理、报告生成   |
| **图片水印**      | CPU（Sharp）         | 免费用户自动加水印       |
| **缩略图生成**    | CPU（Sharp）         | Gallery 加载更快         |
| **GIF 生成**      | CPU（FFmpeg）        | 视频 → GIF 预览          |

---

---

## Mac Mini 作为服务器的可行性分析

### Mac Mini M4 Pro 规格（参考）

| 配置          | M4 Pro (14核) | M4 Pro (24GB) | M4 Max (128GB) |
| ------------- | ------------- | ------------- | -------------- |
| CPU           | 14 核         | 14 核         | 16 核          |
| GPU           | 20 核         | 20 核         | 40 核          |
| 统一内存      | 24GB          | 24GB          | 128GB          |
| Neural Engine | 16 核         | 16 核         | 16 核          |
| 价格          | ~$1,399       | ~$1,399       | ~$3,499        |

### Mac Mini 能做什么（适合）

| 功能                  | 可行性   | 说明                                                                |
| --------------------- | -------- | ------------------------------------------------------------------- |
| **CPU 后处理**        | **完美** | Sharp 图片处理、FFmpeg 视频拼接/转码，Mac Mini 性能绰绰有余         |
| **任务队列 Worker**   | **完美** | BullMQ + Redis 跑在本地，处理异步任务                               |
| **WebSocket 服务**    | **完美** | 实时推送生成进度                                                    |
| **定时任务**          | **完美** | Cron 清理、统计、健康检查                                           |
| **小模型推理（MLX）** | **不错** | Apple 的 MLX 框架可以跑 SD 1.5 / SDXL 级别模型                      |
| **LLM 本地推理**      | **不错** | Ollama/MLX 可以跑 Llama 3、Qwen 等，替代 prompt enhance 的 API 调用 |
| **Redis 服务**        | **完美** | 本地 Redis 替代 Upstash，零延迟                                     |

### Mac Mini 的限制（不适合）

| 功能                          | 问题                                                        | 替代方案                   |
| ----------------------------- | ----------------------------------------------------------- | -------------------------- |
| **FLUX / 大模型推理**         | Apple GPU 不支持 CUDA，ComfyUI 性能差，FLUX 需要 >24GB 显存 | 用外部 API 或租 GPU        |
| **LoRA 训练**                 | 训练需要 CUDA + 大显存，MLX 训练生态不成熟                  | RunPod/Vast.ai 按需租 GPU  |
| **视频生成（CogVideoX/Wan）** | 视频模型极耗显存（48GB+），Mac Mini 跑不动                  | 继续用 FAL                 |
| **高并发推理**                | Apple GPU 吞吐量远低于 A100/H100                            | 高并发场景需要专业 GPU     |
| **ComfyUI 完整工作流**        | ComfyUI 官方对 Mac 支持有限，很多节点依赖 CUDA              | 基础工作流可以，复杂的不行 |

### Mac Mini 最佳使用方案

```
架构：Mac Mini 做「中间层」，不做 AI 推理

Client → Vercel API → Mac Mini (Redis + BullMQ + WebSocket)
                          ↓
                    ┌─────┴──────┐
                    │            │
              CPU 任务        AI 推理
           (FFmpeg/Sharp)   (继续用外部 API)
                    │            │
                    └─────┬──────┘
                          ↓
                         R2 存储
```

**Mac Mini 负责：**

1. **任务队列 + 调度** — Redis + BullMQ，接收 Vercel 的生成请求，分发给外部 API
2. **后处理 Pipeline** — 外部 API 返回原图后，Mac Mini 做超分（Real-ESRGAN 小模型版）、水印、缩略图、格式转换
3. **视频处理** — FFmpeg 拼接 clips、转码、生成 GIF 预览
4. **WebSocket 服务** — 实时推送生成进度给客户端
5. **LLM 本地推理（可选）** — Ollama 跑 Qwen/Llama，处理 prompt enhance，省 API 费用
6. **定时任务** — 清理过期数据、统计报表、Provider 健康检查

**Mac Mini 不负责：**

- AI 图片生成（继续用 FAL/Gemini/OpenAI）
- AI 视频生成（继续用 FAL）
- LoRA 训练（按需租 GPU）

### 成本对比

| 方案                      | 一次性 | 月费         | 适合                                  |
| ------------------------- | ------ | ------------ | ------------------------------------- |
| **Mac Mini M4 Pro 24GB**  | $1,399 | 电费 ~$10    | 后处理 + 队列 + WebSocket             |
| **Mac Mini M4 Max 128GB** | $3,499 | 电费 ~$15    | 上面 + MLX 小模型推理                 |
| **云 CPU 服务器**         | $0     | $40-80/月    | 同上，但 18 个月后总成本超过 Mac Mini |
| **云 GPU（A100）**        | $0     | $800-1500/月 | 全能推理，但贵                        |
| **RunPod 按需 GPU**       | $0     | $0.3-1/小时  | 偶尔训练 LoRA                         |

**结论：Mac Mini 性价比很好**，18 个月回本（vs 云 CPU 服务器），而且：

- 放家里/办公室，延迟低（同城网络）
- 功耗低（~30W 待机，~60W 负载）
- 安静，不占空间
- 可以跑 Docker、Redis、Node.js worker，完全满足需求

---

## 服务器硬件选型全览

### 第一类：家用 / 办公室物理机

| 设备                                | 价格         | 优势                             | 劣势                             | 适合做什么                           |
| ----------------------------------- | ------------ | -------------------------------- | -------------------------------- | ------------------------------------ |
| **Mac Mini M4 Pro**                 | $1,399       | 功耗低(30W)、安静、MLX 生态      | 无 CUDA、显存上限 24GB           | CPU 后处理、队列、LLM 小模型         |
| **Mac Mini M4 Max 128GB**           | $3,499       | 128GB 统一内存可跑大模型         | 贵、MLX 生态不如 CUDA 成熟       | 上面全部 + SDXL/LLM 70B 推理         |
| **Mac Studio M4 Ultra**             | $5,999+      | 192GB 统一内存、性能最强 Apple   | 贵、仍无 CUDA                    | 本地跑 FLUX（通过 MLX），中等并发    |
| **Intel N100 迷你主机**             | $150-300     | 极便宜、功耗 6W                  | 性能弱                           | 只做队列 + 轻量后处理                |
| **自组 PC + RTX 4090**              | $2,000-3,000 | 24GB CUDA 显存、ComfyUI 完美支持 | 功耗高(450W)、噪音、体积大       | ComfyUI 全功能、LoRA 训练、SDXL/FLUX |
| **自组 PC + RTX 5090**              | $3,000-4,000 | 32GB CUDA 显存、最新架构         | 更贵、功耗高                     | 上面全部 + 更大模型                  |
| **二手 Dell/HP 工作站 + Tesla P40** | $500-800     | 24GB 显存、极便宜                | 旧架构(Pascal)、功耗高、慢       | 入门级 ComfyUI，速度一般             |
| **二手服务器 + A100**               | $5,000-8,000 | 80GB 显存、专业级                | 噪音大、功耗 300W+、需要机房环境 | 全能：训练 + 推理 + 视频             |
| **Synology NAS**                    | $500-1,500   | 存储 + Docker、7x24 运行         | CPU 弱、无 GPU                   | 队列 worker + 轻量任务               |
| **Raspberry Pi 5**                  | $80-120      | 极便宜、超低功耗                 | 性能很弱                         | 只做 Redis + 定时任务                |

### 第二类：云服务器（VPS）

| 服务商            | CPU 方案月费     | GPU 方案月费    | 特点                      |
| ----------------- | ---------------- | --------------- | ------------------------- |
| **Hetzner**       | $5-20 (2-8 vCPU) | 无 GPU          | 性价比之王，欧洲数据中心  |
| **DigitalOcean**  | $12-48           | 无 GPU          | 简单好用，有 App Platform |
| **Vultr**         | $6-24            | $180+ (A40)     | 有 GPU 实例，全球节点     |
| **AWS Lightsail** | $5-40            | EC2 GPU 另算    | 入门简单，扩展到 AWS 生态 |
| **GCP**           | $10-50           | $400+ (T4/A100) | Google 生态，有 TPU 选项  |
| **Azure**         | $10-50           | $300+ (T4/A100) | 微软生态                  |

### 第三类：GPU 云（按需租用，适合 AI 推理/训练）

| 服务商          | 按需价格        | 适合场景                     |
| --------------- | --------------- | ---------------------------- |
| **RunPod**      | $0.20-1.50/小时 | ComfyUI Serverless、按需推理 |
| **Vast.ai**     | $0.10-0.80/小时 | 最便宜 GPU，社区机器         |
| **Lambda Labs** | $0.50-2.00/小时 | 专业 ML 训练                 |
| **Replicate**   | $0.001-0.05/次  | 按次计费，零运维             |
| **Modal**       | $0.001/秒       | Serverless GPU，冷启动快     |
| **Salad**       | $0.05-0.30/小时 | 最便宜选项之一               |

### 第四类：专业 GPU 服务器（托管/租赁）

| 方案                                             | 月费        | 适合                     |
| ------------------------------------------------ | ----------- | ------------------------ |
| **GPU 服务器租赁（日本 Sakura Cloud / ConoHa）** | ¥50,000+/月 | 日本用户低延迟           |
| **中国 GPU 云（AutoDL / 恒源云）**               | ¥50-300/天  | 国内用户、训练任务       |
| **Colocation（自己的机器放机房）**               | $50-200/月  | 有自己硬件，需要稳定网络 |

---

## 推荐方案（按预算）

### 预算 $200 以内（入门）

```
Intel N100 迷你主机 (~$200)
├── Redis + BullMQ 任务队列
├── FFmpeg 视频拼接/转码
├── Sharp 缩略图/水印
├── WebSocket 实时推送
└── 定时任务（Cron）

AI 推理继续用外部 API
```

**适合：** 用户量 < 2000，主要解决 Vercel 300s 超时问题

### 预算 $1,500 左右（推荐）

```
Mac Mini M4 Pro 24GB (~$1,399)
├── 上面全部 CPU 任务
├── Ollama 跑 Qwen/Llama 做 prompt enhance
├── MLX 跑 SD 1.5 级别模型（备用）
└── 本地 Redis（替代 Upstash）

AI 推理：外部 API 为主
```

**适合：** 用户量 < 5000，功耗低安静，18 个月回本

### 预算 $3,000 左右（全能）

```
自组 PC + RTX 4090 24GB (~$2,500-3,000)
├── ComfyUI 全功能（SDXL/FLUX 推理）
├── ControlNet / IP-Adapter / 换脸
├── LoRA 训练（kohya_ss）
├── Real-ESRGAN 超分辨率
├── 上面全部 CPU 任务
└── Ollama LLM 推理

或者：Mac Mini M4 Max 128GB (~$3,499)
├── MLX 跑 SDXL / Llama 70B
├── 无需 CUDA 但支持大模型
└── 上面全部 CPU 任务
```

**适合：** 需要 ComfyUI 高级功能（选 PC+4090）或低功耗安静方案（选 Mac Max）

### 预算 $5,000+（专业）

```
二手 A100 服务器 或 Mac Studio Ultra
├── 全部推理（图片+视频+LLM）
├── LoRA / DreamBooth 训练
├── 多模型同时加载
└── 高并发处理
```

---

## 对比表：Mac Mini vs 自组 PC vs 云服务器

| 维度       | Mac Mini M4 Pro | PC + RTX 4090  | 云 CPU ($40/月) | 云 GPU ($800/月) |
| ---------- | --------------- | -------------- | --------------- | ---------------- |
| 一次性成本 | $1,399          | $2,500         | $0              | $0               |
| 月运营费   | $10（电费）     | $30-50（电费） | $40-80          | $800-1,500       |
| 1 年总成本 | $1,519          | $2,860-3,100   | $480-960        | $9,600-18,000    |
| 3 年总成本 | $1,759          | $3,580-4,300   | $1,440-2,880    | $28,800-54,000   |
| ComfyUI    | 有限（MLX）     | **完美**       | 不行            | **完美**         |
| LoRA 训练  | 不行            | **可以**       | 不行            | **可以**         |
| 视频后处理 | **完美**        | **完美**       | 好              | **完美**         |
| 噪音       | 极安静          | 有风扇噪音     | 无（云）        | 无（云）         |
| 功耗       | 30-60W          | 300-500W       | N/A             | N/A              |
| 维护       | 低              | 中             | 低              | 低               |
| 扩展性     | 差（买定离手）  | 可升级 GPU     | **弹性**        | **弹性**         |

---

---

## RunPod 方案详解

### RunPod 是什么

RunPod 是 GPU 云平台，有两种模式：

| 模式           | 说明                         | 计费                     |
| -------------- | ---------------------------- | ------------------------ |
| **GPU Pods**   | 持久的 GPU 虚拟机，24/7 运行 | 按小时（$0.20-$2.50/hr） |
| **Serverless** | 按需执行，自动扩缩容，冷启动 | **按秒计费**，空闲不花钱 |

**对这个项目来说，Serverless 模式最合适** — 只在生成图片/视频时才花钱，不用管服务器。

### RunPod Serverless 工作原理

```
1. 你上传一个 Docker 镜像（包含 ComfyUI + 模型权重）
2. RunPod 部署为 Serverless Endpoint
3. 你的 API 发 HTTP POST 请求（带 ComfyUI workflow JSON）
4. RunPod 分配 GPU → 执行 → 返回结果
5. GPU 释放，不再计费
```

### 两种调用模式

#### 模式 A：同步调用（/run）

```
POST https://api.runpod.ai/v2/{endpoint_id}/run
→ 返回 job_id
→ 轮询 GET /status/{job_id} 直到完成
→ 获取结果图片 URL
```

适合：图片生成（5-30秒）

#### 模式 B：异步调用（/run + webhook）

```
POST https://api.runpod.ai/v2/{endpoint_id}/run
  body: { input: {...}, webhook: "https://your-api.com/callback" }
→ RunPod 完成后回调你的 webhook
```

适合：视频生成、LoRA 训练等长任务

### ComfyUI on RunPod 具体流程

```
1. 准备 ComfyUI Workflow（在本地 ComfyUI 中设计好）
2. 导出为 API 格式的 JSON
3. 通过 RunPod API 发送到 Serverless Endpoint
4. RunPod 执行完返回生成的图片

示例请求：
POST /v2/{endpoint_id}/run
{
  "input": {
    "workflow": {
      // ComfyUI workflow JSON (API 格式)
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "seed": 42,
          "steps": 30,
          "cfg": 7,
          "sampler_name": "euler_a",
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["5", 0]
        }
      },
      // ... 其他节点
    }
  }
}
```

### RunPod 能跑什么（ComfyUI 节点生态）

| 功能           | ComfyUI 节点                    | 说明                   |
| -------------- | ------------------------------- | ---------------------- |
| **文生图**     | KSampler + SDXL/FLUX            | 标准文生图             |
| **图生图**     | img2img workflow                | 参考图生成             |
| **ControlNet** | ControlNetApply                 | 姿势/线稿/深度图控制   |
| **IP-Adapter** | IPAdapterApply                  | 风格参考               |
| **超分辨率**   | UltimateSDUpscale / Real-ESRGAN | 放大到 4K              |
| **去背景**     | RMBG node                       | 一键抠图               |
| **换脸**       | ReActor / InsightFace           | 面部替换               |
| **LoRA 应用**  | LoRALoader                      | 加载用户训练的 LoRA    |
| **批量生成**   | 循环节点                        | 一次出多张             |
| **图层分离**   | LayerDiffuse                    | 类似你现有的 decompose |
| **视频**       | AnimateDiff / SVD               | 短视频生成             |
| **Inpainting** | 局部重绘                        | 选区修改               |

### 费用计算

**RunPod Serverless GPU 价格（2025 参考）：**

| GPU       | 每秒价格 | 每小时价格 | 生成1张图(15s) | 生成1000张图 |
| --------- | -------- | ---------- | -------------- | ------------ |
| RTX 4090  | $0.00012 | $0.44      | **$0.002**     | **$2.00**    |
| A40       | $0.00012 | $0.44      | $0.002         | $2.00        |
| A100 80GB | $0.00048 | $1.74      | $0.007         | $7.00        |
| H100      | $0.00108 | $3.89      | $0.016         | $16.00       |

**对比当前外部 API 费用：**

| 对比               | 每张图费用  | 1000 张 |
| ------------------ | ----------- | ------- |
| FAL FLUX           | $0.01-0.05  | $10-50  |
| OpenAI DALL-E 3    | $0.04-0.12  | $40-120 |
| Replicate SDXL     | $0.005-0.02 | $5-20   |
| **RunPod ComfyUI** | **$0.002**  | **$2**  |

**结论：RunPod 比外部 API 便宜 5-60 倍**，尤其是量大的时候。

### 接入项目的架构设计

#### 新增文件

```
src/constants/providers.ts          ← 新增 AI_ADAPTER_TYPES.RUNPOD
src/constants/config.ts             ← 新增 RUNPOD endpoint
src/constants/models.ts             ← 新增 RunPod 模型定义
src/services/providers/
  runpod.adapter.ts                 ← 新 adapter（核心）
src/services/comfyui-workflow.service.ts  ← ComfyUI workflow 管理（可选）
src/app/api/runpod-webhook/route.ts      ← RunPod 回调 webhook（可选）
```

#### runpod.adapter.ts 核心逻辑

```typescript
// 伪代码
export const runpodAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.RUNPOD,

  async generateImage(input) {
    // 1. 根据 modelId 选择 ComfyUI workflow 模板
    const workflow = getWorkflowTemplate(input.modelId)

    // 2. 填入参数（prompt, 尺寸, seed 等）
    injectParams(workflow, {
      prompt: input.prompt,
      width: getWidth(input.aspectRatio),
      height: getHeight(input.aspectRatio),
      lora: input.advancedParams?.loraId,
      referenceImage: input.referenceImage,
    })

    // 3. 调用 RunPod Serverless API
    const response = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/runsync`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify({ input: { workflow } }),
      }
    )

    // 4. 解析结果
    const result = await response.json()
    return {
      imageUrl: result.output.image_url,  // 或 base64
      width: ...,
      height: ...,
      requestCount: 1,
    }
  },

  // 视频：用 /run（异步）+ webhook 或轮询
  async submitVideoToQueue(input) {
    const response = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/run`,
      { ... }
    )
    const { id } = await response.json()
    return {
      requestId: id,
      statusUrl: `https://api.runpod.ai/v2/${endpointId}/status/${id}`,
      responseUrl: `https://api.runpod.ai/v2/${endpointId}/status/${id}`,
    }
  },

  async checkVideoQueueStatus(input) {
    const response = await fetch(input.statusUrl, { ... })
    const data = await response.json()
    // status: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED
    return { status: mapStatus(data.status), result: data.output }
  },
}
```

#### 用户体验流程

```
用户在 Studio 选择模型 → 选到 "SDXL (Self-Hosted)" 或 "FLUX (Self-Hosted)"
  → 输入 prompt → 点生成
  → Vercel API → runpod.adapter.ts → RunPod Serverless
  → RunPod 分配 GPU → ComfyUI 执行 workflow → 返回图片
  → 上传到 R2 → 保存到数据库
  → 用户看到结果

对用户完全透明，和其他模型体验一致。
```

### RunPod 高级功能

#### 1. 自定义 ComfyUI 工作流

可以预设多个 workflow，用户在 Studio 中选择：

| Workflow        | 做什么       | 对应 ComfyUI 节点     |
| --------------- | ------------ | --------------------- |
| txt2img_sdxl    | 基础文生图   | KSampler + SDXL       |
| txt2img_flux    | 高质量文生图 | FLUX + guidance       |
| img2img         | 参考图生成   | img2img workflow      |
| upscale_4x      | 超分辨率放大 | Real-ESRGAN 4x        |
| remove_bg       | 去背景       | RMBG-2.0              |
| controlnet_pose | 姿势控制     | ControlNet + OpenPose |
| style_transfer  | 风格迁移     | IP-Adapter            |
| inpaint         | 局部重绘     | Inpainting workflow   |
| batch_4         | 批量出 4 张  | 循环 KSampler         |

#### 2. LoRA 支持

RunPod 支持从 URL 动态加载 LoRA：

- 用户上传 LoRA 文件到 R2
- 生成时传入 LoRA URL
- ComfyUI workflow 中用 LoRALoader 节点加载

#### 3. 多 Endpoint 策略

可以创建多个 Endpoint，不同模型用不同 Endpoint：

| Endpoint   | GPU      | 模型        | 用途       |
| ---------- | -------- | ----------- | ---------- |
| ep-sdxl    | RTX 4090 | SDXL + LoRA | 标准生成   |
| ep-flux    | A100     | FLUX.1      | 高质量生成 |
| ep-video   | A100     | AnimateDiff | 视频生成   |
| ep-process | RTX 4090 | Real-ESRGAN | 后处理     |

### RunPod 的局限

| 局限             | 说明                           | 应对                                       |
| ---------------- | ------------------------------ | ------------------------------------------ |
| **冷启动**       | 首次请求需 10-30s 加载模型     | 设置 Min Workers=1 保持热（$0.44/h）       |
| **模型更新**     | 换模型需要重新构建 Docker 镜像 | 用 Network Volume 存模型，镜像只装 ComfyUI |
| **中国大陆延迟** | RunPod 节点主要在美国/欧洲     | 用 CDN 加速返回图片，或选欧洲节点          |
| **调试复杂**     | Serverless 环境难以实时调试    | 本地 ComfyUI 测试好 workflow 再部署        |
| **费用不可预测** | 用量大时费用可能超预期         | 设置 Spending Limit                        |

### 实施步骤（如果要做的话）

```
Phase 1: 基础接入（1-2 天代码改动）
  1. 注册 RunPod 账号，获取 API Key
  2. 创建 ComfyUI Serverless Endpoint（用官方模板）
  3. 新增 AI_ADAPTER_TYPES.RUNPOD
  4. 实现 runpod.adapter.ts（generateImage）
  5. 注册到 registry.ts
  6. 新增模型到 models.ts
  7. 更新 i18n（3 个语言文件）
  8. 测试

Phase 2: 高级功能（3-5 天）
  9. 多 workflow 支持（txt2img, img2img, upscale, etc.）
  10. ControlNet / IP-Adapter 集成
  11. LoRA 动态加载
  12. 视频生成（submitVideoToQueue）

Phase 3: 生产优化（2-3 天）
  13. Min Worker 策略（避免冷启动）
  14. 多 Endpoint 路由
  15. 费用监控和限制
  16. 错误重试和 fallback
```

---

## 回答核心问题

### Q1: 目前哪里需要服务器？

**目前不需要**。当前 Serverless + 外部 API 架构在小规模下运行良好。但以下场景会触发需求：

- 用户量增长 → 外部 API 费用不可控 → 需要 GPU 自托管推理
- 需要长任务（视频拼接、LoRA 训练）→ 需要持久 worker 进程
- 需要后处理（超分、水印、转码）→ 需要计算资源

### Q2: 一个服务器够不够？

取决于用户量和功能：

- **< 5000 用户**：一台 CPU 服务器（任务队列 + 后处理）+ 外部 API 足够
- **5000-50000**：一台 GPU 服务器（推理）+ 一台 CPU 服务器（队列/后处理）
- **> 50000**：需要多节点 + 负载均衡

### Q3: 图片/视频生成还能做什么？

见上面的「功能机会清单」。最高价值的是：

1. **ComfyUI 自托管** — 降成本 + 开放高级工作流
2. **LoRA 训练** — 差异化付费功能
3. **视频后处理** — FFmpeg 拼接/转码，不依赖外部
4. **超分辨率** — 生成后放大，提升质量
