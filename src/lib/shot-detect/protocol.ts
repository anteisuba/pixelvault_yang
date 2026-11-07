/**
 * 主线程 ↔ 切镜后台线程（`shot-detect.worker.ts`）之间的消息。
 *
 * 取消 = 主线程直接 `worker.terminate()`，不设取消消息：推理和解码都在 await 里，
 * 发消息要等当前这一窗跑完才收得到，terminate 是立刻停。
 */

export interface ShotDetectStartMessage {
  type: 'start'
  videoUrl: string
  modelUrl: string
  wasmUrl: string
}

export type ShotDetectRequest = ShotDetectStartMessage

/** 失败原因 —— 每个都对应界面上一句人话（`StudioNode.shotTable.pull.errors.*`）。 */
export const SHOT_DETECT_ERROR_CODES = [
  /** 片子超过 `SHOT_DETECT_MAX_DURATION_SEC`。 */
  'tooLong',
  /** 文件里没有视频轨。 */
  'noVideoTrack',
  /** 浏览器解不了这个编码（WebCodecs 不支持）。 */
  'cannotDecode',
  /** 模型 / wasm / 片子下载失败。 */
  'network',
  /** 其余（模型推理出错等）。 */
  'failed',
] as const

export type ShotDetectErrorCode = (typeof SHOT_DETECT_ERROR_CODES)[number]

export type ShotDetectResponse =
  | {
      type: 'probe'
      durationSec: number
    }
  | {
      type: 'download'
      loadedBytes: number
      totalBytes: number
    }
  | {
      type: 'analyze'
      processedSec: number
      durationSec: number
    }
  | {
      type: 'done'
      /** 逐帧「这一帧是切点」的概率。 */
      predictions: Float32Array
      /** 逐帧的显示时间戳（秒），与 predictions 等长。 */
      timestamps: Float64Array
      durationSec: number
    }
  | {
      type: 'error'
      code: ShotDetectErrorCode
      /** 开发排查用，不上界面。 */
      detail: string
      /** tooLong 时带上片长，界面要说「这段 7:12，超过 5 分钟」。 */
      durationSec?: number
    }
