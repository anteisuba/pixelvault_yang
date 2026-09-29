import 'server-only'

import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'
import { ApiRequestError } from '@/lib/errors'
import { getFishAudioVoiceLibraryApiKey } from '@/lib/platform-keys'
import { getVoice } from '@/services/fish-audio-voice.service'
import {
  getR2PublicUrl,
  r2ObjectExists,
  uploadFromHttpToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

/**
 * 一副音色在这位用户存储里的那一份示例。键只由「谁 · 哪副嗓子」决定：同一副嗓子
 * 「用这段」第二次直接复用，⛔ 不再向 Fish 取、不再多存一份。
 *
 * ⚠ 固定 `.mp3`：Fish 的示例都是 mp3；真来一段别的格式，`Content-Type` 照原样存，
 * 浏览器按它播，不看扩展名。
 */
function voiceSampleStorageKey(userId: string, voiceId: string): string {
  return `generations/${userId}/audio/voice-sample_${voiceId}.mp3`
}

/**
 * 「用这段」—— 把平台音色自带的示例存进自己的存储，返回可以长期落在卡上的地址。
 *
 * ⚠ 为什么不直接用声音库给的那条地址：Fish 的示例有一半是一小时就过期的签名链接，
 * 原样落进卡里，一小时后卡上就只剩「这段音频暂时读不到」（owner 2026-09-29 真机）。
 * 取哪一段由这里向 Fish 现问（平台 key），⛔ 不收客户端给的 URL。
 */
export async function importVoiceSample(
  clerkId: string,
  voiceId: string,
): Promise<{ readonly url: string }> {
  const user = await ensureUser(clerkId)
  const key = voiceSampleStorageKey(user.id, voiceId)
  if (await r2ObjectExists(key)) return { url: getR2PublicUrl(key) }

  const apiKey = getFishAudioVoiceLibraryApiKey()
  if (!apiKey) {
    throw new ApiRequestError(
      VOICE_API_ERROR_CODES.PUBLIC_LIBRARY_UNAVAILABLE,
      503,
      'errors.voice.libraryUnavailable',
      'Fish Audio public voice library is unavailable.',
    )
  }

  const voice = await getVoice(apiKey, voiceId)
  const sample = voice.samples.find((item) => item.audio)
  if (!sample) {
    throw new ApiRequestError(
      VOICE_API_ERROR_CODES.SAMPLE_MISSING,
      404,
      'errors.voice.sampleMissing',
      'This voice has no sample audio.',
    )
  }

  const { publicUrl } = await uploadFromHttpToR2({
    sourceUrl: sample.audio,
    key,
  })
  return { url: publicUrl }
}
