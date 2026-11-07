'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  areShotDetectAssetsCached,
  getShotDetectAssetUrls,
  SHOT_DETECT_TOTAL_BYTES,
} from '@/lib/shot-detect/assets'
import type {
  ShotDetectErrorCode,
  ShotDetectRequest,
  ShotDetectResponse,
} from '@/lib/shot-detect/protocol'

/**
 * 拉片的切镜：起一个后台线程跑 TransNetV2，把进度和结果摊成一个状态机。
 *
 * - `checking`：看模型下没下过（Cache Storage）；
 * - `needsDownload`：第一次用，先问一句「要下 46 MB」再开切；
 * - `running`：探片 → 下模型 → 逐帧推理，`phase` 区分前两段与切镜本身；
 * - `done`：逐帧概率 + 时间戳在手，粗细三档当场换算，不再起线程；
 * - `error`：一种原因一句人话，界面给下一步。
 *
 * 取消 = `terminate()`。线程只在 `running` 时活着，结束 / 卸载都会收掉。
 */

export type ShotDetectState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'needsDownload'; totalBytes: number }
  | {
      status: 'running'
      phase: 'probe' | 'download' | 'analyze'
      /** 已下的字节（第一次用时才有）。 */
      loadedBytes: number
      totalBytes: number
      /** 是否经过了下载（决定界面要不要写「第一次用：下载切镜模型」）。 */
      downloaded: boolean
      processedSec: number
      durationSec: number
    }
  | {
      status: 'done'
      predictions: Float32Array
      timestamps: Float64Array
      durationSec: number
      downloaded: boolean
    }
  | {
      status: 'error'
      code: ShotDetectErrorCode
      durationSec?: number
      /** 网络断时下到了哪儿（「下到 31 / 46 MB」）。 */
      loadedBytes?: number
    }

const IDLE: ShotDetectState = { status: 'idle' }

export function useShotDetect() {
  const [state, setState] = useState<ShotDetectState>(IDLE)
  const workerRef = useRef<Worker | null>(null)

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  useEffect(() => stopWorker, [stopWorker])

  const run = useCallback(
    (videoUrl: string, firstDownload: boolean) => {
      const urls = getShotDetectAssetUrls()
      if (!urls) {
        setState({ status: 'error', code: 'network' })
        return
      }
      stopWorker()
      const worker = new Worker(
        new URL(
          '../../../lib/shot-detect/shot-detect.worker.ts',
          import.meta.url,
        ),
        { type: 'module' },
      )
      workerRef.current = worker
      const downloaded = firstDownload
      setState({
        status: 'running',
        phase: 'probe',
        loadedBytes: 0,
        totalBytes: SHOT_DETECT_TOTAL_BYTES,
        downloaded,
        processedSec: 0,
        durationSec: 0,
      })

      worker.addEventListener(
        'message',
        (event: MessageEvent<ShotDetectResponse>) => {
          if (workerRef.current !== worker) return
          const message = event.data
          switch (message.type) {
            case 'probe':
              setState((previous) =>
                previous.status === 'running'
                  ? { ...previous, durationSec: message.durationSec }
                  : previous,
              )
              return
            case 'download':
              setState((previous) =>
                previous.status === 'running'
                  ? {
                      ...previous,
                      phase: 'download',
                      loadedBytes: message.loadedBytes,
                      totalBytes: message.totalBytes,
                    }
                  : previous,
              )
              return
            case 'analyze':
              setState((previous) =>
                previous.status === 'running'
                  ? {
                      ...previous,
                      phase: 'analyze',
                      processedSec: message.processedSec,
                      durationSec: message.durationSec,
                    }
                  : previous,
              )
              return
            case 'done':
              stopWorker()
              setState({
                status: 'done',
                predictions: message.predictions,
                timestamps: message.timestamps,
                durationSec: message.durationSec,
                downloaded,
              })
              return
            case 'error':
              stopWorker()
              setState((previous) => ({
                status: 'error',
                code: message.code,
                ...(message.durationSec === undefined
                  ? {}
                  : { durationSec: message.durationSec }),
                ...(message.code === 'network' &&
                previous.status === 'running' &&
                previous.phase === 'download'
                  ? { loadedBytes: previous.loadedBytes }
                  : {}),
              }))
              return
          }
        },
      )
      worker.addEventListener('error', () => {
        if (workerRef.current !== worker) return
        stopWorker()
        setState({ status: 'error', code: 'failed' })
      })

      const request: ShotDetectRequest = {
        type: 'start',
        videoUrl,
        modelUrl: urls.model,
        wasmUrl: urls.wasm,
      }
      worker.postMessage(request)
    },
    [stopWorker],
  )

  /** 打开拉片纸时调：模型下过就直接开切，没下过先停在「要下载」那一步。 */
  const prepare = useCallback(
    async (videoUrl: string) => {
      const urls = getShotDetectAssetUrls()
      if (!urls) {
        setState({ status: 'error', code: 'network' })
        return
      }
      setState({ status: 'checking' })
      const cached = await areShotDetectAssetsCached(urls)
      if (cached) run(videoUrl, false)
      else
        setState({
          status: 'needsDownload',
          totalBytes: SHOT_DETECT_TOTAL_BYTES,
        })
    },
    [run],
  )

  const cancel = useCallback(() => {
    stopWorker()
    setState(IDLE)
  }, [stopWorker])

  /** 「下载并开始切」/「重试」：不管缓存，从头跑一遍（缓存里有的照样直接读）。 */
  const start = useCallback((videoUrl: string) => run(videoUrl, true), [run])

  return { state, prepare, start, cancel }
}
