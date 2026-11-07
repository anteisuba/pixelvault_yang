/**
 * 拉片 · 切镜（p-canvas-nodes H4a）—— 在用户浏览器里跑 TransNetV2，把一段参考片
 * 切成一镜一镜。**不走服务器、不扣点**（画布规则 #7：只有 `generate` 扣 credit）。
 *
 * 模型：TransNetV2 的 ONNX 导出（MIT，huggingface.co/elya5/transnetv2），
 * 推理：onnxruntime-web 的单线程 wasm（站点没开 crossOriginIsolated，开不了多线程），
 * 解帧：mediabunny（WebCodecs，按 Range 边下边解，不用整片下载）。
 *
 * 模型与 wasm 镜像在我们自己的 R2（owner 2026-11-07「镜像到我们的 R2」）：文件名带
 * 内容哈希 / 版本号 = 永不覆盖，可以 immutable 长缓存；浏览器侧再放进 Cache Storage，
 * 第一次下完之后再拉片不再下载。
 *
 * ⚠ 换 onnxruntime-web 版本 = 换 wasm：先把新 wasm 传到新的 `ort-<版本>/` 路径再改这里，
 * JS 胶水与 wasm 必须同版本，错配是运行时才炸的。`package.json` 里 onnxruntime-web
 * 钉的是精确版本，就是为了这条。
 */

/** R2 上的对象键（拼在 `NEXT_PUBLIC_STORAGE_BASE_URL` 后面）。 */
export const SHOT_DETECT_ASSET_KEYS = {
  model: 'static/shot-detect/transnetv2-c4d54a68.onnx',
  wasm: 'static/shot-detect/ort-1.31.1/ort-wasm-simd-threaded.wasm',
} as const

/** 两个文件的字节数 —— 第一次下载提示里的「N MB」、进度条的分母都用它。 */
export const SHOT_DETECT_ASSET_BYTES = {
  model: 31_250_929,
  wasm: 14_848_852,
} as const

/** Cache Storage 的桶名。换模型 / wasm 时跟着换名，旧桶在下次命中前删掉。 */
export const SHOT_DETECT_CACHE_NAME = 'antei-shot-detect-v1'

/**
 * TransNetV2 的输入契约（上游 `predict_frames`，见 github.com/soCzech/TransNetV2）：
 * 每帧缩成 48×27 RGB（0–255 原值，不归一化），100 帧一窗、步长 50，每窗只取中间
 * 50 帧的预测（前后各 25 帧是上下文）。
 */
export const SHOT_DETECT_MODEL = {
  frameWidth: 48,
  frameHeight: 27,
  channels: 3,
  windowFrames: 100,
  stepFrames: 50,
  contextFrames: 25,
  inputName: 'input',
  /** 单帧「这一帧是切点」概率（已过 sigmoid）。另一个输出是渐变转场，H4a 不用。 */
  singleFrameOutput: '534',
} as const

/**
 * 切镜粗细 = 概率阈值。只换阈值、不重跑模型 —— 一次推理三档的镜数全能当场数出来。
 * 正常档 0.5 是上游默认值；细 / 粗两档是 2026-11-07 在 5 段样片首尾相接上量过：
 * 三档都切准了那 4 刀，差别只在闪光、快速摇镜这类边缘帧。
 */
export const SHOT_DETECT_GRAINS = ['fine', 'normal', 'coarse'] as const

export type ShotDetectGrain = (typeof SHOT_DETECT_GRAINS)[number]

export const SHOT_DETECT_THRESHOLDS: Record<ShotDetectGrain, number> = {
  fine: 0.3,
  normal: 0.5,
  coarse: 0.7,
}

export const SHOT_DETECT_DEFAULT_GRAIN: ShotDetectGrain = 'normal'

/**
 * 抽帧率（帧/秒）：不逐帧喂模型，按这个频率抽。时间几乎全花在推理上（解码可忽略），
 * 喂的帧数减半时间就减半（owner 2026-11-07 定 12）。
 * 实测（2026-11-07，5 段拼接样片，同一台机器）：逐帧 24fps 49.7 秒；12fps 23.4 秒、
 * 4 刀全中、切点与逐帧版差 ≤ 0.08 秒；8fps 17.9 秒也全中，但切点置信度开始掉（0.89）。
 * 片子本身帧率低于它时就等于逐帧（同一帧不重复喂）。⚠ 叠化这类慢转场还没测过。
 */
export const SHOT_DETECT_SAMPLE_FPS = 12

/**
 * 能拉片的最长参考片（秒）。更长的先用现有的「剪一段」剪短。
 * ⚠ 实测（2026-11-07，16 核台式机，单线程 wasm）：一窗 100 帧约 5–6 秒、每窗前进 50 帧。
 * 按上面每秒 12 帧抽，约 1 倍速上下 —— 5 分钟的片要 5–6 分钟（逐帧时是 12 分钟上下）。
 */
export const SHOT_DETECT_MAX_DURATION_SEC = 300

/** 下载模型 / 片子的单次请求失败后最多重试几次（mediabunny 默认永不放弃）。 */
export const SHOT_DETECT_MAX_FETCH_RETRIES = 3
