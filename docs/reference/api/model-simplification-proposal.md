# 模型精简提案

> **Status**: 草案，待用户确认
> **Last updated**: 2026-05-16
> 当前 50 个模型（43 active + 7 retired），UI 选择器已经过载。
> 本文档梳理冗余 / 过期 / 可下线候选，**不直接动代码**。

---

## 当前盘点（来源：`src/constants/models/{image,video,audio,model-3d}.ts`）

| 类型     | Total  | Active | Retired (`available: false`) |
| -------- | :----: | :----: | :--------------------------: |
| Image    |   27   |   22   |              5               |
| Video    |   16   |   14   |              2               |
| Audio    |   2    |   2    |              0               |
| 3D       |   5    |   5    |              0               |
| **合计** | **50** | **43** |            **7**             |

---

## 不能物理删除的对象

`available: false` 的 7 个 retired 模型 **不要删 enum / 不要删 i18n key**，因为：

- `prisma/seed.ts` / `prisma/seed.mjs` 引用了旧 `id` / `externalModelId`
- `src/constants/models.ts` 中的 i18n 名称映射、provider 名映射会被历史 generation 记录用来渲染"这张图当时用的是什么模型"
- `fal/video-request-builders.ts` 里 `case AI_MODELS.SEEDANCE_PRO:` 这类 switch 仍然要能匹配旧 generation 的回放

它们是**历史数据兼容层**，不是死代码。当前 `available: false` 已经把它们挡在 UI 之外，这就是正确做法。

如果以后真的想让 enum 也清理：需要先在 `Generation` 表里写 migration 把旧 modelId 重定向到 "legacy" 字面量，然后才能删 enum。这是一次独立的工作，不应混在精简里。

**同样地**：`AI_MODELS` enum 名称（如 `ILLUSTRIOUS_XL`、`SEEDREAM_50_LITE`）也不要轻易改名，因为：

- 数据库 `Generation.modelId` 字段存的是 enum 字符串值（`'illustrious-xl'` 等），改 enum 会让历史记录变成孤儿
- i18n key 与 enum 一一对应，改一个要联动改 3 个 locale 文件
- 项目里 178+ 文件 import constants，更名是大手术

如果 enum 名容易误导（如 `ILLUSTRIOUS_XL` 实际指向 NoobAI XL），优先**改展示名 + 注释**，不要改 enum 本身。

---

## 版本时效审计（2026-05-16 核查）

精简之前先看每个 active 模型有没有被新版本取代或被 sunset。下表只列**有问题**的，没列出的 = 当前最新或仍是同档 SOTA。

### 🔴 已确认：可立即下线 / 升级（低实施风险）

| 项目 enum                   | externalModelId                                | 现状                                                                        | 建议动作                          | 验证状态                                |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| `RECRAFT_V4_PRO`            | `fal-ai/recraft/v4/pro/text-to-image`          | V4.1 系列 2026-05-14 发布；fal 已上 `fal-ai/recraft/v4.1/pro/text-to-image` | **升级** externalModelId 一行改动 | ✅ Recraft 官方 + fal 都已确认 endpoint |
| `KLING_VIDEO` (V2.1 Master) | `fal-ai/kling-video/v2.1/master/text-to-video` | Kling 3.0 / 3.0 Omni 2026-02 已发布；项目已有 `KLING_V3_PRO` 完全覆盖       | **下线**（`available: false`）    | ✅ 已有替代品                           |
| `HUNYUAN3D_2_1`             | `fal-ai/hunyuan3d/v2`                          | v3 / v3.1 已上线；项目已有 `HUNYUAN3D_V3` 和 `HUNYUAN3D_V31_PRO`            | **下线**                          | ✅ 已有替代品                           |
| `SEEDANCE_15_PRO`           | `doubao-seedance-1-5-pro-251215`               | 被 Seedance 2.0 取代；项目已有 `SEEDANCE_20_VOLC` 完全覆盖                  | **下线**                          | ✅ 已有替代品                           |

### 🟡 需要先做 endpoint health check 才能动手（升级路径未确认）

| 项目 enum        | externalModelId                           | 现状                                                                                                                                       | 待验证                                                                                                                  |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `LUMA_RAY_2`     | `fal-ai/luma-dream-machine/ray-2`         | Luma 官方 Ray 3 已发布（2025-09），但 **fal 上是否托管 Ray 3 endpoint 未确认**                                                             | 在 fal `/explore/models?keyword=luma` 搜索 Ray 3；如果没有，备选 = 接 Luma 官方 adapter，工作量更大                     |
| `RUNWAY_GEN3`    | `fal-ai/runway-gen3/turbo/image-to-video` | Runway 官方已 Gen-4 / Gen-4 Turbo / Gen-4.5；**fal 上是否托管 Gen-4 endpoint 未确认**                                                      | 同上，需要验证 fal 是否有 `fal-ai/runway-gen4*`                                                                         |
| `FLUX_2_SCHNELL` | `fal-ai/flux/schnell`                     | 实为 FLUX.1 schnell；FLUX.2 [klein] 已发布。**正确 endpoint 是 `fal-ai/flux-2/klein/4b/base` 或 `/distilled`，不是 `fal-ai/flux-2-klein`** | 选 base 还是 distilled？distilled 4 步固定（更快但不可调），base 支持 LoRA 训练。schema 也不一样，需要核对 request body |
| `WAN_VIDEO`      | `wan/v2.6/text-to-video`                  | fal 已上 Wan 2.7（2026-04 发布）；2.6 仍能用但已落后                                                                                       | 验证 `fal-ai/wan/v2.7` 或类似 endpoint 的 schema 兼容性                                                                 |
| `HUNYUAN_VIDEO`  | `fal-ai/hunyuan-video`                    | HunyuanVideo-1.5 已发布（2025-11），但**默认 480p**，更像低价备选而非旗舰升级                                                              | 不一定要升级；如果保留 budget 档，可以维持 v1 不动；或者直接下线（wan-2.6 / wan-2.7 已覆盖 budget）                     |

### 🟢 不需要动（当前最新或仍是同档 SOTA）

- `OPENAI_GPT_IMAGE_2` — Image Arena #1
- `GEMINI_PRO_IMAGE` (`gemini-3-pro-image-preview`) — Active Preview，与文本 `gemini-3-pro-preview` 2026-03-09 关停**无关**（独立模型族）
- `GEMINI_FLASH_IMAGE` (`gemini-3.1-flash-image-preview`) — Active Preview
- `FLUX_2_PRO` / `FLUX_2_DEV` / `FLUX_2_MAX` — FLUX.2 系列当前
- `FLUX_KONTEXT_PRO` / `FLUX_KONTEXT_MAX` — 当前 FLUX 编辑模型
- `SEEDREAM_45` — 当前 fal 上 Seedream 旗舰
- `SEEDREAM_40` — 仍在 Image Arena Top 5
- `SEEDREAM_50_LITE` — VolcEngine 官方确实有 Seedream 5.0 Lite SKU（[官方文档](https://www.volcengine.com/docs/82379/1824121)），enum 名正确
- `IDEOGRAM_3` — 当前最新（无 V4）
- `RECRAFT_V4_PRO` → 升级 V4.1 后归入此类
- `NOVELAI_V45_FULL` / `NOVELAI_V45_CURATED` — 当前最新（无 V5）
- `ANIMAGINE_XL_4` — 当前最新（可选升级 4.0 Opt）
- `SD_35_LARGE` — 当前 SD 旗舰
- `ILLUSTRIOUS_XL` (`delta-lock/noobai-xl`) — enum 名误导但模型仍 active；只改展示名，不改 enum
- `KLING_V3_PRO` / `VEO_31` / `SEEDANCE_20` / `SEEDANCE_20_FAST` / `SEEDANCE_20_VOLC` / `SEEDANCE_20_FAST_VOLC` — 当前视频主力
- `MINIMAX_VIDEO` (Hailuo 2.3) — 当前最新（2025-10）
- `PIKA_V25` — 当前最新（无 V3）
- `HUNYUAN3D_V31_PRO` / `HUNYUAN3D_V3` / `TRELLIS_2` / `TRIPOSR` — 3D 当前阵容
- `FISH_AUDIO_S2_PRO` / `FAL_F5_TTS` — 音频当前阵容

---

## 重叠精简候选（与版本时效正交）

时效审计针对"模型版本是否过期"。下面这一节针对"产品矩阵是否冗余"。两者都要看。

### Image

| 候选下线                            | 重叠原因                                                                                 | 备注                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| `flux-2-dev`                        | `flux-2-pro` / `flux-2-max` 覆盖 premium，`flux-2-schnell` 覆盖 fast；dev 中间档定位模糊 | 保留观察                          |
| `flux-2-max` 或 `flux-2-pro` 二选一 | 都是 premium photorealistic，max 比 pro 贵 1 cost                                        | 用户感知差异不大，留 `flux-2-pro` |
| `nai-diffusion-4-full`              | V4.5 Full / Curated 已是 premium，V4 Full 同价但旧一代                                   | 下线                              |
| `sdxl`                              | 完全被 `sd-3.5-large` 覆盖，且是 budget 档                                               | 下线                              |
| `flux-lora`                         | `noobai-xl` (anime) + 用户自训 LoRA 已能覆盖；`flux-lora` 没有内置 LoRA 库               | 下线                              |
| ~~`seedream-4.0`~~                  | **不要下线** — Image Arena Top 5（Elo 1197），仍是同档 SOTA 之一                         | **保留**（之前判断错）            |

### Video

**Seedance 系列 fal vs VolcEngine 双发** —— 国内走 VolcEngine 快、海外走 fal 快。这个冗余**合理**，不要砍；可以做 env-driven 显隐而不是删模型。

但 `seedance-2.0-fast-volc` (VolcEngine) 和 `seedance-2.0-fast` (fal) 同档同模型，留一个就够：

- 国内部署 → 留 VolcEngine 版本
- 海外部署 → 留 fal 版本

中端冗余（`pika-v2.5` / `luma-ray-2` / `minimax-hailuo-2.3`）—— 三家都 standard 档，定位接近。但 luma-ray-2 已落入"版本时效"问题（Ray 3 已发），所以这里只在剩下两家中选一砍：

- 保留 `minimax-hailuo-2.3`（最新版本，camera control 特色）
- 下线 `pika-v2.5`（无差异化能力）

### 3D

`trellis-2` 与 `hunyuan3d-v3` 同档 premium。中文社区 hunyuan 更普及，可考虑下线 trellis-2，但工作量低、收益小，**优先级最低**。

### Audio

不动。`fish-audio-s2-pro` + `fal-ai/f5-tts` 覆盖完整且无重叠。

---

## 修正后的执行优先级

按用户建议的"先低风险、升级类先 health check"顺序：

### 第 1 批 — 文档清理（本提交）

- ✅ 修正本文档顶部数字 51/44 → 50/43
- ✅ 删除"前面建议下、后面又说留"的矛盾段
- ✅ 撤销"改 enum 名"建议（保留为只改展示名）
- ✅ FLUX.2 klein endpoint 写法修正
- ✅ Ray3 / Gen4 / Wan 2.7 改为"先 health check"

### 第 2 批 — 低风险下线（当前已可执行）

只动 `available: false` 一个布尔字段，不动 endpoint，不动 enum，可逆：

1. `KLING_VIDEO` (V2.1 Master) — V3 Pro 已覆盖
2. `HUNYUAN3D_2_1` — v3 / v3.1 已覆盖
3. `SEEDANCE_15_PRO` — Seedance 2.0 (volc) 已覆盖
4. `nai-diffusion-4-full` — V4.5 已覆盖
5. `sdxl` — SD 3.5 Large 已覆盖
6. `flux-lora` — 已有更好的 LoRA 路径
7. `pika-v2.5` — 中端冗余
8. `flux-2-dev` 或 `flux-2-max` 二选一（产品决策，需用户拍）

### 第 3 批 — 升级类（先验证后动手）

每一项都要先：(a) 在 fal `/explore/models` 确认 endpoint 存在；(b) 抓一份 request schema；(c) 在 dev 跑一次 health check 才动 `externalModelId`：

1. `RECRAFT_V4_PRO` → V4.1 Pro（fal endpoint 已确认存在，最低风险，可优先做）
2. `LUMA_RAY_2` → Ray 3（**先确认 fal 是否托管**；否则只能下线或考虑接 Luma 直连 adapter）
3. `RUNWAY_GEN3` → Gen-4 Turbo（**先确认 fal 是否托管**；否则下线）
4. `FLUX_2_SCHNELL` → FLUX.2 klein 4B base 或 distilled（先选型 + 核 schema）
5. `WAN_VIDEO` → Wan 2.7（先核 schema）
6. `HUNYUAN_VIDEO` → 1.5 (480p) **或** 直接下线（不一定要升）

### 第 4 批 — 命名 / 文档清理（最低优先级）

- 在 i18n 把 `ILLUSTRIOUS_XL` 的展示名改为 "NoobAI XL"，**不改 enum**
- 给 `SEEDREAM_50_LITE` 在 i18n 加注解 "Lite 5.0"
- 同步 `model-doc-monitor.snapshot.json`

执行完第 2、3 批：50 → 约 35-37 个（取决于 Ray 3 / Gen-4 在 fal 是否就绪）。

---

## 决策原则（精简时遵循）

1. **能跨 provider 重复的保留 1 份**（除非是国内/海外区域差异）
2. **同 provider 同档同质量的只留旗舰**（dev/mid 档下线）
3. **没有明确差异化的中端模型可砍**
4. **免费 / 有特色能力的保留**
5. **不删 enum、不改 enum 名、不删 i18n key**
6. **下线优先级 = 使用次数低 + 替代品强**
7. **升级前先 health check 不要假设 endpoint 名**

---

## 数据驱动版精简（推荐）

更可靠的精简方式是看实际使用率。在 Neon 上跑：

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

最近 30 天没人用的模型 → 下线候选。
使用率 < 1% 但不在"特色场景"清单里的 → 下线候选。

这一步建议在第 2 批落地前跑一次。
