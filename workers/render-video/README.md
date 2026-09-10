# `render-video` worker（剪辑台渲染层 · S9）

时间线 JSON → 一条 mp4 成片。换掉 fal `ffmpeg-api/compose`（只能尾裁，没有转场 /
变速 / 混音）。规格见 `docs/references/pages/node-canvas-v3-spec.md` §6，选型证据见
scratchpad `video-edit-models.md`。

## 形状

```
Next  POST /api/studio/render          （auth → Zod(RenderPlan) → 建 GenerationJob）
  │  签名（与 execution 同一套 HMAC 头）
  ▼
worker POST /workflows/render-video    → RenderVideoWorkflow.create({ id: jobId })
  │
  ├─ step download   拉素材 → 容器 /work/<jobId>/src/
  ├─ step normalize  每段一次 ffmpeg（scale/pad → fps → yuv420p → settb → setpts/atempo）
  ├─ step encode     一次 ffmpeg：xfade / concat / acrossfade / amix → /work/<jobId>/out.mp4
  ├─ step poster     抽一帧 → poster.jpg
  └─ step upload     R2 `renders/<projectId>/<jobId>.mp4` + `.jpg`
  │
  ▼
Next  POST /api/studio/render/callback （写回 url / 封面 / 时长 → Generation）
```

**断点续传 = 两层幂等**：① Workflow 的步缓存 —— 已完成的 step 重放时不再执行；
② 容器侧「产物文件已经在就直接复用」（`/run` 收到的 `dest` 存在即 `reused: true`）。
容器实例按 `idFromName(jobId)` 取，所以同一个 job 重跑命中同一块盘。

## 许可边界（⚠ 改 Dockerfile 前必读）

FFmpeg 基座是 **LGPL 2.1+**；`--enable-gpl` 或链入 libx264 / libx265 会让**整个产物
转为 GPL**，官方明确不提供任何付费专有例外（ffmpeg.org/legal.html，查阅 2026-09-09）。
GPL 的义务由**分发**触发（不是 AGPL），我们只在自己的容器里跑、只把成片交给用户，
通常不构成分发 —— 但那条论证需要法务背书，而这一层不值得欠一个法务判断。

所以镜像走 **LGPL-clean**：

- configure **没有** `--enable-gpl` / `--enable-nonfree` / `--enable-libx264`；
- H.264 编码用 **libopenh264**（Cisco，BSD-2-Clause，二进制专利费由 Cisco 承担）；
- 音频用 FFmpeg 原生 AAC 编码器。

代价：openh264 压缩效率比 x264 差一档，同画质文件大约 20–30%。成片存 R2、出网免费，
这点体积的账单远小于一个许可判断的代价。要换 x264（更小的文件）必须**先过法务**，
并把结论写回 `container/Dockerfile` 与本文件。

⚠ H.264 的**专利**许可（MPEG LA）与版权许可是两层，与上面的选择无关。

## 部署（给 owner 的命令）

前置：Workers Paid（$5/月）；Containers 需要 Docker 在本机可用（`wrangler deploy` 会
本地 build 镜像再推 Cloudflare 镜像仓）。

```bash
cd workers/render-video
npm install

# 1. secret（与 execution worker 同一个值 —— 回调签名共用一套口径）
npx wrangler secret put INTERNAL_CALLBACK_SECRET

# 2. 先干跑一遍，确认打包与容器配置没问题
npx wrangler deploy --dry-run

# 3. 真部署（会 build 并推容器镜像，第一次约 10–20 分钟：ffmpeg 是源码编译）
npx wrangler deploy
```

部署之后，在 **Next 的环境变量**里加一条（Vercel Project Settings → Environment
Variables）：

```
RENDER_WORKER_BASE_URL=https://pixelvault-render-video.<account>.workers.dev
```

⚠ 没有这一条时导出会**立刻大声失败**（503 + toast「RENDER_WORKER_BASE_URL is not
set」），⛔ 不会静默排队 —— 这是故意的。

### bindings / secrets 清单

| 名字                       | 类型           | 值 / 来源                                              |
| -------------------------- | -------------- | ------------------------------------------------------ |
| `RENDER_WORKFLOW`          | Workflow       | `pixelvault-render-video` / `RenderVideoWorkflow`      |
| `RENDER_CONTAINER`         | Durable Object | `RenderContainer`（migration tag `v1`, sqlite class）  |
| `GENERATION_BUCKET`        | R2             | `personal-ai-gallery`（与 execution 同一个桶）         |
| `INTERNAL_CALLBACK_URL`    | var            | `https://www.anteisuba.com/api/studio/render/callback` |
| `R2_PUBLIC_URL`            | var            | `https://cdn.anteisuba.com`                            |
| `INTERNAL_CALLBACK_SECRET` | **secret**     | 与 execution worker **同一个值**                       |

Next 侧要的：`RENDER_WORKER_BASE_URL`、`INTERNAL_CALLBACK_SECRET`（已有）。

## 成本

CF Container `standard-3`（2 vCPU / 8 GiB / 16 GB 盘），计价 CPU $0.000020/vCPU-秒 +
内存 $0.0000025/GiB-秒（Containers pricing，查阅 2026-09-09）：

- 一条 **2 分钟成片**跑约 120 秒 → `2×120×0.00002 + 8×120×0.0000025` ≈ **$0.0072**；
- R2 出网免费，素材与成片同在 Cloudflare 网络内 → 传输 ≈ $0；
- R2 存储 $0.015/GB-月（一条 1080p 2 分钟成片约 30–60 MB → 每条每月 < $0.001）；
- 每月含 375 vCPU-分钟 + 25 GiB-小时，日常用量基本落在免费额度内。

对照：Shotstack $0.40–0.60 / 2 分钟成片（贵 50–80 倍）。
**所以渲染一期不扣积分**（owner 定）；护栏是时长上限（900s）、段数上限（200）、
每用户在飞任务数（2）。

## 本地跑

```bash
cd workers/render-video
npx wrangler dev          # 需要 Docker 起容器
```

⚠ `wrangler dev` 会连**真 R2**（`remote: true`）—— 与 execution 同一条理由：Next 存
下来的 CDN URL 必须指向真的存在的对象。

## 测试

```bash
cd workers/render-video && npx vitest run
```

滤镜图与命令行生成器是**逐字断言**的纯函数测试（`src/lib/filtergraph.test.ts`）：
xfade 的 offset、atempo 串联、adelay 的毫秒与 `all=1`、amix 的 weights 与
`normalize=0`、黑场的 fade 时刻、`-ss`/`-to` 在 `-i` 之前 —— 每一条都对应一个真出过
问题的形状。
