# 模型精简提案

> **Status**: 草案，待用户确认
> **Last updated**: 2026-05-15
> 当前 51 个模型（44 active + 7 retired），UI 选择器已经过载。本文档梳理冗余 / 可下线候选，**不直接动代码**。

---

## 当前盘点（来源：`src/constants/models/{image,video,audio,model-3d}.ts`）

| 类型     | Active | Retired (`available: false`) |  总计  |
| -------- | :----: | :--------------------------: | :----: |
| Image    |   23   |              5               |   28   |
| Video    |   14   |              2               |   16   |
| Audio    |   2    |              0               |   2    |
| 3D       |   5    |              0               |   5    |
| **合计** | **44** |            **7**             | **51** |

---

## 不能物理删除的对象

`available: false` 的 7 个 retired 模型 **不要删 enum / 不要删 i18n key**，因为：

- `prisma/seed.ts` / `prisma/seed.mjs` 引用了旧 `id` / `externalModelId`
- `src/constants/models.ts` 中的 i18n 名称映射、provider 名映射会被历史 generation 记录用来渲染"这张图当时用的是什么模型"
- `fal/video-request-builders.ts` 里 `case AI_MODELS.SEEDANCE_PRO:` 这类 switch 仍然要能匹配旧 generation 的回放

它们是**历史数据兼容层**，不是死代码。当前 `available: false` 已经把它们挡在 UI 之外，这就是正确做法。

如果以后真的想让 enum 也清理：需要先在 `Generation` 表里写 migration 把旧 modelId 重定向到 "legacy" 字面量，然后才能删 enum。这是一次独立的工作，不应混在精简里。

---

## Image 模型：23 → 建议 14

冗余分布：

### 类别 A — 同 provider 同档冗余

| 候选下线                        | 重叠原因                                                                                     | 替代                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `flux-2-dev`                    | `flux-2-pro` / `flux-2-max` 已经覆盖 premium，`flux-2-schnell` 覆盖 fast；dev 中间档定位模糊 | `flux-2-pro`（质量）+ `flux-2-schnell`（速度）         |
| `flux-2-max` 或 `flux-2-pro`    | 两个都是 premium photorealistic，max 比 pro 贵 1 cost，差异主要在分辨率                      | 留 `flux-2-pro`，下线 `flux-2-max`（用户感知差异不大） |
| `nai-diffusion-4-full`          | V4.5 Full / Curated 已是 premium，V4 Full 同等价位但旧一代                                   | `nai-diffusion-4-5-full`                               |
| `sdxl`                          | 完全被 `sd-3.5-large` 覆盖，且是 budget 档（用户不会主动选 budget 开源模型）                 | `sd-3.5-large`                                         |
| `playground-v2.5`（已 retired） | —                                                                                            | —                                                      |

### 类别 B — 同档跨 provider 冗余

| 候选下线                              | 重叠原因                                                                                              | 替代                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `seedream-4.0`（VolcEngine standard） | 与 `seedream-4.5`（fal premium）+ `seedream-5.0-lite`（VolcEngine premium）三选一里属于中间，意义不大 | 留 4.5 + 5.0-lite，下线 4.0                                |
| `flux-lora`                           | `noobai-xl` (anime LoRA) + 用户自训 LoRA 已能覆盖 LoRA 场景；`flux-lora` 没有内置 LoRA 库             | `noobai-xl` for anime；fast generation 用 `flux-2-schnell` |

### 类别 C — 保留的核心 14 个

```
Premium 通用:    gpt-image-2, gemini-3-pro-image, flux-2-pro
Premium 美学:    seedream-4.5 (fal), seedream-5.0-lite (VolcEngine 国内直连)
Editing:         flux-kontext-pro, flux-kontext-max
Standard 快速:   gemini-3.1-flash-image (free tier), flux-2-schnell
Design:          ideogram-3, recraft-v4-pro
Anime:           nai-diffusion-4-5-full, nai-diffusion-4-5-curated, animagine-xl-4.0
Anime + LoRA:    noobai-xl
Open-source:     sd-3.5-large
```

实际是 16 个 — 已经精简到核心。如果再往下砍：

- `recraft-v4-pro` 可下，让 `ideogram-3` 独占 design
- `animagine-xl-4.0` 可下，让 NovelAI 独占 anime（但 animagine 是免费 HF inference，对没 NovelAI 订阅的用户友好）

---

## Video 模型：14 → 建议 8

### 类别 A — fal vs VolcEngine 双发同模型

Seedance 系列在 fal 和 VolcEngine 各有一份，国内用户走 VolcEngine 快、海外走 fal 快 —— **这个冗余是合理的**，不要砍。但可以让 UI 把同一模型的两条 route 折叠展示，让用户不感知是两条记录。

不过 `seedance-2.0-fast-volc` (VolcEngine) 和 `seedance-2.0-fast` (fal) 同档同模型重复 —— 留一个就够。建议：

- 国内部署 → 留 VolcEngine 版本，下线 fal 版本
- 海外部署 → 留 fal 版本，下线 VolcEngine 版本

这是部署区域决定的，不是产品决策，可以做 env-driven 显隐。

### 类别 B — 中端冗余

`pika-v2.5` / `luma-ray-2` / `minimax-hailuo-2.3` 三个都是 standard 档 standard quality，定价 3–4 cost。能力都是基础 T2V/I2V，没有明显差异化（不像 Kling 有多镜头、Veo 有 4K、Seedance 有 lipsync）。

建议保留 1–2 个：`luma-ray-2`（"coherent motion"特色）+ `minimax-hailuo-2.3`（"camera control"特色）。下线 `pika-v2.5`。

`runway-gen3-turbo` 只有 I2V，且行业标准更新得快，Gen-3 已经被 Gen-4 取代 —— 建议下线。

### 类别 C — Budget 档

`wan-v2.6` 和 `hunyuan-video` 都是 budget。Wan 多模态（含音频）+ 1080p，Hunyuan 自托管定位。建议保留 `wan-v2.6` 一个。

### 类别 D — 保留的核心 8 个

```
Premium:    veo-3.1, kling-v3-pro, seedance-2.0
Standard:   kling-v2.1-master, luma-ray-2, minimax-hailuo-2.3, seedance-1.5-pro (volc 国内)
Budget:     wan-v2.6
```

---

## Audio 模型：2 → 保持 2

`fish-audio-s2-pro` (premium TTS) + `fal-ai/f5-tts` (free zero-shot 语音克隆)，覆盖完整且无重叠。**不动**。

---

## 3D 模型：5 → 建议 3

| 候选下线               | 重叠原因                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `hunyuan3d/v2`（v2.1） | `hunyuan3d-v3` 已上线，v2.1 完全被覆盖                          |
| `trellis-2`            | 和 `hunyuan3d-v3` 同档 premium，但 hunyuan 系列在中文社区更常见 |

保留：

```
Premium:  hunyuan3d-v3.1-pro, hunyuan3d-v3
Free:     triposr (sub-second preview)
```

---

## 落地步骤（如果用户认可）

每一步都可独立提交，不要一次性合并：

1. **审核与确认** — 用户在本文档基础上勾选要砍的模型
2. **改 `available: false`** — 把要下线的模型改为 unavailable，不删除（保护历史 generation 显示）
3. **更新 i18n** — 不删除 retired key，只在必要时调整 `recommendedModels` 排序
4. **更新 `model-doc-monitor.snapshot.json`** — 让周检不报"模型消失"
5. **更新文档** — 把本文档列入 README "已完成精简" + 更新 README 的"Image / Video Models"表
6. **保留物理 enum** — 不动 `models/enum.ts` 和 i18n 名称映射
7. **观察一周** — 如果用户没有反映"我想用的模型不见了"，再考虑下一批

---

## 版本时效审计（2026-05-15 核查）

精简之前必须先看每个 active 模型有没有被新版本取代或被 sunset。下表只列**有问题**的，没列出的 = 当前最新或仍是同档 SOTA。

### 🔴 高风险：已被 ≥2 代新版本取代，应优先升级或下线

| 项目 enum                   | externalModelId                                | 现状                                                                                                   | 建议                                                       |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `RECRAFT_V4_PRO`            | `fal-ai/recraft/v4/pro/text-to-image`          | **V4.1 于 2026-05-14 发布**（含 Pro / Utility / Vector 多 variant）                                    | 升级到 `fal-ai/recraft/v4.1/pro/text-to-image`（一行改动） |
| `KLING_VIDEO` (V2.1 Master) | `fal-ai/kling-video/v2.1/master/text-to-video` | **被 Kling 3.0 / Kling 3.0 Omni 取代**（2026-02 发布）；项目已有 `KLING_V3_PRO`，V2.1 现成冗余         | **下线**（`available: false`）—— V3 Pro 已覆盖该价位       |
| `LUMA_RAY_2`                | `fal-ai/luma-dream-machine/ray-2`              | **Ray 3 于 2025-09 发布**；Luma 状态页显示 Ray 2 资源紧张 / 队列变长                                   | 升级到 Ray 3 endpoint                                      |
| `RUNWAY_GEN3`               | `fal-ai/runway-gen3/turbo/image-to-video`      | **落后两代**：Runway 已发 Gen-4（2025-03）+ Gen-4 Turbo（2025-04）+ Gen-4.5（2025-12，Video Arena #1） | 升级到 Gen-4 Turbo 或 **下线**                             |

### 🟡 中风险：上一代但仍 active

| 项目 enum         | externalModelId                  | 现状                                                                                                 | 建议                                                          |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `FLUX_2_SCHNELL`  | `fal-ai/flux/schnell`            | 实际是 **FLUX.1 schnell**；BFL 于 2026-01-15 发布 **FLUX.2 [klein]**（< 1s 生图，FLUX.2 系列最快档） | 升级到 `fal-ai/flux-2-klein`                                  |
| `SEEDANCE_15_PRO` | `doubao-seedance-1-5-pro-251215` | 被 Seedance 2.0 取代（VolcEngine 2025-02 已上线）；项目已有 `SEEDANCE_20_VOLC` 完全覆盖              | 下线 1.5（已重复）                                            |
| `HUNYUAN_VIDEO`   | `fal-ai/hunyuan-video`           | Tencent 已发布 **HunyuanVideo-1.5**（2025-11），项目用的是 v1                                        | 升级到 1.5 endpoint，或考虑下线（小众，wan-2.6 已覆盖该价位） |
| `HUNYUAN3D_2_1`   | `fal-ai/hunyuan3d/v2`            | **被 v3 / v3.1 取代**；项目已有 `HUNYUAN3D_V3` 和 `HUNYUAN3D_V31_PRO`，2.1 完全冗余                  | 下线                                                          |

### 🟡 命名问题：实际指向的模型与 enum 名称不符

| 项目 enum          | externalModelId              | 问题                                                                                                                 | 建议                                                         |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `ILLUSTRIOUS_XL`   | `delta-lock/noobai-xl`       | NoobAI XL 是基于 Illustrious-xl-early-release-v0 训练的衍生模型，但技术上**不是 Illustrious XL 本体**。enum 名称误导 | 改名为 `NOOBAI_XL` + 同步 i18n（不影响运行，只是命名清晰度） |
| `SEEDREAM_50_LITE` | `doubao-seedream-5-0-260128` | externalModelId 是 Seedream 5.0 完整版，**不是 Lite**；ByteDance 没有"5.0 Lite"产品                                  | 改名为 `SEEDREAM_50` + 同步 i18n                             |

### 🟢 当前最新或仍是同档 SOTA（保持）

- `OPENAI_GPT_IMAGE_2` — Image Arena #1
- `GEMINI_PRO_IMAGE` (`gemini-3-pro-image-preview`) — Active Preview，与文本 `gemini-3-pro-preview` 2026-03-09 关停**无关**（独立模型族）
- `GEMINI_FLASH_IMAGE` (`gemini-3.1-flash-image-preview`) — Active Preview
- `FLUX_2_PRO` / `FLUX_2_DEV` / `FLUX_2_MAX` — FLUX.2 系列
- `FLUX_KONTEXT_PRO` / `FLUX_KONTEXT_MAX` — 当前 FLUX 编辑模型
- `SEEDREAM_45` / `SEEDREAM_40` — 后者仍在 Image Arena Top 5
- `IDEOGRAM_3` — 当前最新（无 V4）
- `NOVELAI_V45_FULL` / `NOVELAI_V45_CURATED` — 当前最新（无 V5）
- `ANIMAGINE_XL_4` — 当前最新（可选升级 4.0 Opt）
- `SD_35_LARGE` — 当前 SD 旗舰
- `KLING_V3_PRO` / `VEO_31` / `SEEDANCE_20` / `SEEDANCE_20_FAST` / `SEEDANCE_20_VOLC` / `SEEDANCE_20_FAST_VOLC` — 当前视频主力
- `MINIMAX_VIDEO` (Hailuo 2.3) — 当前最新（2025-10）
- `PIKA_V25` — 当前最新（无 V3）
- `WAN_VIDEO` (Wan 2.6) — Wan 2.7 已发布但 2.6 仍是 multi-shot narrative 推荐
- `HUNYUAN3D_V31_PRO` / `HUNYUAN3D_V3` / `TRELLIS_2` / `TRIPOSR` — 3D 当前阵容
- `FISH_AUDIO_S2_PRO` / `FAL_F5_TTS` — 音频当前阵容

### 同时也已经在用户精简清单里 / 用户已标 retired

- `FLUX_LORA` — 用户已建议下线（FLUX.1 LoRA，FLUX.2 已有原生 LoRA 支持）
- `SDXL` — 用户已建议下线（被 SD 3.5 完全取代）
- `NOVELAI_V4_FULL` — 用户已建议下线（V4.5 已 premium 档）
- `FLUX_2_DEV` 中端定位 — 用户建议下线，可保留观察
- `FLUX_2_MAX` vs `FLUX_2_PRO` — 用户建议二选一

---

## 修正后的精简优先级（替代用户原方案）

第一波 — **必做**（高风险，落后版本）：

1. **升级** `RECRAFT_V4_PRO` → V4.1 Pro（一行改 `externalModelId`）
2. **升级** `LUMA_RAY_2` → Luma Ray 3（一行改 + 验证 fal 上 endpoint 已就绪）
3. **下线** `RUNWAY_GEN3` 或升级到 Gen-4 Turbo（落后两代严重）
4. **下线** `KLING_VIDEO` (V2.1 Master)（与 V3 Pro 冗余）
5. **下线** `HUNYUAN3D_2_1`（与 v3 冗余）

第二波 — **建议**（中风险，命名清理）：

6. **升级** `FLUX_2_SCHNELL` → FLUX.2 klein
7. **下线** `SEEDANCE_15_PRO`（与 SEEDANCE_20_VOLC 冗余）
8. **升级或下线** `HUNYUAN_VIDEO` → HunyuanVideo-1.5
9. **改名** `ILLUSTRIOUS_XL` → `NOOBAI_XL`（不影响运行）
10. **改名** `SEEDREAM_50_LITE` → `SEEDREAM_50`（不影响运行）

第三波 — **用户原方案**（重叠 / 中端模糊）：

11. `FLUX_LORA` 下线
12. `FLUX_2_DEV` 下线（观察）
13. `SDXL` 下线
14. `NOVELAI_V4_FULL` 下线
15. **不要下线** `SEEDREAM_40`（榜单 Top 5）
16. `FLUX_2_MAX` vs `FLUX_2_PRO` 二选一

执行后规模：50 → 约 32 个，不含命名清理。

---

## 决策原则（精简时遵循）

1. **能跨 provider 重复的就只留 1 份**（除非是国内/海外区域差异）
2. **同 provider 同档同质量的就只留旗舰**（dev/mid 档下线）
3. **没有明确差异化的中端模型可砍**（用户不会主动选"中等"）
4. **免费 / 有特色能力的保留**（free tier、LoRA、character prompt 等）
5. **不删 enum、不删 i18n key**（历史 generation 兼容）
6. **下线优先级 = 使用次数低 + 替代品强**（理想情况下应该看 `ApiUsageEvent` 表的实际计数再决定，本提案是基于产品逻辑判断）

---

## 数据驱动版精简（推荐）

更可靠的精简方式是看实际使用率而不是产品直觉。可以在 Neon 上跑：

```sql
SELECT
  "modelId",
  COUNT(*) as usage_count,
  MAX("createdAt") as last_used
FROM "Generation"
WHERE "createdAt" > NOW() - INTERVAL '30 days'
GROUP BY "modelId"
ORDER BY usage_count DESC;
```

最近 30 天没人用的模型 → 候选下线。
使用率 < 1% 但不在"特色场景"清单里的 → 候选下线。

这一步建议在落地前跑一次。
