# Fish Audio — Text-to-Speech API

> **Official Docs**: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
> **Last verified**: 2026-05-15

---

## Overview

Fish Audio 是 TTS（文本转语音）专用 provider，托管 `s2-pro` 等高分模型（在 EmergentTTS-Eval 上 81.88% 胜率）。
同步 API：`POST /v1/tts` 直接返回音频字节流（mp3 / wav）。
**不支持图像/视频生成** —— adapter 的 `generateImage` 会抛 400。

## Authentication

| Field      | Value                                      |
| ---------- | ------------------------------------------ |
| Header     | `Authorization: Bearer {apiKey}`           |
| Key format | 类似 `aaf42ad8...`（无统一前缀）           |
| Obtain at  | https://fish.audio/zh-CN/app/api-keys/     |
| Steps      | Sign in → 开发者 → API 密钥 → 创建新的密钥 |

## Endpoints

| Action       | Method | URL                             |
| ------------ | ------ | ------------------------------- |
| TTS          | POST   | `https://api.fish.audio/v1/tts` |
| Health Check | GET    | `https://api.fish.audio/model`  |

## Models

| Model ID | Platform Name     | Quality | Notes                               |
| -------- | ----------------- | :-----: | ----------------------------------- |
| `s2-pro` | Fish Audio S2 Pro | Premium | 81.88% win rate on EmergentTTS-Eval |

## Request

Content-Type: `application/json`
**注意**：`model` 通过 HTTP header 传递，不在 body 里。

```http
POST /v1/tts HTTP/1.1
Authorization: Bearer {apiKey}
Content-Type: application/json
model: s2-pro
```

```json
{
  "text": "今天天气真好",
  "format": "mp3",
  "sample_rate": 44100,
  "reference_id": "voice-clone-id",
  "speed": 1.0
}
```

### Parameters

| Parameter      | Type   | Required | Default | Description                                |
| -------------- | ------ | :------: | ------- | ------------------------------------------ |
| `text`         | string |    ✅    | —       | 要合成的文本                               |
| `format`       | string |    —     | `mp3`   | `mp3` / `wav`                              |
| `sample_rate`  | number |    —     | 44100   | 采样率                                     |
| `reference_id` | string |    —     | —       | 用户预存的声音克隆 ID（adapter `voiceId`） |
| `speed`        | number |    —     | 1.0     | 语速                                       |

## Response

**音频二进制流**（不是 JSON）：

```
Content-Type: audio/mpeg (or audio/wav)
Body: <raw binary audio>
```

Adapter 把 buffer 转为 base64 data URL（`data:audio/mpeg;base64,...`）返回，并按比特率粗估时长：

- `mp3` ≈ 16000 bytes/sec
- `wav` ≈ 176400 bytes/sec（44.1kHz × 2 × 2）

## Capabilities

- ✅ TTS（多语言）
- ✅ Voice cloning via `reference_id`
- ✅ 语速控制
- ❌ Image / Video generation

## Error Handling

- HTTP 错误抛出 `ProviderError('Fish Audio', statusCode, detail)`
- 非 200 时读 response text 作为错误详情

## Adapter Implementation

`src/services/providers/fish-audio.adapter.ts`

## Connection Strategy

> 详细决策矩阵见 [`connection-strategy.md`](connection-strategy.md)。

| 维度                 | 设置                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| 区域可达性           | 海外直连 ✅；国内直连 ✅（Fish 的服务有国内节点）                          |
| 默认 base URL        | `https://api.fish.audio`（`AI_PROVIDER_ENDPOINTS.FISH_AUDIO`）             |
| Per-route 覆盖       | `providerConfig.baseUrl`                                                   |
| 超时                 | **60s**（`models/audio.ts: timeoutMs: 60_000`）                            |
| 重试                 | 5xx + 429 + 网络错误重试；503/504 不重试                                   |
| 跨 provider fallback | 可考虑 `s2-pro → fal-ai/f5-tts`（quality 降级，但 free tier 用户体验更好） |

Fish Audio 不需要中转 —— 国内/海外都直连稳。如果出现 timeout，检查 `text` 是否过长（超长文本应分段调用）。
