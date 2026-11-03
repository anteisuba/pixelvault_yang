import { describe, expect, it } from 'vitest'

import {
  GENERATION_ERROR_CODES as C,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'

/**
 * 线上真实原话（2026-11-03 只读取自生产 GenerationJob 失败记录，223 种原话），
 * 每条注明以前被说成什么。收窄 / 加规则时只按这种真实样本改，⛔ 不凭感觉
 * （docs/design/errors.md §7）。括号里的数字是线上出现次数。
 */
const SAMPLES: Array<[string, string, string]> = [
  // ── 以前说成「服务商无法下载这张参考图」——其实是我们连不上服务商（31 次）
  ['fetch failed', C.PROVIDER_UNREACHABLE, 'Fish Audio 配音也照报参考图 (13)'],
  ['write EPIPE', C.PROVIDER_UNREACHABLE, 'fal (2)'],
  ['terminated', C.PROVIDER_UNREACHABLE, 'fal (1)'],
  // ── LoRA 文件取不到（以前：参考图 / API Key 无效 / 模型不可用）
  [
    'LoRA file URL is not accessible. Please check the URL or re-train the LoRA.',
    C.LORA_UNREACHABLE,
    '参考图 (13)',
  ],
  [
    'Failed to download Civitai LoRA 2266398 to R2',
    C.LORA_UNREACHABLE,
    '参考图 (6)',
  ],
  [
    'Replicate image generation failed: URL responded with status code: 401',
    C.LORA_UNREACHABLE,
    'API Key 无效 (5)',
  ],
  [
    'Replicate API error (502): Prediction failed: URL responded with status code: 403',
    C.LORA_UNREACHABLE,
    '模型不可用 (2)',
  ],
  [
    'fal.ai API error (422): {"detail":[{"loc":["body","loras"],"msg":"Failed to download the file. Please check if the URL is accessible and try again.","type":"file_download_error"}]}',
    C.LORA_UNREACHABLE,
    '参考图 (7)',
  ],
  [
    'Replicate error: Failed to upload LoRA to Replicate: <html><head><title>413 Payload Too Large</title></head></html>',
    C.LORA_UNREACHABLE,
    '参考图过大 (1)',
  ],
  [
    'Replicate image generation failed: URL not downloadable.',
    C.LORA_UNREACHABLE,
    'UNKNOWN (2)',
  ],
  // ── 我们自己的程序 / 平台限制：显示原话，不往别处推
  [
    'Step poll-runner-image-80-1 output is too large. Maximum allowed size is 1MiB.',
    C.UNKNOWN,
    '参考图过大 (2)',
  ],
  [
    'Transaction API error: A commit cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms',
    C.UNKNOWN,
    '服务商超时 (1)',
  ],
  [
    'VolcEngine image generation failed (400): {"error":{"code":"InvalidParameter","message":"The parameter `size` specified in the request are not valid: image area must be at most 4624220 pixels."}}',
    C.UNKNOWN,
    '参考图尺寸 (2)',
  ],
  [
    'Latent hires dimensions exceed the Runner 2048px limit.',
    C.UNKNOWN,
    '参考图尺寸 (1)',
  ],
  [
    'fal.ai API error (404): {"detail":"Path /v1.1 not found"}',
    C.UNKNOWN,
    '模型不可用 (2)',
  ],
  ['HuggingFace API error (404): Not Found', C.UNKNOWN, '模型不可用 (1)'],
  ['fal.ai result fetch failed with status 422', C.UNKNOWN, '参考图 (3)'],
  // ── 以前认不出（UNKNOWN）的
  [
    'WorkerProviderError: content_policy_violation: The images or videos provided may contain likenesses of real people or other private information that cannot be processed.',
    C.CONTENT_FILTERED,
    '(4)',
  ],
  [
    'WorkerProviderError: content_policy_violation: Output audio has sensitive content.',
    C.CONTENT_FILTERED,
    '(2)',
  ],
  [
    'The request failed because the output video may be related to copyright restrictions.',
    C.CONTENT_FILTERED,
    'BytePlus (5)',
  ],
  [
    'NovelAI API error (403): Your NovelAI subscription (Tablet/Scroll) only supports 1 reference image.',
    C.REFERENCE_IMAGE_LIMIT_EXCEEDED,
    '(6)',
  ],
  ['Civitai API token is invalid or expired.', C.INVALID_API_KEY, '(3)'],
  ['Fish Audio error: Invalid Token', C.INVALID_API_KEY, '(2)'],
  [
    'Replicate API key is invalid or expired. Please update it in the sidebar.',
    C.INVALID_API_KEY,
    '(1)',
  ],
  [
    'fal.ai error: fal.ai 错误 (HTTP 422)：{"detail":"Unsupported or incompatible LoRA checkpoint: Target modules {\'blocks.6.mlp.layer1\'}"}',
    C.LORA_INCOMPATIBLE_HOSTED,
    '(2)',
  ],
  [
    'Replicate API error (502): Prediction failed: URL file extension "" isn\'t supported for LoRA!',
    C.LORA_INCOMPATIBLE_HOSTED,
    '模型不可用 (1)',
  ],
  // ── 原本就对、收窄后必须仍然对
  [
    'Gemini API error (404): { "error": { "code": 404, "message": "models/gemini-3.1-pro-image-preview is not found for API version v1beta" } }',
    C.MODEL_UNAVAILABLE,
    '(4)',
  ],
  [
    'Replicate error: Model lucataco/animapencil-xl-v4 not found',
    C.MODEL_UNAVAILABLE,
    '(1)',
  ],
  [
    'fal.ai API error (404): {"detail": "Application \'flux-2-dev\' not found"}',
    C.MODEL_UNAVAILABLE,
    '(1)',
  ],
  [
    'Execution worker dispatch failed: fetch failed',
    C.EXECUTION_WORKER_UNAVAILABLE,
    '(8)',
  ],
  [
    'Unable to download content from the provided URL before the timeout. Check that the URL is publicly accessible and responds promptly.',
    C.REFERENCE_IMAGE_UNREACHABLE,
    'OpenAI (5)',
  ],
  [
    'Replicate could not download the reference image. Use a direct public image URL or upload the image again.',
    C.REFERENCE_IMAGE_UNREACHABLE,
    '(2)',
  ],
  [
    'The operation was aborted due to timeout',
    C.PROVIDER_TIMEOUT,
    'Gemini (24)',
  ],
  [
    'Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com',
    C.CONTENT_FILTERED,
    'OpenAI (40+)',
  ],
  [
    'NovelAI image generation failed (401): {"statusCode":401,"message":"Unauthorized"}',
    C.INVALID_API_KEY,
    '(2)',
  ],
  ['Concurrent generation is locked', C.PROVIDER_RATE_LIMIT, 'NovelAI (71)'],
]

describe('线上真实报错样本（11-03）', () => {
  for (const [message, expected, note] of SAMPLES) {
    it(`${expected} ← ${note}: ${message.slice(0, 60)}`, () => {
      expect(parseGenerationErrorCode(message)).toBe(expected)
    })
  }

  it('BytePlus 原样存的 PolicyViolation 码认成内容审核', () => {
    expect(
      normalizeErrorCode('OutputVideoSensitiveContentDetected.PolicyViolation'),
    ).toBe(C.CONTENT_FILTERED)
  })
})
