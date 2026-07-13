# Comfy Runner v3 — 底模按需下载 + 保真度分级

> 上游：v2「运行时 LoRA 下载」已上线（`docs/plans/comfy-runner-v2-runtime-lora.md`）。v2 让 runner 能跑任意 LoRA，但**底模仍固定 4 个**（WAI-Illustrious / anima_pencil-XL / Pony V6 / SDXL 1.0）——LoRA 的真实底座若不在这 4 个里，就被**误路由**（Anima 命名撞车实例，见 §2.4）或**死路**（Krea/Qwen/... 选不了底模）。v3 让**底模也按需下载**，并对下不到的情况**诚实分级**。

> 2026-07-12 讨论拍板；关联 [[project-comfy-runner]]。

## 0. 背景与数据

- **现状缺口**：`getCompatibleBases` 只认 4 个预烤家族。非这 4 族的 LoRA → 无兼容底模或错路由。
- **本月最热 LoRA 的 baseModel 分布**（Civitai `sort=Most Downloaded&period=Month`，n=100）：
  Anima 47% · Krea 2 35% · Illustrious 8% · Z-Image 5% · Flux 2% · Pony 1% · 其余零星。
- **口径修正**：47%/35% 是 **Civitai 全站**；本 app 是 anime 画廊，用户实际挂的绝大多数是 SDXL-anime，Krea 2（写实 DiT 流）在本 app 占比低得多。
- **库现状**：LoRA 库筛选已列 `Illustrious/Flux.1 D/SDXL 1.0/Pony/SD 1.5/Anima/Qwen/Z-Image/Chroma/other`——非 SDXL 架构早已露出，但**一个都跑不了**（现在是静默死路）。

## 1. 目标架构（下载分工）

```
① checkpoint（底模）—— GPU 侧直下（新）
   app 按配方源图记录的 checkpoint hash 定位真 checkpoint → 附「checkpoint spec」
   → fork 从 Civitai 直下到 /runpod-volume/models/checkpoints/（缓存，LRU）→ ComfyUI
   理由：底模 大/少/高复用/下载极少 → 不绕 R2；Civitai 限流风险低（下一次常驻）

② LoRA —— R2 权威（保留 v2 现状）
   app 下 Civitai→R2（去重）→ loras_to_fetch（预签名）→ fork 从 R2 拉 → ComfyUI
   理由：LoRA 小/多/高 churn → R2 去重 + 挡 Civitai 429
```

Volume **40→80GB**（本会话已 `PATCH /networkvolumes/rk3t3mb1ko size=80` 在线扩完，无迁移）；checkpoint + lora **共用 80GB，LRU 淘汰最久未用**。

## 2. 保真度分级（出图前判定，核心）

| 级          | 条件                                                             | 行为                                                                                                                                               |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1 忠实** | 能定位真 checkpoint 且能下载                                     | 下对底模跑 → 结果贴源图                                                                                                                            |
| **T2 近似** | 真 checkpoint 下不到（gated/已删/无源），但**有同架构可用底模**  | ⚠ 弹确认：「此 LoRA 的底模 &lt;X&gt; 暂不可得，将用最接近的 &lt;Y&gt; 生成，结果可能与原图有差异，是否继续？」→ 继续则结果打「近似」章，不假装忠实 |
| **T3 拦**   | **无同架构支持**（非 SDXL/SD1.5，如 Krea 2/Qwen/Z-Image/Chroma） | 明确告知「此底模架构暂不支持自托管生成」。Flux 例外 → 指向 fal 快速档                                                                              |

### 2.4 顺带根治：Anima 命名撞车

现状 `normalizeToLoraBaseFamily`/`getLoraFamilyBucket` 用 `includes('anima')` 把
**CircleStone Anima**（`Anima-Base`/`BSSANIRLANIMASemi`，LoRA 真底座）和 runner 的
**anima_pencil-XL**（bluepen5805，SDXL 系，是另一个模型）并成同族 → LoRA 被路由到错底模，
出通用脸（真机实测：心月狐 grey → 紫发通用）。

v3 的定位改用**配方源图记录的 checkpoint hash 精确定位**（而非 baseModel 名字归类）→
下对的那个 Anima checkpoint → 撞车自然消解。

## 3. 支持范围（本期 Phase 1）

- **runner 支持的架构**：SDXL 系（Illustrious / Pony / SDXL / **Anima**）+ **SD 1.5**。
  —— ComfyUI 原生同一套 workflow（`CheckpointLoaderSimple`，只换 `ckpt_name`），几乎零管线改动。
- **Flux.1 D** → 走 **fal**（hosted `flux-lora`），runner 不接。
- **其余**（Qwen / Z-Image / Chroma / **Krea 2**）→ **T3 明确告知**。
- **Krea 2** → 【搁置】见 §7。

## 4. 命名 A（fal vs runner，已锁）

现「快 / 忠实」只说输出差别，藏了「要不要自己的 key / 免不免费」这个实际门槛。改：

- **runner**：主名 **「忠实还原」** + 徽标 **「免费 · 本月剩 N/300」**
- **fal**：主名 **「极速」** + 徽标 **「需 API Key」**（无 key 点了 → QuickSetup）

主名保留「输出差别」（选它的理由），费用/门槛做徽标一眼可见。**独立小改，可先于 v3 上线**。
触点：`constants/lora-base-models.ts`（displayName/label）+ i18n 三语。

## 5. Volume 预算（实测 checkpoint 大小）

| 底模族                           | 单个                                     | 备注              |
| -------------------------------- | ---------------------------------------- | ----------------- |
| Anima（CircleStone）             | ~3.9GB                                   | 比 SDXL 还小      |
| SD 1.5                           | ~2–4GB                                   | 小                |
| SDXL 系（Illustrious/Pony/SDXL） | ~6.5GB                                   | 现有 4 个已 ~28GB |
| ~~Krea 2（DiT 栈）~~             | ~~12–24.5GB + Qwen 编码器 ~5–8GB + VAE~~ | 【搁置】          |

- **Phase 1 工作集** ≈ 现 4 SDXL(28) + 按需 4–5 个 SDXL/Anima(~20) + SD1.5 两三个(~8) + LoRA 缓存(~20)
  ≈ **~76GB** → **80GB（已扩）够**，LRU 兜。「每族一个代表」更省 ≈ ~26GB。

## 6. 切片 / 触点

- **V3-1 · app 解析 + 分级**：新 service，按配方源图 checkpoint hash → Civitai checkpoint 下载 URL；
  判 T1/T2/T3（复用 `resolveCivitaiLora` 思路 + `getLoraFamilyBucket` 架构判定）。**这块＝ Anima 撞车正解**。
- **V3-2 · app→worker 契约**：附「checkpoint spec `{filename,url,source:'civitai'}`」（类比 `loras_to_fetch`）。
- **V3-3 · fork**：加 `CIVITAI_KEY` secret + **civitai 域白名单（防 SSRF）** + 429 退避（≥75s）
  - 下 checkpoint 到 `models/checkpoints/`（缺则下、有则跳）+ **LRU 淘汰**（checkpoint + lora 共 80GB）。
- **V3-4 · UI**：T2 确认弹窗 + 结果「近似」章 + 首图下载进度态 + **命名 A**。
- **V3-5 · manifest**：从「固定 4 枚举」变「**架构白名单 + 动态**」——`checkpoints.ts` 不再列死具体
  checkpoint，改判 `family ∈ {illustrious,pony,anima,sdxl,sd15}` 是否 supported；两侧同步方式随之变。

## 7. 【搁置】Krea 2（写实 DiT 流）

- **为何搁置**：Civitai 全站 35% 但**本 anime app 占比低**；**12B DiT 新架构**（Qwen Image VAE + 12B DiT
  - Qwen3-VL 编码器），要 **ComfyUI 0.26+** + 另一套 workflow + 大模型栈（checkpoint 12–24.5GB + 编码器
    ~5–8GB）→ **完整 SDXL 工作集 + Krea 2 会超 80GB**。
- **何时捡回**：确定要进军写实生成，且愿意 **扩 Volume 到 ~120–160GB**（同一个 PATCH，+$5.6–8.4/月）
  **或强制用量化 Krea 2**（fp8 ~12GB / GGUF Q4 ~7GB）+ 收紧 SDXL LRU。届时另开 Phase 2 施工，
  先查 Comfy-Org 官方 Krea 2 推荐配置再定。

## 8. Owner 待办

1. Volume 80GB —— **本会话已扩完**（`rk3t3mb1ko` size=80，US-CA-2）。
2. fork 重部署时加 `CIVITAI_KEY` secret（v3 checkpoint 直下要）。
3. Krea 2 搁置，触发条件满足时再议扩卷 / 量化。
