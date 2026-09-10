/**
 * 「转文字」：把这张卡上的那段声音取回来交给既有的转写接口
 * （`transcribeVoiceAPI` → `/api/voices/transcribe`）。
 *
 * ⚠ 为什么要先取回 blob：转写接口收的是 **multipart 里的文件**（配音间的
 * `AudioTranscribeDialog` 与 `VoiceTrainer` 都这么调），而画布上的节点手里只有一个
 * 地址。⛔ 不为此新开一条「按 url 转写」的服务端路由——那是同一件事的第二份实现。
 *
 * ⛔ 这里**不是**组件里的 fetch：取媒体字节不是调我们的 API，真正的 API 调用仍然
 * 只有 `transcribeVoiceAPI` 一处，走 `lib/api-client`（Hard Rule 3）。
 */

import { transcribeVoiceAPI } from '@/lib/api-client'

export interface AudioTranscribeResult {
  readonly ok: boolean
  readonly text?: string
  readonly error?: string
  readonly errorCode?: string
}

export async function transcribeAudioUrl(
  url: string,
  fileName: string,
): Promise<AudioTranscribeResult> {
  let file: File
  try {
    const response = await fetch(url)
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    const blob = await response.blob()
    file = new File([blob], `${fileName}.mp3`, {
      type: blob.type || 'audio/mpeg',
    })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'fetch failed',
    }
  }

  const form = new FormData()
  form.append('audio', file)
  // 逐字时间戳对「转成一张文本卡」没用，关掉省一半响应。
  form.append('ignore_timestamps', 'true')
  const result = await transcribeVoiceAPI(form)
  if (!result.success || !result.data) {
    return {
      ok: false,
      ...(result.error ? { error: result.error } : {}),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    }
  }
  return { ok: true, text: result.data.text.trim() }
}
