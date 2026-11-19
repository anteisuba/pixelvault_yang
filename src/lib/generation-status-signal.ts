import type { AsyncJobStatus } from '@/types'

/**
 * 生成状态的**统一出口**：图 / 视频 / 音频 / 3D 四条状态查询（`api-client/generation.ts`
 * 的 `check*StatusAPI`）每读到一次状态就在这里报一声。
 *
 * 为什么挂在状态查询上而不是各台的完成分支：完成的分支散在工作台（`useUnifiedGenerate`
 * 十几处）、画布、3D 台、图片编辑里，每处各写一份「完成了通知一下」必然漏；而它们
 * 无一例外都经过这四个函数读状态。⛔ 别在各台再写第二份。
 *
 * 只是广播，不做判断：谁关心（例：设置里的「生成完成时通知」）自己订阅、自己去重。
 */

export type GenerationSignalKind = 'image' | 'video' | 'audio' | 'model3d'

export interface GenerationStatusSignal {
  kind: GenerationSignalKind
  jobId: string
  status: AsyncJobStatus
}

type Listener = (signal: GenerationStatusSignal) => void

const listeners = new Set<Listener>()

export function subscribeGenerationStatus(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 状态查询回来后调用；只认成功信封里带 `status` 的那种，其余（网络错、4xx）不报。 */
export function reportGenerationStatus(
  kind: GenerationSignalKind,
  jobId: string,
  response: { success: boolean; data?: { status?: AsyncJobStatus } },
): void {
  const status = response.success ? response.data?.status : undefined
  if (!status || listeners.size === 0) return
  const signal: GenerationStatusSignal = { kind, jobId, status }
  for (const listener of listeners) {
    try {
      listener(signal)
    } catch {
      // 订阅方出错不能打断出图轮询本身。
    }
  }
}
