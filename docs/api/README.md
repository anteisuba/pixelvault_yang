# AI Provider API Reference

本目录记录 PixelVault 集成的所有 AI 图像/视频生成 API 的接口规范。
当官方 API 文档更新时，请同步更新对应文件。

> **Last full audit**: 2026-04-23

---

## New In This Directory

- [model-capability-catalog.md](model-capability-catalog.md) — 按图片 / 视频 / 声音与二级能力分类的完整模型能力目录，仅记录官方文档明确说明的能力与特点
- [model-doc-monitor.snapshot.json](model-doc-monitor.snapshot.json) — 模型官方文档 / 官方 API 基线快照，供每周自动检查对比

GitHub Actions 每周会运行 `npm run models:check-docs`，对 `src/constants/models.ts` 中的模型清单、官方文档页面、以及可选的官方模型列表 API 做比对。

---

## Provider Overview

| Provider                      | Adapter       | Auth Header             | Key Prefix | Image | Video | Max Refs |
| ----------------------------- | ------------- | ----------------------- | ---------- | :---: | :---: | :------: |
| [OpenAI](openai.md)           | `openai`      | `Authorization: Bearer` | `sk-proj-` |  ✅   |   —   |    1     |
| [Google Gemini](gemini.md)    | `gemini`      | `x-goog-api-key`        | `AIza`     |  ✅   |   —   |    14    |
| [fal.ai](fal.md)              | `fal`         | `Authorization: Key`    | `fal_`     |  ✅   |  ✅   |    1     |
| [Replicate](replicate.md)     | `replicate`   | `Authorization: Bearer` | `r8_`      |  ✅   |  ✅   |    1     |
| [HuggingFace](huggingface.md) | `huggingface` | `Authorization: Bearer` | `hf_`      |  ✅   |   —   |    1     |
| [NovelAI](novelai.md)         | `novelai`     | `Authorization: Bearer` | `pst-`     |  ✅   |   —   | Multi\*  |
| [VolcEngine](volcengine.md)   | `volcengine`  | `Authorization: Bearer` | `ark-`     |  ✅   |  ✅   |    10    |

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

## Models by Provider

### OpenAI

- `gpt-image-2` — Premium, current flagship image model

### Google Gemini

- `gemini-3-pro-image-preview` — Premium, advanced reasoning
- `gemini-3.1-flash-image-preview` — Standard, fast generation (free tier)

### fal.ai

- `fal-ai/flux-2-pro` — Premium, photorealistic
- `fal-ai/bytedance/seedream/v4.5/text-to-image` — Premium, artistic
- `fal-ai/ideogram/v3` — Premium, typography/design
- `fal-ai/recraft/v4/pro/text-to-image` — Premium, designer-focused
- `fal-ai/flux-2-dev` — Standard, dev tier
- `fal-ai/flux/schnell` — Budget, fast iteration
- `fal-ai/stable-diffusion-v35-large` — Standard, open-source
- Video: Kling, Veo, Seedance, MiniMax, Luma, Pika, Wan, Hunyuan, Runway

### HuggingFace

- `cagliostrolab/animagine-xl-4.0` — Standard, anime specialist
- `stabilityai/stable-diffusion-xl-base-1.0` — Budget, classic baseline

### NovelAI

- `nai-diffusion-4-5-full` — Premium, anime V4.5
- `nai-diffusion-4-5-curated` — Premium, curated V4.5
- `nai-diffusion-4-full` — Standard, V4
- `nai-diffusion-3` — Budget, V3

### VolcEngine (火山方舟)

- `doubao-seedream-5-0-260128` — Premium, Seedream 5.0 Lite
- `doubao-seedream-4-0-250828` — Standard, Seedream 4.0
- `doubao-seedream-3-0-t2i-250415` — Budget, Seedream 3.0
- Video: `doubao-seedance-1-5-pro-251215`, `doubao-seedance-1-0-pro-fast-251015`

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
