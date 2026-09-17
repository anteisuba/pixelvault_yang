# Runner / LoRA 调研（2026-09-17，一手来源核对）

> 前置：`docs/references/domains/runner.md` 记的端点参数（Active 0 / Max 1 / Idle 5s / Timeout 120s）
> 与你说的现状（max 2 / min 0 / standby 1 / idle 60s）不一致，本页按你给的现状推。
> **"standby 1" 必须先核实到底是不是 RunPod 的 Active workers = 1** —— 见 A2，这是个 $800/月的问题。

---

## A · RunPod Serverless

官方冷启动优先级（[workers/overview](https://docs.runpod.io/serverless/workers/overview)、[development/optimization](https://docs.runpod.io/serverless/development/optimization)）：
**cached models > 烤进镜像 > network volume**。我们用的是**最慢的一档**，且官方明确写了 volume 在 worker 启动、计费开始之后才读。

1. **Cached models 用不了，别指望。** 只认 HF repo，且[每端点只能挂一个](https://docs.runpod.io/serverless/endpoints/model-caching)。我们 5 个 checkpoint 一个端点 → 不适用。
2. **Active workers（很可能就是你说的 standby 1）**：官方说 active ≥ 1 彻底消除冷启动，但**持续计费，包括空转**。
   4090 PRO $0.00031/s（[endpoint-configurations](https://docs.runpod.io/serverless/endpoints/endpoint-configurations)）→ $1.116/hr ≈ **$803/月**。
   而 `RUNNER_MONTHLY_LIMIT` = 300 图/月。**若 active=1 → 立刻改 0**，这笔钱买不到对应价值。
3. **⚠ 幻影 idle worker 的官方最优解释**（我认为这是真凶）：官方写明
   **3 天无请求 → max workers 自动降到 2 并发邮件；7 天无请求 → max workers 设为 0**，
   且"**降下去不会自动恢复，必须自己在控制台调回来**"（endpoint-configurations「Idle endpoint scale-down」）。
   端点长期没流量后请求永远停在 `IN_QUEUE`，与 §6 记的症状完全吻合。先查 max workers 是不是被降到 0。
   次要嫌疑：worker states 里的 **Throttled**（宿主资源不足，不计费）与 **Unhealthy**（崩溃后最长 7 天自动重试，不计费）——
   `/health` 只看 idle 会误判，要看全部桶。官方 worker states 表里**没有**"幻影 idle"这个状态。
4. **Network volume 锁死数据中心**（US-CA-2）→ GPU 池紧张时 Throttled 概率显著上升。
   官方解法：**挂多个不同数据中心的 volume**，worker 按位置各分一个。这直接缓解 3 的次要嫌疑。
5. **烤模型进镜像**：我们已经是自建 fork，边际成本只是镜像变大。建议**只烤最热的 1–2 个**
   （`anima-base-v1.0` + `waiIllustriousSDXL_v150` + 共享 `qwen_3_06b_base` / `qwen_image_vae`），其余留 Volume。
   代价：镜像变大 → 首次 init 变慢、host 镜像缓存命中率下降。别全烤。
6. **Idle timeout 60s**：**空转期间照样计费**。60s ≈ $0.019/次。只有"用户连续出图"命中率高时才划算。
   如果实际是零散单图，降到 15–20s；要留 60s 就先拿命中率数据。
7. **Auto-scaling**：官方建议把 queue delay 阈值从默认 4s **降到 2–3s**，冷启动早触发，白捡 1–2s。
8. **Execution timeout 120s 偏紧**：官方默认 600s。SDXL 30 步 + latent hires + 4× 放大，冷启后首图很可能超。
   **建议提到 180–300s**。另：冷启动 >7min 会被标 unhealthy，可用 `RUNPOD_INIT_TIMEOUT=800` 放宽。
9. **Max workers 2 够用**：官方公式 ≈ 预期并发 ×1.2；300/月 ≈ 10/天，并发几乎恒为 1。不要加。
10. **GPU 优先级**：现配置 4090 主 + A5000 备已符合官方"选多个类型提可用性"。注意官方现在的档位名是
    `4090 PRO 24GB $0.00031/s` 与 `L4, A5000, 3090 24GB $0.00019/s`。
11. **结果保留**：async `/run` 结果只留 **30 分钟**，回调链路要在窗口内取。

**优先级**：① 查 max workers 是否被自动降 0 → ② 确认 active workers = 0 → ③ 执行超时提到 180–300s →
④ queue delay 降 2s → ⑤ 多数据中心 volume → ⑥ 烤 1–2 个热 checkpoint 进镜像。

---

## B · ComfyUI 侧

1. **版本闸已开，`runner.md` §5 的结论过期了。**
   [worker-comfyui 5.10.0](https://github.com/runpod-workers/worker-comfyui/releases)（2026-09-01）= **ComfyUI 0.34.0**；5.8.7 = 0.29.0。
   我们 fork 基于 5.8.6 = 0.25.0。**Krea 2 要的 ≥0.27 已经满足**，不再是"只差发版"。
   ComfyUI 上游最新 v0.36.0（2026-09-15）。
2. **启动参数**（stock `src/start.sh` 只传 `--disable-auto-launch --disable-metadata --verbose $COMFY_LOG_LEVEL --log-stdout`；
   fork 已去掉 `--disable-metadata`）。可加，按收益排：
   - `COMFY_LOG_LEVEL=INFO` —— 默认是 **DEBUG**，官方文档自己写"生产用 INFO"。零风险。
   - `--highvram` —— 24GB 卡跑 6.9GB SDXL，用完不卸回 CPU，同 worker 连续出图第二张省掉重新上传权重。
     ⚠ Krea 2（fp8 13.1GB + qwen3vl 5.2GB ≈ 18.3GB）要谨慎，**别用 `--gpu-only`**。
   - `--fast fp16_accumulation` —— 4090 (sm89) 有效。**不要裸 `--fast`**：全开含 `fp8_matrix_mult / cublas_ops / autotune`，
     官方原文标 "untested and potentially quality deteriorating"，而忠实复刻是本项目卖点。
   - `--use-sage-attention` —— 镜像里**没装** sageattention 包，要在 fork Dockerfile 里加。对 SDXL 收益有限，
     对 DiT（Anima / Krea 2）收益更大。属于"想做 DiT 才做"。
   - 0.3x 的 dynamic VRAM / `--async-offload`（N 卡默认开）/ Comfy 编译器（默认开）**升级即得，不必显式传**。
   - `--preview-method` 默认已是 `none`，不用管。
     来源：[ComfyUI cli_args.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/cli_args.py)、
     [worker-comfyui start.sh](https://github.com/runpod-workers/worker-comfyui/blob/main/src/start.sh)、
     [configuration.md](https://github.com/runpod-workers/worker-comfyui/blob/main/docs/configuration.md)。
3. **workflow 预热 —— 性价比最高的一条。** stock handler 无预热钩子。fork 可在 `start.sh` 里、handler ready **之前**
   跑一次 64×64 / 1 步的最小 workflow，把默认 checkpoint 载进 VRAM。
   RunPod 的 **Initializing 阶段不计费**，把预热放在这之前 = 免费省掉首图的模型加载。
   Anima DiT 收益最大（UNET + CLIP + VAE 三个文件）。
4. **模型常驻的真问题不在 ComfyUI 缓存**，在"同一 worker 存活期间会不会换 checkpoint"。
   单端点服务 5 个 checkpoint，用户切底模就必然 6.9GB 重载。产品侧把默认底模收敛到 1–2 个比任何参数都管用。
5. **TeaCache 类加速：ComfyUI 核心已内置 `EasyCache` / `LazyCache`**（`comfy_extras/nodes_easycache.py`），不需要自定义节点。
   但它按扩散步跳算：20–30 步 SDXL 收益小且伤忠实度；DiT 多步才划算。**默认别开**，只在"快速预览"档考虑。
6. **自定义节点最小集**：现在只有 `pixelvault_model_evidence`，这是对的。
   ControlNet 走**核心节点**（`ControlNetLoader` / `ControlNetApplyAdvanced` 都在 `nodes.py`），不需要装包；
   ADetailer 类要 Impact Pack、per-block 权重要 Inspire Pack、IP-Adapter 要 IPAdapter_plus —— 每装一个都涨镜像和启动时间。
   ComfyUI-Manager 已被 start.sh 设成 offline 模式。
7. **`VAEDecode` 直连 `ImageUpscaleWithModel` 静默空结果**（§5 已知坑）：0.34 的 dynamic VRAM / async offload 大改，
   **升级后必须重测**，不要继续照抄旧的规避逻辑。

---

## C · 底模矩阵

Civitai LoRA 增量用官方 REST 实测（`types=LORA&baseModels=X&sort=Newest` 翻页数近 30 天）。
⚠ 仓库自己记过 `baseModels` 过滤有 coverage bug，所以这些是**下限**，用于横向比较而非绝对值。
Volume 现状：80GB / 已用 47.4 / 剩 **32.6GB**（只能扩不能缩，$0.07/GB/月）。

| 候选                                          | 架构·体积                                     | 许可证                               | Civitai 近 30 天新 LoRA     | 与现配方兼容性                                                                                                           | 结论                                                                                                |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Krea 2 Turbo**                              | 12B DiT · fp8 13.1G + qwen3vl_4b fp8 5.2G     | Krea 2 Community License（开放权重） | **≥1361**（14 页未见底）    | 需 ComfyUI ≥0.27（5.10.0 已到）；**VAE 就是 Volume 上 Anima 在用的 `qwen_image_vae`**；仿 Anima DiT 图改 CLIPLoader 即可 | **★ 最该加**。同时把 `CIVITAI_BASE_MODEL_GENERATABILITY['Krea 2']` external→native，兑现已写好的 UI |
| **Anima 新档**（aesthetic v1.1 / turbo v1.1） | 同 Cosmos-Predict2 2B                         | circlestone-labs 非商用              | **≥1340**（未见底）         | 同 repo、同 text encoder/VAE、**同一条 workflow**                                                                        | **★ 最低成本最高回报**。现仓库只有 `animaBase_v10`；Volume 上的 turbo 甚至没进 manifest             |
| **Z-Image Turbo**                             | 6B · bf16 + qwen_3_4b + 自带 `ae.safetensors` | **Apache-2.0**（唯一真可商用）       | ~190（Turbo 155 + Base 34） | 需新 VAE（不复用 qwen_image_vae），新一套 loader                                                                         | **值得加，但排第三**：供给比 Illustrious/Anima/Krea2 薄一个数量级；Apache-2.0 + 体积小是长期资产    |
| NoobAI-XL                                     | SDXL 系                                       | fair-ai-public-license（other）      | **112**（3 页见底）         | 已由 family `illustrious` 归桶，借 WAI 出图                                                                              | **不加独立 checkpoint**。除非有"NoobAI LoRA 出图明显崩"的实证                                       |
| Illustrious XL v2.0                           | SDXL                                          | creativeml-openrail-m                | —                           | 社区主力仍在 v0.1/v1.x 衍生（WAI 等）                                                                                    | **不加**。`waiIllustriousSDXL_v150` 是对的，只需跟 WAI 版本号                                       |
| WAI 系                                        | SDXL                                          | 随底模                               | LoRA 全登记为 `Illustrious` | 已在用                                                                                                                   | **不是独立家族**，无需新增                                                                          |
| **Pony V7**                                   | AuraFlow · 非 SDXL                            | other                                | **2**（全站仅 39 个 LoRA）  | 权重不通                                                                                                                 | **不加**。`normalizeToLoraBaseFamily` 对 V7 返回 null 的判断被数据证实                              |
| Qwen-Image                                    | 20B                                           | Apache-2.0                           | 9                           | 体积大                                                                                                                   | **不加**                                                                                            |
| Chroma (Chroma1-HD)                           | 8.9B                                          | Apache-2.0                           | 6                           | —                                                                                                                        | **不加**                                                                                            |
| FLUX.2 dev                                    | 32B                                           | FLUX 非商用                          | 5（全站 82）                | 24GB 卡要重量化                                                                                                          | **不加**                                                                                            |

**容量账**：Krea 2（18.3G）+ Anima 两档（≈5G）≈ 23G → 剩 ~9G，塞得下但很紧。
再加 Z-Image 就必须扩 Volume。建议顺序：**Anima 新档 → Krea 2 →（扩容后）Z-Image Turbo**。

---

## D · LoRA 出图缺的设置（按价值排）

对照 `src/constants/runner-sampling.ts`（sampler 23 / scheduler 9 已全）、`lora.ts`、`LoraWorkbench`
现有面板（steps / cfg / seed / negative / aspect ratio / 单一 LoRA scale / 4x-AnimeSharp / weight budget / trigger chips）。

1. **LoRA 白名单**（不是参数，但压倒一切）：`RUNNER_LORA_ALLOWLIST` 只有 **1 条**。stock worker 不支持运行时下载模型，
   所以库里几千个 LoRA 一个都挂不上。既然已有自建 fork，**在 fork 里做"按 Civitai URL 运行时下载到
   `/runpod-volume/models/loras` + SHA 校验 + LRU 清理"**，收益远超本清单其余全部之和。
2. **`strength_model` / `strength_clip` 分离**：现在两值同源。A1111/Forge/Civitai 配方普遍分开（角色 LoRA 常压低 clip）。
   `workflow-builder.ts` **已是两个字段**，只差配方解析 + UI。极低成本。
3. **clip skip 可被来源配方覆盖**：现在只读 manifest 硬编码（Pony=2 / SDXL=1）。clip skip 是 Civitai 配方标配元数据，
   忠实复刻场景下不可覆盖 = 直接失真。
4. **sampler / scheduler 暴露给用户**：常量、`normalizeCivitaiRunnerSampling`、`request-builder` 的
   `input.sampler/scheduler` **全都做好了**，workbench 没接选择器。属于"后端已完成、前端没接线"。
5. **负面 embedding**（easynegative / badhandv4 等）：ComfyUI 原生支持 `embedding:name` 语法，
   只要把几个常用 embedding 放进 `models/embeddings/` 并做负面预设。SDXL 系质量提升明显，成本极低。
6. **hires fix 开给用户**：后端 `hires`（倍率/denoise/steps/cfg + 2048 上限校验）已实现，但只由来源配方驱动。纯 UI 工作。
7. **CFG rescale**：ComfyUI 核心已有 `RescaleCFG` 节点（`comfy_extras/nodes_model_advanced.py`），一处 workflow 改动。
8. **ADetailer / FaceDetailer**：核心**没有**，要装 ComfyUI-Impact-Pack + 一个 bbox 检测模型。
   二次元人像感知提升最大的单项，但涨镜像和启动时间。中成本高回报。
9. **IP-Adapter / 多参考**：r4a **已施工完成、测试端点验证绿、生产未切换**（fork HEAD `c1dbf58`）。
   这是"已付成本未兑现"，边际成本只剩一次 fork 构建 + template + 端点滚动。按 ROI 其实该排更前，只是已在别处排队。
10. **ControlNet**：核心节点齐全，不需自定义节点；成本在 Volume（SDXL ControlNet 每个 ~2.5GB）+ 预处理器要自定义节点。
    容量是主要约束，排在扩容之后。
11. **X/Y 对照网格**：不需要任何 ComfyUI 改动（多发 job + 前端网格）。对"调 LoRA 权重"这个核心动作帮助很大，
    但 `RUNNER_MONTHLY_LIMIT=300/月` 会被一次 3×3 网格吃掉 3% —— **要先解限额，否则做了不敢用**。
12. **触发词自动化**：已有 `TriggerChipRow` + trainedWords。缺权重语法 `(word:1.2)` 和多 LoRA 触发词冲突提示。增量小。
13. **权重预算**：已有总和判（1.5 / 蒸馏 1.0）。缺单条上限与"同类型 LoRA 叠加"告警。低成本补足。
14. **per-block / block weight**：要 Inspire Pack 的 `LoraLoaderBlockWeight`。高级玩家功能，与 PixelVault 用户面不符。**最低优先**。

**未核实**：Anima 的 `ANIMA_MODEL_SAMPLING_SHIFT = 3.0` 硬编码 —— 作者是否对 base / aesthetic / turbo 各档推荐不同 shift，
我没在 HF 卡上找到明确表述。加新 Anima 档前需要读一遍对应版本的 `anima_comparison.json`。
