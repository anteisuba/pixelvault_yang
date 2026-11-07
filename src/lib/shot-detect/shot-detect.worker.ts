import { ALL_FORMATS, CanvasSink, Input, UrlSource } from 'mediabunny'
import * as ort from 'onnxruntime-web/wasm'

import {
  SHOT_DETECT_ASSET_BYTES,
  SHOT_DETECT_MAX_DURATION_SEC,
  SHOT_DETECT_MAX_FETCH_RETRIES,
  SHOT_DETECT_MODEL,
  SHOT_DETECT_SAMPLE_FPS,
} from '@/constants/shot-detect'

import { loadShotDetectAsset, SHOT_DETECT_TOTAL_BYTES } from './assets'
import type {
  ShotDetectErrorCode,
  ShotDetectRequest,
  ShotDetectResponse,
} from './protocol'
import {
  sampleTimestamps,
  ShotDetectWindower,
  stitchWindowPredictions,
} from './scenes'

/**
 * 切镜后台线程。放在 Worker 里的原因不只是「别卡主线程」：页面切到后台时主线程的
 * rAF 冻结、定时器被节流（见记忆「隐藏标签页冻结 rAF」），而 Worker 照常跑 ——
 * 用户切走等它切完是常态。
 *
 * 顺序：先探片子（时长 / 有没有视频轨 / 解不解得了）→ 再下模型 → 再按
 * `SHOT_DETECT_SAMPLE_FPS` 抽帧推理（不逐帧：时间全在推理上，见常量注释）。
 * 片子不合格就不白下 46 MB。
 */

const FRAME_BYTES =
  SHOT_DETECT_MODEL.frameWidth *
  SHOT_DETECT_MODEL.frameHeight *
  SHOT_DETECT_MODEL.channels

class ShotDetectFailure extends Error {
  constructor(
    readonly code: ShotDetectErrorCode,
    detail: string,
    readonly durationSec?: number,
  ) {
    super(detail)
  }
}

function post(message: ShotDetectResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}

function retryDelay(previousAttempts: number): number | null {
  return previousAttempts >= SHOT_DETECT_MAX_FETCH_RETRIES
    ? null
    : previousAttempts + 1
}

/** OffscreenCanvas 的 RGBA → 模型要的 RGB（0–255 原值）。 */
function readRgb(canvas: HTMLCanvasElement | OffscreenCanvas): Uint8Array {
  if (!(canvas instanceof OffscreenCanvas)) {
    throw new ShotDetectFailure('failed', 'expected OffscreenCanvas in worker')
  }
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new ShotDetectFailure('failed', 'no 2d context')
  const { data } = context.getImageData(
    0,
    0,
    SHOT_DETECT_MODEL.frameWidth,
    SHOT_DETECT_MODEL.frameHeight,
  )
  const rgb = new Uint8Array(FRAME_BYTES)
  for (let src = 0, dst = 0; dst < FRAME_BYTES; src += 4, dst += 3) {
    rgb[dst] = data[src] ?? 0
    rgb[dst + 1] = data[src + 1] ?? 0
    rgb[dst + 2] = data[src + 2] ?? 0
  }
  return rgb
}

async function loadSession(
  modelUrl: string,
  wasmUrl: string,
): Promise<ort.InferenceSession> {
  let modelLoaded = 0
  let wasmLoaded = 0
  const report = () =>
    post({
      type: 'download',
      loadedBytes: modelLoaded + wasmLoaded,
      totalBytes: SHOT_DETECT_TOTAL_BYTES,
    })

  let wasm: ArrayBuffer
  let model: ArrayBuffer
  try {
    ;[wasm, model] = await Promise.all([
      loadShotDetectAsset(wasmUrl, SHOT_DETECT_ASSET_BYTES.wasm, (bytes) => {
        wasmLoaded = bytes
        report()
      }),
      loadShotDetectAsset(modelUrl, SHOT_DETECT_ASSET_BYTES.model, (bytes) => {
        modelLoaded = bytes
        report()
      }),
    ])
  } catch (error) {
    throw new ShotDetectFailure('network', String(error))
  }

  // 站点没开 crossOriginIsolated → 没有 SharedArrayBuffer → 只能单线程。显式写死，
  // 免得 ort 去试着起线程池再回落。wasm 由我们自己下好喂进去，ort 不再自己 fetch。
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = wasm
  try {
    return await ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ['wasm'],
    })
  } catch (error) {
    throw new ShotDetectFailure('failed', `session: ${String(error)}`)
  }
}

async function runWindow(
  session: ort.InferenceSession,
  frames: Uint8Array[],
): Promise<Float32Array> {
  const input = new Float32Array(frames.length * FRAME_BYTES)
  frames.forEach((frame, index) => {
    const offset = index * FRAME_BYTES
    for (let i = 0; i < FRAME_BYTES; i += 1) input[offset + i] = frame[i] ?? 0
  })
  const tensor = new ort.Tensor('float32', input, [
    1,
    frames.length,
    SHOT_DETECT_MODEL.frameHeight,
    SHOT_DETECT_MODEL.frameWidth,
    SHOT_DETECT_MODEL.channels,
  ])
  const results = await session.run({ [SHOT_DETECT_MODEL.inputName]: tensor })
  const output = results[SHOT_DETECT_MODEL.singleFrameOutput]?.data
  if (!(output instanceof Float32Array)) {
    throw new ShotDetectFailure('failed', 'unexpected model output')
  }
  return output
}

async function detect(request: ShotDetectRequest): Promise<void> {
  const input = new Input({
    source: new UrlSource(request.videoUrl, { getRetryDelay: retryDelay }),
    formats: ALL_FORMATS,
  })
  try {
    const track = await input.getPrimaryVideoTrack().catch((error: unknown) => {
      throw new ShotDetectFailure('network', `open: ${String(error)}`)
    })
    if (!track) throw new ShotDetectFailure('noVideoTrack', 'no video track')
    if (!(await track.canDecode())) {
      throw new ShotDetectFailure('cannotDecode', `codec ${track.codec}`)
    }
    const firstSec = await track.getFirstTimestamp()
    const durationSec = await track.computeDuration()
    post({ type: 'probe', durationSec })
    if (durationSec > SHOT_DETECT_MAX_DURATION_SEC) {
      throw new ShotDetectFailure('tooLong', `${durationSec}s`, durationSec)
    }

    const session = await loadSession(request.modelUrl, request.wasmUrl)

    const sink = new CanvasSink(track, {
      width: SHOT_DETECT_MODEL.frameWidth,
      height: SHOT_DETECT_MODEL.frameHeight,
      fit: 'fill',
      poolSize: 2,
    })
    const windower = new ShotDetectWindower<Uint8Array>()
    const outputs: Float32Array[] = []
    const timestamps: number[] = []
    const sampleAt = sampleTimestamps(
      firstSec,
      durationSec,
      SHOT_DETECT_SAMPLE_FPS,
    )
    for await (const wrapped of sink.canvasesAtTimestamps(sampleAt)) {
      // 片子本身帧率低于抽帧率时，相邻两个时刻会落在同一帧上 —— 同一帧只喂一次。
      if (!wrapped || wrapped.timestamp === timestamps.at(-1)) continue
      timestamps.push(wrapped.timestamp)
      for (const window of windower.push(readRgb(wrapped.canvas))) {
        outputs.push(await runWindow(session, window))
        post({
          type: 'analyze',
          processedSec: Math.min(wrapped.timestamp, durationSec),
          durationSec,
        })
      }
    }
    for (const window of windower.finish()) {
      outputs.push(await runWindow(session, window))
    }
    await session.release().catch(() => undefined)

    const predictions = stitchWindowPredictions(outputs, windower.frameCount)
    const stamps = Float64Array.from(timestamps)
    post({ type: 'done', predictions, timestamps: stamps, durationSec }, [
      predictions.buffer,
      stamps.buffer,
    ])
  } finally {
    input.dispose()
  }
}

self.addEventListener('message', (event: MessageEvent<ShotDetectRequest>) => {
  if (event.data?.type !== 'start') return
  detect(event.data).catch((error: unknown) => {
    if (error instanceof ShotDetectFailure) {
      post({
        type: 'error',
        code: error.code,
        detail: error.message,
        durationSec: error.durationSec,
      })
      return
    }
    post({ type: 'error', code: 'failed', detail: String(error) })
  })
})
