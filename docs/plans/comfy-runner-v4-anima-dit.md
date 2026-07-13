# Comfy Runner v4 — Anima DiT 管线支持（让 Anima LoRA 出对图）

> 状态：✅ **已交付上线（2026-07-13）** —— 全栈搭建 + 部署 + 真机出图验证通过
> 关联：[v3 底模按需下载](comfy-runner-v3-checkpoint-ondemand.md)、memory `project-comfy-runner`
> 日期：2026-07-13

## 0. 一句话

让 **baseModel = "Anima" 的 DiT LoRA**（本月最热 LoRA 的 ~47%，含实测的「心月狐」）在 runner 上**出对图**，而不是被路由到 SDXL 的 anima_pencil 出紫图垃圾、或被 v3 的止损改动直接拦住。

## 0.5 交付记录 & 解决过程复盘（本节点）

**问题起点**：用户报「心月狐 LoRA 在 runner 出的图完全不对」（紫发通用脸，非狐耳红裙）。

**一步步怎么查到根因**（可复用的诊断链）：

1. **v3 fork 直连测试 FAILED**，顶层 error 只有「Job processing failed」——先误以为是通用报错。**关键突破**：读 worker-comfyui `handler.py` 发现「Job processing failed」是它**自己**在「无输出图 + 有错误」时返回的（L885），真错在返回 dict 的 **`output.details`**（之前轮询漏了这个字段）。取到真错 = `CLIPSetLastLayer clip-skip 'NoneType' object has no attribute 'clone'`（CLIP=None）。
2. **safetensors 头部分析**（不下 GB 级）：`?token=` range GET 前 ~100KB，解析头 JSON 的全部 tensor 名 → 全是 `model.diffusion_model.blocks.N.adaln_modulation_*`、**无 CLIP/VAE** → 是 **DiT（Diffusion Transformer）**，不是 SDXL 的 UNet。
3. **Civitai/浏览器确认**：`models?baseModels=Anima` 过滤（比 flaky 的 query 搜索可靠）+ 浏览器打开心月狐页坐实：Base Model = **Anima**、License「CircleStone Labs · Built on **NVIDIA Cosmos**」→ 根因 = **心月狐是 Cosmos-Predict2 DiT，SDXL runner 的 `CheckpointLoaderSimple` 图天生跑不了它**（UNET-only、无 CLIP/VAE）。

**关键弯路修正**：中途一度按「拦住不出垃圾」做了 v3 止损（`normalizeToLoraBaseFamily('anima')→null`）。用户明确「拦住不是目的，出对图才是」→ 转为搭第二套 DiT 管线（本方案）。

**怎么解决的**（正解）：

- 研究 Anima 的 HF 页 + `anima_comparison.json` 工作流 → 确定它 **ComfyUI 原生支持**（Comfy Org 参与）、全标准节点、三文件 + 确切参数（CLIPLoader type=`stable_diffusion`、ModelSamplingAuraFlow shift=3、er_sde/30/cfg4）。
- **节点探针排雷**：给现役 r2 端点发「Anima 节点 + 假文件名」workflow → 全报 `value_not_in_list`（文件缺）而非「节点类型不存在」→ 一锤确认 fork 的 ComfyUI 支持整套 Anima 节点。
- **落盘目录排雷**：查 ComfyUI `folder_paths.map_legacy` = `{unet→diffusion_models, clip→text_encoders}` → 底模落 `models/unet/`、编码器落 `models/clip/`（落「自然名」目录会静默找不到）。
- 搭第二套工作流（Worker `anima-workflow-builder` + 架构分派）+ 架构感知路由（app 翻转 `'anima'→'anima-dit'` 支持）+ fork **HF 自播种**配件（放弃 CPU Pod 预灌）。

**交付**（2026-07-13）：

- 代码全绿：app tsc0/vitest 3262 · worker tsc0/vitest 57；commit `31d6d2c0` 推 main（pre-push 全量 vitest 通过）。
- Runner 侧部署：fork r3 镜像（GHCR `:5.8.6-r3`，commit 42ef4d8）+ RunPod template `pmh4gs9eht`→r3 + worker `wrangler deploy`（Version 28f86f1b）。
- ✅ 真机出图验证通过：Anima LoRA 在 runner 出对图（本条据用户「完全没问题了」确认）。

**可复用的教训**：

- worker-comfyui 的「Job processing failed」是它自己无输出的返回，真错在 `output.details` / 顶层 error，别停在通用消息。
- 判 checkpoint 架构不用下整包——读 safetensors 头 JSON 的 tensor 名即可（DiT 有 `adaln_modulation`、无 `conditioner.embedders`）。
- Civitai 判 baseModel 用 `baseModels=` 过滤，别用 flaky 的 `query=` 搜索。
- 加新架构前先用「节点 + 假文件名」探针确认 ComfyUI 支持，避免在沙上盖楼。
- **1 套工作流 = 1 个架构，覆盖该架构下全部 LoRA**，不是每把 LoRA 一套。

## 1. 触发 / 为什么

- **心月狐已浏览器坐实是 DiT Anima**（Civitai model `2736194` / ver `3076650`，Base Model = **Anima**，License「CircleStone Labs · **Built on NVIDIA Cosmos**」，132MB / 1344 tensors）。SDXL runner 的 `CheckpointLoaderSimple` 图跑不了它（实测 `CLIPSetLastLayer` 拿到 CLIP=None 崩），因为 Anima 权重是 UNET/DiT-only、无 CLIP/VAE。
- v3 的止损改动（`normalizeToLoraBaseFamily('anima')→null`）只做到「明确拦住不出垃圾」，**不是出对图**。本方案是正解。
- Anima 是**独立架构**，必须**第二套工作流**，不能共用 SDXL 那套。

## 2. Anima 架构定性（研究已完成）

- **Anima = CircleStone Labs × Comfy Org 合作的 2B 文生图模型**，底座 `nvidia/Cosmos-Predict2-2B-Text2Image`（finetune）。**Comfy Org 亲自参与 → ComfyUI 一等公民支持**。
- HF：`huggingface.co/circlestone-labs/Anima`（月下载 78 万、28 个 HF Space 在用）。
- **「natively supported in ComfyUI」+ 工作流全用标准节点、零自定义节点**（`anima_comparison.json` 实测：UNETLoader / CLIPLoader / VAELoader / ModelSamplingAuraFlow / KSampler / CLIPTextEncode / EmptyLatentImage / VAEDecode）。
- 版本：Anima-Base（LoRA 就在这上面训，最忠实）/ Anima-Aesthetic（默认画风更好）/ Anima-Turbo（CFG1·8-12 步·快）。
- **score\_ 标签正常**：Anima 训练用 Danbooru tags + score tags（"PonyV7 aesthetic based: score_9…"）——心月狐配方里的 `score_9/8/7` 不是矛盾，是 Anima 的正常提示法。

## 3. 三文件（HF · split_files/）

| 文件                                              | **Volume 落盘目录** | 大小        | 性质                      | 来源                                  |
| ------------------------------------------------- | ------------------- | ----------- | ------------------------- | ------------------------------------- |
| `anima-base-v1.0.safetensors`（或 recipe 精确版） | `models/unet/`      | 3.9 GB      | **per-recipe / 默认档**   | HF `…/split_files/diffusion_models/…` |
| `qwen_3_06b_base.safetensors`（文本编码器）       | `models/clip/`      | **1.14 GB** | **共享**（全 Anima 复用） | HF `…/split_files/text_encoders/…`    |
| `qwen_image_vae.safetensors`（VAE）               | `models/vae/`       | **242 MB**  | **共享**                  | HF `…/split_files/vae/…`              |

⚠**落盘目录用 volume 现成映射**（不改 extra_model_paths.yaml）：worker-comfyui 的 yaml 只映射了
`unet:`/`clip:`/`vae:`，而 ComfyUI `map_legacy` 把 `unet→diffusion_models`、`clip→text_encoders`。
所以 UNET 落 `models/unet/`（UNETLoader 找 "diffusion_models" folder 时含它）、文本编码器落
`models/clip/`（CLIPLoader 找 "text_encoders" folder 时含它）。**落到 `models/diffusion_models/`
或 `models/text_encoders/` 会找不到**（volume 上没映射这两个名）。工作流里只写 basename，ComfyUI 按 folder 搜。

共享配件合计 ~1.4 GB，一次入卷永久复用。Volume 80GB，SDXL 工作集 ~26GB + Anima 若干，够。

## 4. 工作流（确切节点 + 参数，来自 anima_comparison.json）

```
UNETLoader(<anima ckpt>, "default")
        │ MODEL
        ▼
ModelSamplingAuraFlow(shift=3.0)          ← Anima 必需的采样 shift
        │
        ▼
LoraLoaderModelOnly(<anima lora>, strength)  ← 挂 Anima LoRA（心月狐 0.6）
        │ MODEL
        ▼
KSampler(steps=30, cfg=4, sampler="er_sde", scheduler="simple", denoise=1)
   ▲ positive / negative           ▲ latent
   │                               │
CLIPTextEncode ×2                EmptyLatentImage(w,h,1)
   │ CLIP
   ▼
CLIPLoader("qwen_3_06b_base.safetensors", type="stable_diffusion", "default")

VAELoader("qwen_image_vae.safetensors") ──► VAEDecode(samples, vae) ──► SaveImage
```

**关键点（没真工作流绝对猜不到）**：

- `CLIPLoader` 的 type 是 **`stable_diffusion`**（不是 "qwen"），device `default`。
- `ModelSamplingAuraFlow` shift **3.0** 挂在 MODEL 上，KSampler 前。
- 采样：`er_sde` / `simple` / 30 步 / CFG 4-5（Turbo 档：CFG 1 / 8-12 步）。
- 分辨率 512²–1536²（心月狐配方 1024×1536 在范围内）。
- LoRA 走 **`LoraLoaderModelOnly`**（README：不要训 LLM adapter，LoRA 只作用扩散模型）——⚠须实测确认能挂上 Cosmos UNET。

## 5. 施工 5 步（跨 app + worker + fork + volume）

### ① 共享配件——fork 自播种（不用 CPU Pod）✅ 已实现

放弃 CPU Pod 预灌，改成 **fork 首次 Anima 作业从 HF 自拉入卷**（缺则下、有则跳＝永久缓存），跟下 Civitai checkpoint 一个模式、更自洽：Worker 给 Anima 作业发 `companions_to_fetch`（Qwen 编码器→`models/clip`、VAE→`models/vae`；T2 再加 anima-base→`models/unet`），fork `ensure_companions` 从 `huggingface.co`（host 白名单防 SSRF、公开无需鉴权）下到对应目录。⚠首次 Anima 作业多下 ~1.4GB（+T2 时 anima-base 3.9GB），一次性，之后卷上缓存秒取。

### ② fork 支持下到 `models/diffusion_models/`（rebuild r3）

现 `ensure_checkpoint` 只下到 `models/checkpoints/`。给 `checkpoint_to_fetch` 加 `target_dir`（枚举：`checkpoints` | `diffusion_models`），DiT 用后者。同时**共享配件不走下载**（已入卷），fork 只需保证 diffusion_models 目录存在。r2→r3 升 tag、GHCR Actions 重构建、PATCH template。

### ③ Worker 建 Qwen-Image/Anima DiT 工作流（最实的一块）

`workers/execution/src/models/runner/` 加第二套 builder（`anima-workflow-builder.ts`），按 §4 的节点图组装；`request-builder` 按架构分派 SDXL builder vs Anima builder；`index.ts submitRunnerImageJob` 对 Anima 走 `checkpoint_to_fetch{target_dir:'diffusion_models'}`，共享配件用固定文件名（不下载）。⚠**开工前第一件事：查 fork ComfyUI `/object_info`**（跑一个 job 返回 object_info）确认有 `ModelSamplingAuraFlow` + CLIPLoader type `stable_diffusion` + Cosmos-Predict2 架构检测——这是唯一未验证的可行性闸门（高置信但要一锤定音）。

### ④ 路由（app）

- `normalizeToLoraBaseFamily`：`s === 'anima'` 从 v3 的 `→null` 改成 `→'anima-dit'`（新家族，**支持**）。⚠加 `'anima-dit'` 到 `LoraBaseFamily` 枚举。
- `LORA_BASE_MODELS` 加 `anima-dit-runner` 条目（family `'anima-dit'`、backend runner、指向新 runner 模型 / checkpoint 默认档）。
- fidelity/prepare：Anima 家族标记走 DiT 工作流；per-recipe 精确 Anima checkpoint（若公开）走 T1 下到 diffusion_models，私有（如 BSSANIRLANIMASemi）→ T2 用 `anima-base` 默认档（**这恰是对的近似**，因为 LoRA 本就在 Anima-Base 上训）。
- 两侧 manifest（`src/constants/runner-checkpoints.ts` ↔ worker `checkpoints.ts`）加 Anima 默认档 + 标 family/arch。

### ⑤ 真机端到端验（心月狐）

选 anima-dit runner 底模 → 挂心月狐 LoRA（0.6）→ 出图应是正确的心月狐（银发狐耳红裙），非紫发通用脸。每轮 ~15min（GPU 排队 + 冷启动 + 3.9GB 下载）。

## 6. 风险 / 闸门

1. ~~**【首验】fork ComfyUI 版本**~~ ✅ **已探针确认**：给 r2 端点发「Anima 节点 + 假文件名」workflow，全报 `value_not_in_list`（文件缺）而非「节点类型不存在」→ ComfyUI 原生支持全套 Anima 节点（含 CLIPLoader type `stable_diffusion`）。此闸门已过。
2. **LoRA 挂 Cosmos UNET**：`LoraLoaderModelOnly` 通用，Anima LoRA 1344 tensors 作用扩散模型，大概率能挂——须实测。
3. **per-recipe 精确档多为私有**（BSSANIRLANIMASemi 搜不到）→ 多数 Anima recipe 落 T2 用 anima-base 默认档。因 LoRA 在 Base 上训，这个「近似」其实很忠实，可接受。
4. **License**：Anima 是 Non-Commercial（CircleStone）+ NVIDIA Open Model License。runner 是免费额度、非商用 API 收费 → 目前用法在允许范围（生成的图可商用；不得把模型藏在收费 API 后）。⚠若未来 runner 商业化，需复核。

## 7. 契约变更清单

- `checkpoint_to_fetch`：加 `target_dir?: 'checkpoints' | 'diffusion_models'`（默认 checkpoints，向后兼容）。app→worker→fork 三方同步。
- worker workflow 选择：按 runner checkpoint / 家族的 arch 字段分派 SDXL vs Anima builder。
- `LoraBaseFamily` 加 `'anima-dit'`；`RUNNER_CHECKPOINT_FAMILIES` 相应加。

## 8. 不做 / 边界

- 不接 Anima-Turbo 的特殊 CFG1/8步档做二级切换（先用 Base/Aesthetic 标准档；Turbo 作为可选默认档，参数固定）。
- 不做 RES4LYF beta57 scheduler（自定义节点，画质增强项，非必需）。
- 其他 DiT 架构（Chroma / Lumina / NetaYume / Newbie-Image）本期不接——先打通 Anima 这一条（占比最高），架构分派留扩展位。
