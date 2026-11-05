'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import type { GenerationRecord } from '@/types'
import { useErrorText } from '@/hooks/use-error-text'
import { uploadImageFileAPI } from '@/lib/api-client'
import { clearGalleryCache } from '@/lib/gallery-cache'
import { rasterizeGifFirstFrameToPng } from '@/lib/gif-first-frame'
import { rasterizeSvgUrlToPng, type SvgToPngLongEdge } from '@/lib/svg-to-png'

/**
 * 「转 PNG」：浏览器把 SVG 作品画成 PNG，走普通的图片上传存成一张新作品
 * （SVG 原件不动）。结果卡菜单与「拿 SVG 当输入」的拦截弹窗共用这一个。
 */
export function useSvgToPng() {
  const t = useTranslations('SvgToPng')
  const errText = useErrorText()
  const [convertingId, setConvertingId] = useState<string | null>(null)

  const convert = useCallback(
    async (
      /** `id` 只用来标「哪一张在转」与文件名；拦截弹窗只拿得到 URL。 */
      source: { url: string; id?: string },
      longEdge: SvgToPngLongEdge,
    ): Promise<GenerationRecord | null> => {
      const key = source.id ?? source.url
      setConvertingId(key)
      try {
        const file = await rasterizeSvgUrlToPng({
          url: source.url,
          longEdge,
          baseName: source.id ? `antei-${source.id.slice(0, 8)}` : 'antei-svg',
        })
        if (file.size > CLIENT_UPLOAD_MAX_BYTES) {
          toast.error(t('tooLarge'))
          return null
        }
        const response = await uploadImageFileAPI(file)
        if (!response.success || !response.data) {
          toast.error(errText.api(response, t('failed')))
          return null
        }
        clearGalleryCache()
        toast.success(t('done', { size: longEdge }))
        return response.data.generation
      } catch (error) {
        toast.error(errText.thrown(error, t('failed')))
        return null
      } finally {
        setConvertingId(null)
      }
    },
    [errText, t],
  )

  /** GIF → 第一帧 PNG（原尺寸），同样存成新作品；GIF 原件不动。 */
  const convertGifFirstFrame = useCallback(
    async (source: {
      url: string
      id?: string
    }): Promise<GenerationRecord | null> => {
      const key = source.id ?? source.url
      setConvertingId(key)
      try {
        const file = await rasterizeGifFirstFrameToPng({
          url: source.url,
          baseName: source.id ? `antei-${source.id.slice(0, 8)}` : 'antei-gif',
        })
        if (file.size > CLIENT_UPLOAD_MAX_BYTES) {
          toast.error(t('tooLarge'))
          return null
        }
        const response = await uploadImageFileAPI(file)
        if (!response.success || !response.data) {
          toast.error(errText.api(response, t('gifFailed')))
          return null
        }
        clearGalleryCache()
        toast.success(t('gifDone'))
        return response.data.generation
      } catch (error) {
        toast.error(errText.thrown(error, t('gifFailed')))
        return null
      } finally {
        setConvertingId(null)
      }
    },
    [errText, t],
  )

  return { convert, convertGifFirstFrame, convertingId }
}
