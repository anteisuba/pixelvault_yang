/**
 * 九宫格分镜：套模板、找格缝、切成九格（node-canvas-v2 §3「九宫格分镜」）。
 *
 * 纯函数（`wrapStoryboardGridPrompt` / `detectGridCells` / `equalGridCells`）
 * 与浏览器 I/O（`splitImageIntoCells`）分开：前者直接单测，后者只负责读图、画图、导出。
 */

import {
  STORYBOARD_CELL_MIME,
  STORYBOARD_CELL_QUALITY,
  STORYBOARD_GRID_DETECT,
  STORYBOARD_GRID_PROMPT_TEMPLATE,
  type StoryboardGridSize,
} from '@/constants/storyboard-grid'

export interface GridCellRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** 你写的那一句接上分镜模板。空句不包（没东西可讲，交给调用方拦）。 */
export function wrapStoryboardGridPrompt(story: string): string {
  const trimmed = story.trim()
  if (!trimmed) return story
  return STORYBOARD_GRID_PROMPT_TEMPLATE.replace('{story}', trimmed)
}

interface Run {
  readonly start: number
  /** 含 */
  readonly end: number
}

/** 一维上「纯色、足够亮或足够暗」的连续段。 */
function uniformRuns(
  count: number,
  sample: (index: number) => { mean: number; std: number },
): Run[] {
  const runs: Run[] = []
  let start = -1
  for (let i = 0; i < count; i += 1) {
    const { mean, std } = sample(i)
    const flat =
      std <= STORYBOARD_GRID_DETECT.maxStdDev &&
      (mean >= STORYBOARD_GRID_DETECT.lightMin ||
        mean <= STORYBOARD_GRID_DETECT.darkMax)
    if (flat && start < 0) start = i
    if (!flat && start >= 0) {
      runs.push({ start, end: i - 1 })
      start = -1
    }
  }
  if (start >= 0) runs.push({ start, end: count - 1 })
  return runs
}

/**
 * 在一维上切出 `size` 段：先剥掉贴着两头的纯色边，再在每条理论等分线附近找一段缝。
 * 找不齐 → `null`（认不出来就不切）。返回每段的 [起, 止)。
 */
function splitAxis(
  count: number,
  size: number,
  sample: (index: number) => { mean: number; std: number },
): Array<[number, number]> | null {
  const runs = uniformRuns(count, sample)
  let lo = 0
  let hi = count
  const head = runs.find((run) => run.start === 0)
  if (head) lo = head.end + 1
  const tail = runs.find((run) => run.end === count - 1)
  if (tail) hi = tail.start
  const extent = hi - lo
  if (extent <= size * 4) return null

  const inner = runs.filter((run) => run.start > lo && run.end < hi - 1)
  const cuts: Run[] = []
  for (let k = 1; k < size; k += 1) {
    const ideal = lo + (extent * k) / size
    const window = extent * STORYBOARD_GRID_DETECT.tolerance
    let best: Run | null = null
    let bestDistance = Infinity
    for (const run of inner) {
      const center = (run.start + run.end) / 2
      const distance = Math.abs(center - ideal)
      if (distance <= window && distance < bestDistance) {
        best = run
        bestDistance = distance
      }
    }
    if (!best) return null
    cuts.push(best)
  }

  const segments: Array<[number, number]> = []
  let from = lo
  for (const cut of cuts) {
    segments.push([from, cut.start])
    from = cut.end + 1
  }
  segments.push([from, hi])
  const lengths = segments.map(([a, b]) => b - a)
  const shortest = Math.min(...lengths)
  const longest = Math.max(...lengths)
  if (
    shortest <= 0 ||
    shortest / longest < STORYBOARD_GRID_DETECT.minCellRatio
  ) {
    return null
  }
  return segments
}

/**
 * 在一张亮度图上认格子。`luma` 是按行排的 0–255 亮度，长 `width * height`。
 * 认出来 → `size × size` 个格子（行优先，从左上到右下）；认不出 → `null`。
 */
export function detectGridCells(
  luma: ArrayLike<number>,
  width: number,
  height: number,
  size: StoryboardGridSize,
): GridCellRect[] | null {
  const column = (x: number) => stats(height, (y) => luma[y * width + x]!)
  const row = (y: number) => stats(width, (x) => luma[y * width + x]!)
  const xs = splitAxis(width, size, column)
  const ys = splitAxis(height, size, row)
  if (!xs || !ys) return null
  const cells: GridCellRect[] = []
  for (const [y0, y1] of ys) {
    for (const [x0, x1] of xs) {
      cells.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
    }
  }
  return cells
}

function stats(
  count: number,
  read: (index: number) => number,
): { mean: number; std: number } {
  let sum = 0
  let squares = 0
  for (let i = 0; i < count; i += 1) {
    const value = read(i)
    sum += value
    squares += value * value
  }
  const mean = sum / count
  return { mean, std: Math.sqrt(Math.max(squares / count - mean * mean, 0)) }
}

/** 不找缝、直接等分（手动切且认不出缝时用）。 */
export function equalGridCells(
  width: number,
  height: number,
  size: StoryboardGridSize,
): GridCellRect[] {
  const cells: GridCellRect[] = []
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const x0 = Math.round((width * c) / size)
      const x1 = Math.round((width * (c + 1)) / size)
      const y0 = Math.round((height * r) / size)
      const y1 = Math.round((height * (r + 1)) / size)
      cells.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
    }
  }
  return cells
}

/** 把分析图上的格子放大回原图尺度（向内取整，⛔ 把缝的一像素带进来）。 */
export function scaleCells(
  cells: readonly GridCellRect[],
  scale: number,
): GridCellRect[] {
  return cells.map((cell) => {
    const x0 = Math.ceil(cell.x * scale)
    const y0 = Math.ceil(cell.y * scale)
    const x1 = Math.floor((cell.x + cell.width) * scale)
    const y1 = Math.floor((cell.y + cell.height) * scale)
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  })
}

export interface SplitCell {
  readonly file: File
  readonly width: number
  readonly height: number
}

export type SplitImageResult =
  | {
      readonly ok: true
      readonly cells: SplitCell[]
      readonly detected: boolean
    }
  | { readonly ok: false; readonly reason: 'notDetected' | 'unreadable' }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // ⚠ 跨域读像素必须带匿名 CORS，不然画布被污染、导不出来（R2 白名单见
    //   lib/video-frame-capture.ts 的说明）。
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      STORYBOARD_CELL_MIME,
      STORYBOARD_CELL_QUALITY,
    )
  })
}

/**
 * 读图 → 认格子 → 逐格导出 JPEG。
 * `mode: 'detect'` 认不出就返回 `notDetected`（生成后自动切）；
 * `mode: 'detectOrEqual'` 认不出就等分（你在 ⋯ 里手动切）。
 */
export async function splitImageIntoCells(
  url: string,
  size: StoryboardGridSize,
  options: {
    readonly mode: 'detect' | 'detectOrEqual'
    readonly baseName: string
  },
): Promise<SplitImageResult> {
  let image: HTMLImageElement
  try {
    image = await loadImage(url)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width < size * 8 || height < size * 8)
    return { ok: false, reason: 'unreadable' }

  const analysisWidth = Math.min(width, STORYBOARD_GRID_DETECT.analysisWidth)
  const scale = width / analysisWidth
  const analysisHeight = Math.max(1, Math.round(height / scale))
  const probe = document.createElement('canvas')
  probe.width = analysisWidth
  probe.height = analysisHeight
  const probeContext = probe.getContext('2d', { willReadFrequently: true })
  if (!probeContext) return { ok: false, reason: 'unreadable' }
  probeContext.drawImage(image, 0, 0, analysisWidth, analysisHeight)
  let pixels: ImageData
  try {
    pixels = probeContext.getImageData(0, 0, analysisWidth, analysisHeight)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const luma = new Uint8ClampedArray(analysisWidth * analysisHeight)
  for (let i = 0; i < luma.length; i += 1) {
    const r = pixels.data[i * 4]!
    const g = pixels.data[i * 4 + 1]!
    const b = pixels.data[i * 4 + 2]!
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const found = detectGridCells(luma, analysisWidth, analysisHeight, size)
  let rects: GridCellRect[]
  if (found) {
    rects = scaleCells(found, width / analysisWidth)
  } else if (options.mode === 'detectOrEqual') {
    rects = equalGridCells(width, height, size)
  } else {
    return { ok: false, reason: 'notDetected' }
  }

  const cells: SplitCell[] = []
  for (const [index, rect] of rects.entries()) {
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const context = canvas.getContext('2d')
    if (!context) return { ok: false, reason: 'unreadable' }
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    )
    let blob: Blob
    try {
      blob = await canvasToBlob(canvas)
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
    cells.push({
      file: new File([blob], `${options.baseName}-${index + 1}.jpg`, {
        type: STORYBOARD_CELL_MIME,
      }),
      width: rect.width,
      height: rect.height,
    })
  }
  return { ok: true, cells, detected: Boolean(found) }
}
