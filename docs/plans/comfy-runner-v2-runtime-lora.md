# Comfy Runner v2 — 运行时 LoRA 下载（R2 权威版）

> 上游：`docs/plans/comfy-runner-HANDOFF-2026-07.md`（v1 部署已完成：端点 `01g8rrmixe4hah` + Volume `rk3t3mb1ko` 40GB + 4 底模）。v1 只认预烤 allowlist（1 把测试 LoRA），本包让 runner 能跑**任意 Civitai LoRA + 公开 Hugging Face 扩散 LoRA**。
> 2026-07-12 讨论拍板：R2 做权威 LoRA 仓库 / Volume 只留底模不涨 / 全局共享预算档（前期不做 per-user）/ Civitai token 走 API key。2026-07-14 增量：HF 只在 app 侧发现/缓存，Worker 仍只认 R2。

## 0. 现状与卡点（一句话）

- runner 出图链已通到 worker（gate 修复 `f0d3b5fc` 已上线）。
- 但 `workers/execution/src/models/runner/request-builder.ts` 对非 allowlist LoRA 直接抛 `RunnerLoraUnavailableError` —— stock `worker-comfyui` 镜像不能在请求时下载 LoRA（HANDOFF §2.3）。
- 结果：除 `RUNNER_LORA_ALLOWLIST`（`checkpoints.ts`，当前 1 把 `tutenstein-cleo-carter-v1` / 1672783）外，任何库 LoRA 都撞「not available on the runner」。

## 1. 目标架构（R2 权威 + Volume 固定）

```
① 首次有人要某把 LoRA（R2 里没）
   app（Next.js 服务端）→ 从 Civitai/Hugging Face 下载（HF 公开文件无需 token）→ 存进 R2
② 每次出图
   Cloudflare Worker：不再拒绝 → 给 RunPod job 附「LoRA 下载规格」（R2 预签名 URL + 目标文件名）
   fork 的 worker-comfyui：逐个 LoRA → 从 R2 拉到临时盘 models/loras/ → 跑 ComfyUI → 缩容清掉
```

**关键取舍（拍板）**：

- **R2 = 权威仓库**（无限、$0.015/GB、**出站免费**、app 已在用）。LoRA 存 R2，不存 Volume。
- **Volume 只留 4 底模**（固定 ~28GB，**永不涨**）→ 不扩容、不 LRU、不清理，Volume 管理问题整个消掉。
- **worker 每次从 R2 拉到临时盘**（不落持久 Volume）：R2→RunPod 出站免费、小文件几秒、不被 Civitai 限流；worker 热着时临时盘还能省重复拉。
- Civitai **只被打一次**（Civitai→R2），之后全走 R2 —— 根治 Civitai 429 限流。

## 2. 工作拆分（谁做什么）

| 块                                 | 内容                                                                                                                                                                    | 归属                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **②a fork worker-comfyui handler** | 官方镜像基础上加：读 job 里的 LoRA 下载规格 → 逐个从 R2 拉到 `/tmp` 或 `models/loras/` → 跑；下载源 allowlist（只放 R2/我们的域）；缺失/超时 → 结构化错误回传           | **代码=我写**（放新 fork 仓），构建/部署=owner |
| **②b RunPod infra**                | fork 仓接 RunPod **GitHub 自动构建** → 端点 template 指向新镜像；加 secret（若 worker 需直连 civitai 兜底才要 `CIVITAI_KEY`，纯 R2 路径可不放）                         | **owner 主导**（我给傻瓜步骤）                 |
| **①a app 侧 Civitai/HF→R2**        | service：给定 Civitai version URL 或 HF 具体文件 URL → R2 有则跳过，无则下载→存 R2→返回 R2 key/预签名 URL；Civitai 按 versionId 去重，HF 按 repo/revision/file 哈希去重 | **代码=我/Sonnet**，本仓 `services/`           |
| **①b Cloudflare Worker**           | `checkpoints.ts`/`request-builder.ts`/`workflow-builder.ts`/`index.ts`：非 allowlist 不再抛，派生确定性文件名 + 发下载规格（R2 预签名 URL），workflow 引用该文件名      | **代码=我/Sonnet**，本仓 `workers/execution/`  |
| **③ 护栏**                         | 下载源 allowlist（civitai/hf→R2）、冷启动 timeout 上调（120s→300s）、下载失败/超时结构化错误→友好文案（复用 `RUNNER_LORA_UNAVAILABLE` i18n）、Volume 只读底模不写       | 我/Sonnet                                      |
| **④ UI（可选，后置）**             | 冷启动「下载中…」进度态                                                                                                                                                 | 后置                                           |

**顺序**：②（fork+RunPod）是关键路径——②上线前 ① 无端到端可测。建议：我先把 ②a handler + ①a/①b 本仓改动**成套写好**（对齐 job input 契约），owner 并行走 ②b 部署，两边对齐后端到端测一张。**img2img（`a05f2eb2`）随这次 worker 重部署一起上线。**

## 3. Job input 契约（Cloudflare Worker ↔ fork worker）

现状 img2img 已有 `input.images:[{name,image(base64)}]` 先例。v2 加：

```jsonc
input: {
  workflow: { ... },              // ComfyUI workflow（引用下面的 filename）
  loras_to_fetch: [               // 【新】fork worker 据此下载
    { filename: "civitai-3118200.safetensors", url: "<R2 预签名 URL>", source: "r2" }
  ]
}
```

- `filename` 确定性派生（`civitai-<modelVersionId>.safetensors`），workflow 的 LoraLoader 用它。
- `url` = app 生成的 **R2 预签名 GET**（短时效）。`source` 限 `r2`（安全：worker 只从我们的 R2 拉，不直连任意 URL）。
- fork worker：`filename` 已在临时盘则跳过；否则拉 `url`→存→挂。

## 4. 全局共享预算档（前期，不做 per-user）

- 保持 `RUNNER_MONTHLY_LIMIT.LIMIT=300`（全局 `db.count`，UTC 月滚动）——所有用户共享，≈$10。
- RunPod 侧：预付 $10 + 关自动续费 = 硬顶（覆盖 server+生成）。
- **主动提示**（本包顺带做）：LoRA 工作台显示「本月 runner 剩余 N/300」，撞上限前就让用户知道（现状只在撞了才弹 `errors.provider.runnerMonthlyLimitExceeded`）。
- ⚠ 推广后再迭代：per-user 配额 / 付费档 / 抬预算。**本期不做**，先放用户看反馈。

## 4.5 部署顺序（**关键**，别踩）

v2 代码**替换**了 v1 的 LoRA 处理（request-builder 改吃 filename、不再按 allowlist
解析），所以：

- **fork（②a）没部署前，绝不能把 v2 代码 push 上生产**——否则 workflow 引用下载
  文件名（`civitai-<id>.safetensors`），但线上还是旧 fork（不下载）→ 文件不在 Volume
  → ComfyUI LoraLoader 崩，**runner 全崩，比现状（1 把预烤能用）更糟**。
- 正确顺序：① 代码本地 commit（不 push）→ ② owner 按 fork README 部署 fork + 端点换
  镜像 + 用测试 LoRA 验通 → ③ 再 push v2 代码（这时才活）。
- 实现记录：V2-1/2a（app R2 管线）+ V2-2b（worker）+ V2-2c（submit-image 集成）+ ②a
  （fork 三件）已写完，全绿（app 单测 + worker 53 测），**本地 commit、待 fork 部署后 push**。

## 5. 风险 / 坑

- **⚠ app-submit 下载 vs Vercel Hobby 60s**：`prepareRunnerLoras` 同步下载 Civitai→R2
  跑在出图请求函数里；典型 LoRA（带 token）几秒够，但**大/多/被限流**时可能超 Hobby
  60s 上限 → 超时。务实先上（撞到再迁）；**长期正解 = 把下载挪到 Cloudflare Worker**
  的长时 workflow（已有 R2 binding；需给它配 R2 S3 凭证 + Civitai token secret）。

- **冷启动 + 下载延迟**：首图 = 开机 + 拉 N 把 LoRA（各几秒）+ 出图 ≈ 30–90s；`Execution Timeout` 现 120s 可能不够 → **上调 300s**；给「下载中」进度态（④）。
- **R2 预签名 URL 时效**：要覆盖冷启动+下载窗口（给足如 15min）。
- **Civitai 视频封面/gated / HF gated**：Civitai 下载走 versionId + token；HF gated/private 首版不接；配方里的额外挂载 LoRA（截图那种叠 2 把）要**逐个**下。
- **fork 维护**：跟 upstream worker-comfyui 版本（现 5.8.6）——fork 尽量薄（只加下载 hook），便于跟版。
- **安全**：worker 只认 `source:r2` 的预签名 URL，不直连任意外链（防 SSRF）；app 侧下载源 allowlist（civitai.com/huggingface.co）。

## 6. 切片

- **V2-1**：app 侧 `civitai-lora-to-r2` service（Civitai→R2 去重下载）+ 单测。
- **V2-2**：Cloudflare Worker 改（不再拒绝 + 发下载规格 + workflow 引用）+ worker 单测。
- **V2-3**：fork worker-comfyui handler（新仓，Python）+ owner GitHub 构建/部署指令 + 端到端一张。
- **V2-4**：护栏（timeout 上调 / 结构化错误 / 源 allowlist）。
- **V2-5（可选）**：冷启动进度 UI。
- **旁**：本次 worker 重部署带上 img2img（`a05f2eb2`）。

## 7. 兑现的连带收益

- v2 通 → **Anima 命名撞车那个问题终于能真机验**（任意 Anima LoRA 下载即跑 → 看 anima_pencil-XL 出的脸对不对；对不上再收紧 `normalizeToLoraBaseFamily`）。
- runner 从「1 把样本」变「任意兼容的 Civitai / 公开 HF LoRA」，才真正可用。

## 7.5 部署实况（2026-07-12，已落地的资源）

fork 镜像与 RunPod 资源已由 Claude 用 `RUNPOD_KEY` 全自动建好并**真机验证出图**：

- **镜像**：`ghcr.io/anteisuba/pixelvault-runner-fork:5.8.6-r1`（public）。构建源＝私有仓
  `github.com/anteisuba/pixelvault-runner-fork`（3 文件 + `.github/workflows/build.yml`
  GHCR 构建；runner 需先清盘再 build，基础镜像解压 20GB+）。
- **RunPod template**：`pmh4gs9eht`（→ 上面镜像，isServerless）。
- **RunPod 新端点**：`p4qb5294ma1qzi`（name `pixelvault-runner-v2`，卷 `rk3t3mb1ko`，
  GPU [4090/A5000]，**executionTimeoutMs 300000**，min0/max1）。
- **旧端点 `01g8rrmixe4hah`（stock 镜像）保留** 作回滚目标。
- **验证**：真实 txt2img（`sdXL_v10VAEFix`，无 LoRA）→ COMPLETED，出 768×768 有效 PNG
  （delay 143s 冷启动 + exec 20s）。证明 fork 的 `start.sh` 未被盖、wrapper 转发、卷读底模、
  出图全通。（空 input 不是有效探针，别用。）
- **接线**：`workers/execution/wrangler.jsonc` 的 `RUNPOD_ENDPOINT` 已改 `p4qb5294ma1qzi`
  （本地 commit，待 `wrangler deploy`）。

剩余上线两步（owner 点头的 prod 部署）：① `cd workers/execution && npx wrangler deploy`
（v2 Worker 代码 + 新端点）→ ② push 前端 v2 代码（Vercel）→ 前端选没预烤的 LoRA 端到端验。

## 8. Owner 待办（账户侧，与代码并行）

1. RunPod：充 $10 + 关自动续费（Billing → Automatic Payments 关）+ 低余额提醒。
2. Civitai：生成 API token（Account Settings → API Keys）——app 已有一份 `CIVITAI_API_TOKEN` 可复用于 ①a。
3. ②b：fork 仓接 RunPod GitHub 构建 + 端点 template 换镜像（我给步骤）。
