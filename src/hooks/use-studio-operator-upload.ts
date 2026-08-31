'use client'

/**
 * 📎 附件面板的**上传三通道**（P3-A，拍板 16：图 / 音 / 视频）。
 *
 * ── 一条链，不是三条 ────────────────────────────────────────────
 * 三种文件走三个后端通道，但**出口只有一个**：拿到 https URL 之后统一转成
 * `StudioOperatorAttachment`，进的是素材库挑图进的那同一个附件数组、走的是
 * `send()` 那同一条发送路径。⭐ 这条是本片的验收线：上传来的附件与库里挑的
 * 附件在下游必须**分不出来**，否则「上传能用了」只是长得像能用。
 *
 * ── 为什么不复用 `use-asset-upload-queue` ──────────────────────
 * 那个队列服务的是素材页：落夹目标、占位瓦片的宽高比、retryAll、clearCompleted、
 * 网格插入回调 —— 一件都不是这里要的（这里没有网格，chip 就是全部的 UI），
 * 而它此刻还是别的会话的在飞文件。真正值得复用的是**按 MIME 分派的那段**，
 * 于是这里照 `KreaAssetBrowser.uploadOneFile` 的判据逐条对齐，共用的是
 * `constants/uploads.ts` 的那张表和 `api-client/generation.ts` 的那三个函数。
 *
 * ── 三条不许违反的规矩 ─────────────────────────────────────────
 * ① ⛔ **绝不 base64 进消息体**（台账 BG：Vercel 4.5MB 硬顶，一张 3.4MB 的图
 *    base64 之后单独就能顶爆）。三条通道全是「浏览器直传 R2 → 服务端落库 →
 *    回一个 https URL」，请求体里从头到尾没有过文件字节。
 * ② ⛔ **别按扩展名判型**（台账 BH：`/api/upload-image` 的产物一律 `.png` 后缀）。
 *    分派看 `file.type`，出口的 `kind` 看服务端回的 `outputType` —— 两处都不碰
 *    文件名。
 * ③ ⛔ **失败不静默**：失败的那件留在队列里，带原因、可重试、可摘除。
 *    「上传失败了但 chip 消失了」与「上传成功了」在界面上是同一个样子。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  CLIENT_AUDIO_UPLOAD_MAX_BYTES,
  CLIENT_UPLOAD_MAX_BYTES,
  CLIENT_VIDEO_UPLOAD_MAX_BYTES,
  USER_AUDIO_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_VIDEO_UPLOAD_ACCEPTED_MIME_TYPES,
} from '@/constants/uploads'
import { getApiErrorMessage } from '@/lib/api-error-message'
import {
  uploadAudioFileAPI,
  uploadImageFileAPI,
  uploadVideoFileAPI,
} from '@/lib/api-client/generation'
import { readAudioFileMetadata } from '@/lib/audio-metadata'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import {
  captureVideoThumbnail,
  readVideoFileMetadata,
} from '@/lib/video-thumbnail'
import type { GenerationRecord } from '@/types'
import type {
  StudioOperatorAttachment,
  StudioOperatorUpload,
} from '@/types/studio-assistant-operator'

/**
 * 素材记录 → 附件。
 *
 * ⭐ **三处共用这一个映射**（6 格 / 完整素材库弹层 / 上传出口）：各写一遍就是
 * 「视频在这边有缩略图、在那边碎掉」这类不对称的来源，而三处拿到的本来就是同一
 * 种记录（`GalleryResponseData.generations`、picker 的 `onSelect`、以及三个上传
 * 接口 `data.generation`，全是 `GenerationRecord`）。
 *
 * `label` 可覆盖：刚传上去的东西 `prompt` 是空的，回落到 `model` 会得到
 * `user-upload` 这个零信息量的字符串（P2 遗留 ④）。上传通道知道文件叫什么，
 * 就用文件名。
 */
export function toOperatorAttachment(
  generation: GenerationRecord,
  label?: string,
): StudioOperatorAttachment {
  const kind: StudioOperatorAttachment['kind'] =
    generation.outputType === 'VIDEO'
      ? 'video'
      : generation.outputType === 'AUDIO'
        ? 'audio'
        : generation.outputType === 'MODEL_3D'
          ? 'model3d'
          : 'image'
  // 图片自己就是自己的缩略图；其余三种只有库里真存了缩略图才有
  // （⚠「视频零缩略图」是本仓已知缺口 —— 这里不假装它一定有）。
  const thumbnailUrl =
    generation.thumbnailUrl ?? (kind === 'image' ? generation.url : undefined)
  return {
    id: generation.id,
    url: generation.url,
    label: label ?? (generation.prompt.slice(0, 40) || generation.model),
    kind,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  }
}

function includesMime(list: readonly string[], mime: string): boolean {
  return list.includes(mime)
}

/** 只按 MIME 分派（台账 BH：⛔ 不看扩展名）。认不得的返回 `null`。 */
function classify(file: File): StudioOperatorUpload['kind'] | null {
  if (includesMime(USER_AUDIO_UPLOAD_ACCEPTED_MIME_TYPES, file.type)) {
    return 'audio'
  }
  if (includesMime(USER_VIDEO_UPLOAD_ACCEPTED_MIME_TYPES, file.type)) {
    return 'video'
  }
  if (includesMime(USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES, file.type)) {
    return 'image'
  }
  return null
}

/** 一件上传的终局 —— 要么拿到落库的记录，要么拿到一句能给人看的原因。 */
type UploadOutcome =
  | { generation: GenerationRecord; error?: undefined }
  | { generation?: undefined; error: string }

export interface UseStudioOperatorUploadResult {
  /** 还在传 / 传失败的那些 —— chip 行按它渲染。成功的已经出列变成附件了。 */
  uploads: readonly StudioOperatorUpload[]
  /** 三个通道的唯一入口：点击选文件、拖进来、粘贴，落点都是它。 */
  uploadFiles(files: readonly File[]): void
  /** 失败项重试（原文件还留在 ref 里）。 */
  retryUpload(id: string): void
  /** 摘掉一件（在飞的也能摘 —— 摘了就不再回来，见实现里的 `dismissedRef`）。 */
  dismissUpload(id: string): void
}

interface UseStudioOperatorUploadOptions {
  /** 传成了就交出去 —— 宿主把它塞进那唯一的附件数组。 */
  onUploaded(attachment: StudioOperatorAttachment): void
}

export function useStudioOperatorUpload({
  onUploaded,
}: UseStudioOperatorUploadOptions): UseStudioOperatorUploadResult {
  const t = useTranslations('StudioOperator')
  const tErrors = useTranslations('Errors')
  const [uploads, setUploads] = useState<StudioOperatorUpload[]>([])

  // 文件对象不进 state（它不参与渲染，只在重试时要用）；
  // `dismissedRef` 是「用户在传的过程中把它摘了」的记号 —— 没有它，一件被摘掉
  // 的上传会在几秒后成功并把自己挂回去，用户会看到一个他明明删掉的附件。
  const filesRef = useRef<Map<string, File>>(new Map())
  const dismissedRef = useRef<Set<string>>(new Set())
  const seqRef = useRef(0)

  // 本地预览的 object URL 必须还回去，否则每传一张图漏一份 blob。
  const previewsRef = useRef<Set<string>>(new Set())
  useEffect(
    () => () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url)
      previewsRef.current.clear()
    },
    [],
  )

  // ⚠ 事件循环跨很多次 render（一次上传几秒到几分钟），回调走 latest-ref ——
  // 与 `use-assistant-operator` / `use-asset-upload-queue` 同一个写法。
  const latest = useRef({ onUploaded, t, tErrors })
  useEffect(() => {
    latest.current = { onUploaded, t, tErrors }
  }, [onUploaded, t, tErrors])

  const patch = useCallback(
    (id: string, next: Partial<StudioOperatorUpload>) => {
      setUploads((current) =>
        current.map((item) => (item.id === id ? { ...item, ...next } : item)),
      )
    },
    [],
  )

  const forget = useCallback((id: string) => {
    filesRef.current.delete(id)
    setUploads((current) => current.filter((item) => item.id !== id))
  }, [])

  /**
   * 一件文件的全过程。**三个分支各自完整**（尺寸闸 → 本地元数据 → 直传 → 落库），
   * ⛔ 不抽一个「通用上传」把三者的差异塞进 options：视频要先抓一帧封面、
   * 音频要读时长、图片超限要先压 —— 这些差异就是这三条通道存在的理由。
   */
  const runUpload = useCallback(
    async (
      id: string,
      file: File,
      kind: StudioOperatorUpload['kind'],
    ): Promise<UploadOutcome> => {
      const { t: tr, tErrors: te } = latest.current
      const onProgress = (percent: number) => {
        // 摘掉之后别再往一个不存在的条目上写进度。
        if (!dismissedRef.current.has(id)) patch(id, { progress: percent })
      }

      try {
        if (kind === 'audio') {
          if (file.size > CLIENT_AUDIO_UPLOAD_MAX_BYTES) {
            return {
              error: tr('attach.upload.tooLargeAudio', {
                maxGb: String(CLIENT_AUDIO_UPLOAD_MAX_BYTES / 1024 ** 3),
              }),
            }
          }
          const metadata = await readAudioFileMetadata(file)
          const response = await uploadAudioFileAPI(file, {
            duration: metadata?.duration,
            onProgress,
          })
          return response.success && response.data
            ? { generation: response.data.generation }
            : {
                error: getApiErrorMessage(
                  te,
                  response,
                  tr('attach.upload.failed'),
                ),
              }
        }

        if (kind === 'video') {
          if (file.size > CLIENT_VIDEO_UPLOAD_MAX_BYTES) {
            return {
              error: tr('attach.upload.tooLargeVideo', {
                maxGb: String(CLIENT_VIDEO_UPLOAD_MAX_BYTES / 1024 ** 3),
              }),
            }
          }
          // 封面是尽力而为：抓不到帧不该让一次成功的上传变成失败。
          const [metadata, poster] = await Promise.all([
            readVideoFileMetadata(file),
            captureVideoThumbnail(file),
          ])
          const response = await uploadVideoFileAPI(file, {
            width: metadata?.width ?? 0,
            height: metadata?.height ?? 0,
            duration: metadata?.duration,
            poster,
            onProgress,
          })
          return response.success && response.data
            ? { generation: response.data.generation }
            : {
                error: getApiErrorMessage(
                  te,
                  response,
                  tr('attach.upload.failed'),
                ),
              }
        }

        // 图片：超限的先在浏览器里压到 15MB 以内再传（拖一张手机原图进来就该
        // 直接能用），压不动的由 `prepareImageUpload` 自己弹 toast 并返回 null。
        const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
        const prepared = await prepareImageUpload(file, {
          maxBytes: CLIENT_UPLOAD_MAX_BYTES,
          messages: {
            compressing: tr('attach.upload.compressing'),
            compressed: ({ from, to }) =>
              tr('attach.upload.compressed', { from, to }),
            gifTooLarge: tr('attach.upload.gifTooLarge', { maxMb }),
            tooLarge: tr('attach.upload.tooLargeImage', { maxMb }),
          },
        })
        if (!prepared)
          return { error: tr('attach.upload.tooLargeImage', { maxMb }) }

        const response = await uploadImageFileAPI(prepared, { onProgress })
        return response.success && response.data
          ? { generation: response.data.generation }
          : {
              error: getApiErrorMessage(
                te,
                response,
                tr('attach.upload.failed'),
              ),
            }
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : tr('attach.upload.failed'),
        }
      }
    },
    [patch],
  )

  const start = useCallback(
    (id: string, file: File, kind: StudioOperatorUpload['kind']) => {
      void runUpload(id, file, kind).then((result) => {
        // 用户在传的过程中摘掉了它 —— 结果直接丢，别挂回去也别报错。
        if (dismissedRef.current.has(id)) {
          dismissedRef.current.delete(id)
          filesRef.current.delete(id)
          return
        }
        if (result.generation) {
          latest.current.onUploaded(
            toOperatorAttachment(result.generation, file.name),
          )
          forget(id)
          return
        }
        // ⛔ 不静默：失败的留在队列里，带原因、可重试。
        patch(id, { status: 'error', error: result.error })
      })
    },
    [forget, patch, runUpload],
  )

  const uploadFiles = useCallback(
    (files: readonly File[]) => {
      const next: StudioOperatorUpload[] = []
      for (const file of files) {
        const kind = classify(file)
        seqRef.current += 1
        const id = `upload-${seqRef.current}-${file.size}`
        if (!kind) {
          // 认不得的类型也进队列 —— 「我拖了一个 .psd 进去，什么都没发生」
          // 是最难查的那种失败。
          next.push({
            id,
            fileName: file.name,
            kind: 'image',
            progress: 0,
            status: 'error',
            error: latest.current.t('attach.upload.unsupported'),
          })
          continue
        }
        // 只有图片有本地预览：视频/音频的 object URL 喂给 `next/image` 是碎图标。
        let previewUrl: string | undefined
        if (kind === 'image') {
          previewUrl = URL.createObjectURL(file)
          previewsRef.current.add(previewUrl)
        }
        filesRef.current.set(id, file)
        next.push({
          id,
          fileName: file.name,
          kind,
          progress: 0,
          status: 'uploading',
          ...(previewUrl ? { previewUrl } : {}),
        })
        start(id, file, kind)
      }
      if (next.length > 0) setUploads((current) => [...current, ...next])
    },
    [start],
  )

  const retryUpload = useCallback(
    (id: string) => {
      const file = filesRef.current.get(id)
      if (!file) return
      const kind = classify(file)
      if (!kind) return
      dismissedRef.current.delete(id)
      patch(id, { status: 'uploading', progress: 0, error: undefined })
      start(id, file, kind)
    },
    [patch, start],
  )

  const dismissUpload = useCallback(
    (id: string) => {
      // 在飞的也记一笔：它的 promise 还在跑，成功回来时必须知道自己已被放弃。
      dismissedRef.current.add(id)
      forget(id)
    },
    [forget],
  )

  return { uploads, uploadFiles, retryUpload, dismissUpload }
}
