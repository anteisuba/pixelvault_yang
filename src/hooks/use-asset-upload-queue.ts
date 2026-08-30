'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ASSET_UPLOAD_FALLBACK_ASPECT_RATIO } from '@/constants/assets-grid'
import type { GenerationRecord } from '@/types'

/**
 * 上传队列 —— `docs/references/pages/assets.md` §7 / §7.3。
 *
 * ⭐ 它替掉的是「只有一个全局 `isUploading` + toast」：那种做法下**从点下上传
 * 到成功为止，网格毫无反应**，用户只能在角落 toast 里找信号。队列把每一项的
 * 目标夹、进度、结果都摆出来，失败项**不静默消失**，可以单项重试。
 *
 * ⚠ 这里只管**队列状态**；真正的上传动作由调用方注入（`upload`），因为压缩、
 * 文案、落夹目标那些规则长在页面上，不该被这个 hook 复制一份。
 */

export type UploadQueueItemStatus = 'uploading' | 'done' | 'error'

export interface UploadQueueItem {
  id: string
  fileName: string
  /** 本地 object URL —— 占位瓦片直接拿它显示，不用等服务端。 */
  previewUrl: string
  /** 本地读到的真实宽高比，占位瓦片按它参与 justified 排版（§7.3.6）。 */
  aspectRatio: number
  /** 0–100，来自 R2 直传的 XHR 进度事件（不是假动画）。 */
  progress: number
  status: UploadQueueItemStatus
  error?: string
  targetProjectId: string | null
  generation?: GenerationRecord
}

export interface UploadResult {
  ok: boolean
  generation?: GenerationRecord
  error?: string
}

interface UseAssetUploadQueueOptions {
  upload: (
    file: File,
    options: {
      projectId: string | null
      onProgress: (percent: number) => void
    },
  ) => Promise<UploadResult>
  /** 单项成功后回调 —— 页面据此决定要不要把它插进当前网格。 */
  onUploaded?: (generation: GenerationRecord) => void
}

export interface UseAssetUploadQueueReturn {
  items: UploadQueueItem[]
  /** 仍在传的项 —— 网格最前面的占位瓦片就是它们。 */
  pendingItems: UploadQueueItem[]
  doneCount: number
  errorCount: number
  isUploading: boolean
  enqueue: (files: File[], targetProjectId: string | null) => void
  retry: (id: string) => void
  retryAll: () => void
  remove: (id: string) => void
  clearCompleted: () => void
  /** 队列面板顶部改落夹目标 —— 只对还没开传的项生效。 */
  changeTarget: (projectId: string | null) => void
}

/** 本地读取图片/视频的真实宽高比；读不到就按契约兜底 4:5。 */
function readAspectRatio(objectUrl: string, mimeType: string): Promise<number> {
  if (mimeType.startsWith('video/')) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        resolve(
          video.videoWidth > 0 && video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : ASSET_UPLOAD_FALLBACK_ASPECT_RATIO,
        )
        video.removeAttribute('src')
        video.load()
        video.remove()
      }
      video.onerror = () => {
        resolve(ASSET_UPLOAD_FALLBACK_ASPECT_RATIO)
        video.remove()
      }
      video.src = objectUrl
    })
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      resolve(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : ASSET_UPLOAD_FALLBACK_ASPECT_RATIO,
      )
    }
    image.onerror = () => resolve(ASSET_UPLOAD_FALLBACK_ASPECT_RATIO)
    image.src = objectUrl
  })
}

export function useAssetUploadQueue({
  upload,
  onUploaded,
}: UseAssetUploadQueueOptions): UseAssetUploadQueueReturn {
  const [items, setItems] = useState<UploadQueueItem[]>([])
  // 文件对象不进 state：它不参与渲染，只在重试时要用。
  const filesRef = useRef<Map<string, File>>(new Map())
  const runningRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const uploadRef = useRef(upload)
  const onUploadedRef = useRef(onUploaded)
  useEffect(() => {
    uploadRef.current = upload
    onUploadedRef.current = onUploaded
  }, [upload, onUploaded])

  const patchItem = useCallback(
    (id: string, patch: Partial<UploadQueueItem>) => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  /**
   * 串行跑队列 —— 一次一个。⚠ 别改成并行：R2 直传是整文件 PUT，几个大图并发
   * 会把上行带宽分光，每一项的进度都变得很慢，用户反而以为卡死了。
   */
  const drain = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift()
        if (!id) continue
        const file = filesRef.current.get(id)
        if (!file) continue
        let target: string | null = null
        setItems((current) => {
          const item = current.find((entry) => entry.id === id)
          target = item?.targetProjectId ?? null
          return current.map((entry) =>
            entry.id === id
              ? { ...entry, status: 'uploading', progress: 0, error: undefined }
              : entry,
          )
        })
        const result = await uploadRef.current(file, {
          projectId: target,
          onProgress: (percent) => patchItem(id, { progress: percent }),
        })
        if (result.ok && result.generation) {
          patchItem(id, {
            status: 'done',
            progress: 100,
            generation: result.generation,
          })
          onUploadedRef.current?.(result.generation)
        } else {
          patchItem(id, { status: 'error', error: result.error })
        }
      }
    } finally {
      runningRef.current = false
    }
  }, [patchItem])

  const enqueue = useCallback(
    (files: File[], targetProjectId: string | null) => {
      if (files.length === 0) return
      const created = files.map((file) => {
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 9)}`
        filesRef.current.set(id, file)
        const previewUrl = URL.createObjectURL(file)
        void readAspectRatio(previewUrl, file.type).then((aspectRatio) =>
          patchItem(id, { aspectRatio }),
        )
        const item: UploadQueueItem = {
          id,
          fileName: file.name,
          previewUrl,
          aspectRatio: ASSET_UPLOAD_FALLBACK_ASPECT_RATIO,
          progress: 0,
          status: 'uploading',
          targetProjectId,
        }
        return item
      })
      setItems((current) => [...current, ...created])
      queueRef.current.push(...created.map((item) => item.id))
      void drain()
    },
    [drain, patchItem],
  )

  const retry = useCallback(
    (id: string) => {
      if (!filesRef.current.has(id)) return
      patchItem(id, { status: 'uploading', progress: 0, error: undefined })
      queueRef.current.push(id)
      void drain()
    },
    [drain, patchItem],
  )

  const retryAll = useCallback(() => {
    setItems((current) => {
      const failed = current.filter((item) => item.status === 'error')
      queueRef.current.push(...failed.map((item) => item.id))
      void drain()
      return current.map((item) =>
        item.status === 'error'
          ? { ...item, status: 'uploading', progress: 0, error: undefined }
          : item,
      )
    })
  }, [drain])

  const remove = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((entry) => entry !== id)
    filesRef.current.delete(id)
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }, [])

  const clearCompleted = useCallback(() => {
    setItems((current) => {
      current
        .filter((item) => item.status === 'done')
        .forEach((item) => {
          URL.revokeObjectURL(item.previewUrl)
          filesRef.current.delete(item.id)
        })
      return current.filter((item) => item.status !== 'done')
    })
  }, [])

  const changeTarget = useCallback((projectId: string | null) => {
    setItems((current) =>
      current.map((item) =>
        // 已经传完的改不了目标 —— 那是「移动」，不是「上传到哪」。
        item.status === 'done' ? item : { ...item, targetProjectId: projectId },
      ),
    )
  }, [])

  // 组件卸载时把 object URL 还回去，避免长会话里堆内存。
  useEffect(() => {
    const urls = filesRef.current
    return () => {
      urls.clear()
    }
  }, [])

  const pendingItems = items.filter((item) => item.status !== 'done')
  return {
    items,
    pendingItems,
    doneCount: items.filter((item) => item.status === 'done').length,
    errorCount: items.filter((item) => item.status === 'error').length,
    isUploading: items.some((item) => item.status === 'uploading'),
    enqueue,
    retry,
    retryAll,
    remove,
    clearCompleted,
    changeTarget,
  }
}
