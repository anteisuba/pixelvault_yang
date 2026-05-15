# AI Provider API Reference

本目录记录 PixelVault 集成的所有 AI 图像/视频/音频/3D 生成 API 的接口规范、连接策略和模型清单。
当官方 API 文档更新时，请同步更新对应文件。

> **Last full audit**: 2026-05-15

---

## 阅读路径

| 任务                                        | 看哪份                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 第一次理解项目用了哪些 provider / 模型      | 本文件「Provider Overview」+「Image / Video / Audio Models」表                         |
| 调用慢 / 不稳定，要做诊断                   | [`connection-strategy.md`](connection-strategy.md)                                     |
| 国内开发本地起服务 OpenAI / Gemini 不通     | [`connection-strategy.md`](connection-strategy.md) → "国内开发 / 部署的具体做法"       |
| 加一条 user route 走中转 endpoint           | [`connection-strategy.md`](connection-strategy.md) → "ProviderConfig.baseUrl 覆盖机制" |
| 想精简模型数量                              | [`model-simplification-proposal.md`](model-simplification-proposal.md)                 |
| 看某个 provider 的 request / response 细节  | 对应 `<provider>.md`                                                                   |
| 模型能力对照（哪个支持 negative prompt 等） | [`model-capability-catalog.md`](model-capability-catalog.md)                           |

---

## Navigation

| 文档                                                                    | 内容                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [connection-strategy.md](connection-strategy.md) ⭐                     | 跨 provider 连接决策矩阵、直连 vs 中转、超时与重试策略、诊断 checklist |
| [model-simplification-proposal.md](model-simplification-proposal.md) ⭐ | 模型精简提案 —— 23 image + 14 video → 14 + 8 的产品判断与落地步骤      |
| [openai.md](openai.md)                                                  | OpenAI GPT Image 2                                                     |
| [gemini.md](gemini.md)                                                  | Google Gemini 3 Pro / Flash Image                                      |
| [fal.md](fal.md)                                                        | fal.ai (统一 image / video / audio)                                    |
| [replicate.md](replicate.md)                                            | Replicate predictions                                                  |
| [huggingface.md](huggingface.md)                                        | HuggingFace Inference (router)                                         |
| [novelai.md](novelai.md)                                                | NovelAI V3 / V4 / V4.5                                                 |
| [volcengine.md](volcengine.md)                                          | 火山方舟 Seedream / Seedance                                           |
| [fish-audio.md](fish-audio.md)                                          | Fish Audio TTS                                                         |
| [model-capability-catalog.md](model-capability-catalog.md)              | 完整模型能力目录（仅官方文档明示）                                     |
| [model-doc-monitor.snapshot.json](model-doc-monitor.snapshot.json)      | 周检基线快照                                                           |

GitHub Actions 每周会运行 `npm run models:check-docs`，对 `src/constants/models.ts` 中的模型清单、官方文档页面、以及可选的官方模型列表 API 做比对。

---

## Provider Overview

| Provider                      | Adapter       | Auth Header             | Key Prefix | Image | Video | Audio | Max Refs |      国内可达       |
| ----------------------------- | ------------- | ----------------------- | ---------- | :---: | :---: | :---: | :------: | :-----------------: |
| [OpenAI](openai.md)           | `openai`      | `Authorization: Bearer` | `sk-proj-` |  ✅   |   —   |   —   |    1     |    ❌（需中转）     |
| [Google Gemini](gemini.md)    | `gemini`      | `x-goog-api-key`        | `AIza`     |  ✅   |   —   |   —   |    14    |    ❌（需中转）     |
| [fal.ai](fal.md)              | `fal`         | `Authorization: Key`    | `fal_`     |  ✅   |  ✅   |  ✅   |    1     |         ✅          |
| [Replicate](replicate.md)     | `replicate`   | `Authorization: Bearer` | `r8_`      |  ✅   |   —   |   —   |    1     |     ⚠️（不稳）      |
| [HuggingFace](huggingface.md) | `huggingface` | `Authorization: Bearer` | `hf_`      |  ✅   |   —   |   —   |    1     | ⚠️（cold start 久） |
| [NovelAI](novelai.md)         | `novelai`     | `Authorization: Bearer` | `pst-`     |  ✅   |   —   |   —   | Multi\*  | ⚠️（CDN 偶发丢包）  |
| [VolcEngine](volcengine.md)   | `volcengine`  | `Authorization: Bearer` | `ark-`     |  ✅   |  ✅   |   —   |    10    |   ✅（北京直连）    |
| [Fish Audio](fish-audio.md)   | `fish_audio`  | `Authorization: Bearer` | —          |   —   |   —   |  ✅   |    —     |         ✅          |

*NovelAI multi-reference 依赖订阅等级 (Tier ≥ 3 才支持多张)
*OpenAI 官方 edits API 支持多图输入，但当前 PixelVault adapter 只发送第一张参考图。

---

## Capability Matrix

| Capability      | OpenAI | Gemini | fal | Replicate | HuggingFace | NovelAI | VolcEngine |
| --------------- | :----: | :----: | :-: | :-------: | :---------: | :-----: | :--------: |
| Negative Prompt |   —    |   —    | ✅  |    ✅     |     ✅      |   ✅    |     —      |
| Guidance Scale  |   —    |   —    | ✅  |    ✅     |     ✅      |   ✅    |     ✅     |
| Inference Steps |   —    |   —    | ✅  |    ✅     |     ✅      |   ✅    |     —      |
| Seed            |   —    |   —    | ✅  |    ✅     |     ✅      |   ✅    |     ✅     |
| Ref Strength    |   —    |   —    | ✅  |    ✅     |      —      |   ✅    |     —      |
| Quality         |   ✅   |   —    |  —  |     —     |      —      |    —    |     —      |
| Background      |   ✅   |   —    |  —  |     —     |      —      |    —    |     —      |
| Style           |   ✅   |   —    |  —  |     —     |      —      |    —    |     —      |
| Image Analysis  |   ✅   |   ✅   | ✅  |    ✅     |     ✅      |    —    |     ✅     |

---

## Common Interface

所有 adapter 实现统一的 `ProviderAdapter` 接口（`src/services/providers/types.ts`）：

```typescript
interface ProviderAdapter {
  readonly adapterType: AI_ADAPTER_TYPES
  generateImage(
    input: ProviderGenerationInput,
  ): Promise<ProviderGenerationResult>
  generateVideo?(input: ProviderVideoInput): Promise<ProviderVideoResult>
  submitVideoToQueue?(
    input: ProviderQueueSubmitInput,
  ): Promise<ProviderQueueSubmitResult>
  checkVideoQueueStatus?(
    input: ProviderQueueStatusInput,
  ): Promise<ProviderQueueStatusResult>
  healthCheck?(input: HealthCheckInput): Promise<HealthCheckResult>
}
```

统一错误类型 `ProviderError(provider, statusCode, detail)` 保留 HTTP 状态码。

---

## Image Models (23 available, 5 retired)

| Model                            | Provider    | Cost | Tier     | Style          | Notes                             |
| -------------------------------- | ----------- | :--: | -------- | -------------- | --------------------------------- |
| `gpt-image-2`                    | OpenAI      |  3   | premium  | general        | Current flagship                  |
| `gemini-3-pro-image-preview`     | Gemini      |  3   | premium  | general        | Up to 14 refs                     |
| `flux-2-pro`                     | fal.ai      |  2   | premium  | photorealistic | Multi-ref, character consistency  |
| `flux-2-max`                     | fal.ai      |  3   | premium  | photorealistic | Highest quality FLUX              |
| `flux-kontext-pro`               | fal.ai      |  2   | premium  | photorealistic | Single-ref editing (requires ref) |
| `flux-kontext-max`               | fal.ai      |  3   | premium  | photorealistic | Multi-ref editing (requires ref)  |
| `seedream-4.5`                   | fal.ai      |  2   | premium  | artistic       | Cinematic aesthetics              |
| `seedream-5.0-lite`              | VolcEngine  |  2   | premium  | artistic       | ByteDance latest                  |
| `ideogram-3`                     | fal.ai      |  2   | premium  | design         | Best text/typography              |
| `recraft-v4-pro`                 | fal.ai      |  2   | premium  | design         | Logos, vector-style               |
| `nai-diffusion-4-5-full`         | NovelAI     |  2   | premium  | anime          | V4.5 Full                         |
| `nai-diffusion-4-5-curated`      | NovelAI     |  2   | premium  | anime          | V4.5 Curated                      |
| `gemini-3.1-flash-image-preview` | Gemini      |  2   | standard | general        | Fast, free tier                   |
| `flux-2`                         | fal.ai      |  1   | standard | photorealistic | Dev tier, LoRA support            |
| `flux-lora`                      | fal.ai      |  1   | standard | general        | FLUX + LoRA                       |
| `seedream-4.0`                   | VolcEngine  |  2   | standard | artistic       | Mid-tier                          |
| `noobai-xl`                      | Replicate   |  2   | standard | anime          | Illustration, LoRA support        |
| `sd-3.5-large`                   | fal.ai      |  1   | standard | general        | Open-source 8B                    |
| `animagine-xl-4.0`               | HuggingFace |  1   | standard | anime          | Anime specialist                  |
| `nai-diffusion-4-full`           | NovelAI     |  1   | standard | anime          | V4                                |
| `flux/schnell`                   | fal.ai      |  1   | budget   | general        | Fastest FLUX                      |
| `sdxl`                           | HuggingFace |  1   | budget   | general        | Classic baseline                  |
| ~~`recraft-v3`~~                 | fal.ai      |  2   | premium  | design         | RETIRED                           |
| ~~`nai-diffusion-3`~~            | NovelAI     |  1   | budget   | anime          | RETIRED                           |
| ~~`seedream-3.0`~~               | VolcEngine  |  1   | budget   | artistic       | RETIRED                           |
| ~~`playground-v2.5`~~            | HuggingFace |  1   | standard | general        | RETIRED                           |
| ~~`gemini-2.5-flash-image`~~     | Gemini      |  1   | standard | general        | RETIRED                           |

## Video Models (14 available, 2 retired)

| Model                       | Provider   | Cost | Tier     | Features                | Notes               |
| --------------------------- | ---------- | :--: | -------- | ----------------------- | ------------------- |
| `veo3.1`                    | fal.ai     |  8   | premium  | T2V, I2V, audio, extend | Google latest, 4K   |
| `kling-video/v3/pro`        | fal.ai     |  6   | premium  | T2V, I2V, audio, extend | Multi-shot, 1080p   |
| `seedance-2.0`              | fal.ai     |  6   | premium  | T2V, I2V, audio         | Director camera     |
| `seedance-2.0-volc`         | VolcEngine |  5   | premium  | T2V, audio, lipsync     | Via VolcEngine      |
| `seedance-1.5-pro`          | VolcEngine |  5   | premium  | T2V, audio, extend      | 1080p               |
| `kling-video/v2.1/master`   | fal.ai     |  5   | standard | T2V, I2V                | Reliable cinematic  |
| `runway-gen3/turbo`         | fal.ai     |  5   | standard | I2V only                | Industry standard   |
| `seedance-2.0-fast`         | fal.ai     |  4   | standard | T2V, I2V, audio         | Cheaper variant     |
| `luma-dream-machine/ray-2`  | fal.ai     |  4   | standard | T2V                     | Coherent motion     |
| `seedance-2.0-fast-volc`    | VolcEngine |  3   | standard | T2V, audio              | Fast via VolcEngine |
| `pika/v2.5`                 | fal.ai     |  3   | standard | T2V, I2V                | Sharper visuals     |
| `minimax/hailuo-2.3`        | fal.ai     |  3   | standard | T2V, I2V                | Camera control      |
| `hunyuan-video`             | fal.ai     |  3   | budget   | T2V, I2V                | Tencent open-source |
| `wan/v2.6`                  | fal.ai     |  2   | budget   | T2V, I2V, audio         | Multi-modal         |
| ~~`seedance/v1/pro`~~       | fal.ai     |  4   | standard | T2V, I2V                | RETIRED             |
| ~~`seedance-1.0-pro-fast`~~ | VolcEngine |  4   | standard | T2V, extend             | RETIRED             |

## Audio Models (2 available)

| Model               | Provider   | Cost | Tier     | Features                     | Notes                               |
| ------------------- | ---------- | :--: | -------- | ---------------------------- | ----------------------------------- |
| `fish-audio-s2-pro` | Fish Audio |  2   | premium  | TTS, voice selection         | 81.88% win rate on EmergentTTS-Eval |
| `fal-ai/f5-tts`     | fal.ai     |  1   | standard | TTS, zero-shot voice cloning | Open-source, free tier              |

**Total: 46 models (39 available, 7 retired)**

---

## File Locations

| File                                       | Purpose                                |
| ------------------------------------------ | -------------------------------------- |
| `src/services/providers/{name}.adapter.ts` | Adapter implementation                 |
| `src/services/providers/types.ts`          | Common interface & ProviderError       |
| `src/services/providers/registry.ts`       | Adapter factory/registry               |
| `src/constants/providers.ts`               | Provider config, key hints, API guides |
| `src/constants/models.ts`                  | Model definitions & mappings           |
| `src/constants/provider-capabilities.ts`   | Capability flags & numeric ranges      |
| `src/constants/config.ts`                  | Endpoints, image sizes, timeouts       |
