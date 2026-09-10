/**
 * 产出版本表的**纯读写**（S3b，spec §1.8「版本 = 卡下一排小点」）。
 *
 * ── 它补的是哪个洞 ──────────────────────────────────────────────────────
 * 在这之前一个 image / audio / video 节点身上只有**一个** `url`：重新生成一次就把
 * 上一版原地覆盖，切回去的路一条也没有。`slots[].versions` 不是它的替代 ——
 * 那是**入口槽**的版本（「这个槽当前用哪条边」），产出没有边可派生。
 *
 * ── 一条写入纪律 ────────────────────────────────────────────────────────
 * 顶层 `url` / `generationId` / 尺寸这些字段从此是 `outputs.versions[cur]` 的
 * **派生镜像**，并且只由本模块的 `selectOutputVersion` 一处写。⛔ 别在别处
 * 再写一次 `data.url` —— 全仓十几个读 `data.url` 的地方（载荷装配、迁移、缩略图、
 * 下载）之所以不用改，正是因为镜像一直是对的。
 *
 * ⛔ 纯函数：不读时钟（`now` 注入）、不铸 id（`mintId` 注入）。
 */

import { NODE_V4_OUTPUT_VERSION } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type {
  NodeV4Data,
  NodeV4TextData,
  NodeV4OutputVersion,
  NodeV4Outputs,
} from '@/types/node-workflow'

/** 有产物的那三类（文本节点没有产出版本可言）。 */
export type NodeV4MediaData = Exclude<NodeV4Data, NodeV4TextData>

export function isMediaNodeData(data: NodeV4Data): data is NodeV4MediaData {
  return data.kind !== NODE_MEDIA_KIND_IDS.text
}

/**
 * 一次媒体回填带进来的东西（`NodeV4MediaPatch` 的结构子集）。
 * ⚠ 有意**不 import** 组件层的 `NodeV4MediaPatch`：那会让纯函数依赖 UI 层，而两者
 * 的字段本来就同源于 `NodeV4MediaMetaShape`，结构相容就够。
 */
export interface OutputVersionInput {
  readonly url?: string | undefined
  readonly generationId?: string | undefined
  readonly mediaJobId?: string | undefined
  readonly videoThumbnailUrl?: string | undefined
  readonly sizeBytes?: number | undefined
  readonly mediaWidth?: number | undefined
  readonly mediaHeight?: number | undefined
  readonly imageSource?: 'generated' | 'existing' | undefined
  readonly prompt?: string | undefined
  readonly model?: NodeV4OutputVersion['model']
}

function factsOf(input: OutputVersionInput): NodeV4OutputVersion['meta'] {
  const meta = {
    ...(input.videoThumbnailUrl
      ? { videoThumbnailUrl: input.videoThumbnailUrl }
      : {}),
    ...(input.sizeBytes === undefined ? {} : { sizeBytes: input.sizeBytes }),
    ...(input.mediaWidth === undefined ? {} : { mediaWidth: input.mediaWidth }),
    ...(input.mediaHeight === undefined
      ? {}
      : { mediaHeight: input.mediaHeight }),
    ...(input.imageSource ? { imageSource: input.imageSource } : {}),
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}

/**
 * 这张卡有几版。
 *
 * ⚠ 没有 `outputs` 而有 `url` 的（存量项目、迁移前的快照）**读出来是一版** ——
 * 版本点因此不必等回填就有得显示。⛔ 不在读侧顺手把它写回去：读函数写数据是
 * 最难查的一类 bug。
 */
export function readOutputVersions(
  data: NodeV4Data,
): readonly NodeV4OutputVersion[] {
  if (!isMediaNodeData(data)) return []
  const versions = data.outputs?.versions
  if (versions && versions.length > 0) return versions
  if (!data.url) return []
  return [
    {
      id: `${NODE_V4_OUTPUT_VERSION.idPrefix}legacy`,
      url: data.url,
      createdAt: data.createdAt,
      ...(data.generationId ? { generationId: data.generationId } : {}),
      ...(data.prompt ? { prompt: data.prompt } : {}),
      ...(data.model ? { model: data.model } : {}),
    },
  ]
}

/** 当前版下标，**钳在有效区间内**：越界的 `cur` 显示成最后一版而不是空卡。 */
export function readOutputIndex(data: NodeV4Data): number {
  const versions = readOutputVersions(data)
  if (versions.length === 0) return 0
  const cur = data && isMediaNodeData(data) ? (data.outputs?.cur ?? 0) : 0
  return Math.min(Math.max(cur, 0), versions.length - 1)
}

/** 当前版的地址。⚠ 这是**唯一**该问「这张卡现在显示的是哪个 url」的地方。 */
export function readOutputUrl(data: NodeV4Data): string | undefined {
  return readOutputVersions(data)[readOutputIndex(data)]?.url
}

/** 把某一版镜像到顶层字段（`url` / 尺寸 / 封面 / generationId）。 */
function mirrorVersion<T extends NodeV4MediaData>(
  data: T,
  version: NodeV4OutputVersion,
): T {
  const next = { ...data } as NodeV4MediaData
  next.url = version.url
  if (version.generationId) next.generationId = version.generationId
  else delete next.generationId
  // 尺寸 / 体积 / 封面 / 角标：这一版没记的就**清掉**，⛔ 不留上一版的数 ——
  // 一张竖图切回横图那一版时，卡宽会按上一版的尺寸算错。
  delete next.videoThumbnailUrl
  delete next.sizeBytes
  delete next.mediaWidth
  delete next.mediaHeight
  delete next.imageSource
  Object.assign(next, version.meta ?? {})
  return next as T
}

/**
 * 切到第 `index` 版。越界返回 `null`（调用方按失败处理，⛔ 不静默钳到最后一版：
 * 那会让「点了第 5 个小点」看起来成功而实际停在第 3 版）。
 */
export function selectOutputVersion<T extends NodeV4MediaData>(
  data: T,
  index: number,
): T | null {
  const versions = readOutputVersions(data)
  const version = versions[index]
  if (!version) return null
  return {
    ...mirrorVersion(data, version),
    outputs: { versions: [...versions], cur: index },
  }
}

/**
 * 追加一版并切过去（生成完成 / 上传落地都走这条）。
 *
 * ⚠ **按 url 去重**：前台那条 `.then` 与刷新之后的回填 pass 读的是同一单，两条路
 * 都会带着同一个 url 调进来。去重之后第二次只是「切到那一版」，⛔ 不追加一颗
 * 一模一样的小点。
 *
 * ⚠ 满 64 版时**丢最旧的一版**：版本表落在项目 state 里，无界增长的下场是整份
 * state 落不了库（长度上限那条注释说的正是这件事）。
 */
export function appendOutputVersion<T extends NodeV4MediaData>(
  data: T,
  input: OutputVersionInput,
  options: { readonly now: string; mintId(): string },
): T {
  const url = input.url?.trim()
  if (!url) return data

  const existing = readOutputVersions(data)
  const hit = existing.findIndex((version) => version.url === url)
  if (hit >= 0) return selectOutputVersion(data, hit) ?? data

  const version: NodeV4OutputVersion = {
    id: options.mintId(),
    url,
    createdAt: options.now,
    ...(input.generationId ? { generationId: input.generationId } : {}),
    ...(input.mediaJobId ? { mediaJobId: input.mediaJobId } : {}),
    ...(factsOf(input) ? { meta: factsOf(input) } : {}),
    ...((input.prompt ?? data.prompt)
      ? { prompt: input.prompt ?? data.prompt }
      : {}),
    ...((input.model ?? data.model)
      ? { model: input.model ?? data.model }
      : {}),
  }
  const versions = [...existing, version].slice(
    -NODE_V4_OUTPUT_VERSION.maxVersions,
  )
  return {
    ...mirrorVersion(data, version),
    outputs: { versions, cur: versions.length - 1 },
  }
}

/**
 * 存量的单 `url` → `versions[0]`（迁移 / 升级用）。已经有版本表的原样返回。
 * 没有 url 的返回 `undefined` —— ⛔ 不给空卡造一张空版本表。
 */
export function buildOutputsFromLegacy(
  data: Pick<
    NodeV4MediaData,
    'url' | 'createdAt' | 'generationId' | 'prompt' | 'model' | 'outputs'
  >,
): NodeV4Outputs | undefined {
  if (data.outputs?.versions.length) return data.outputs
  if (!data.url) return undefined
  return {
    versions: [
      {
        id: `${NODE_V4_OUTPUT_VERSION.idPrefix}0`,
        url: data.url,
        createdAt: data.createdAt,
        ...(data.generationId ? { generationId: data.generationId } : {}),
        ...(data.prompt ? { prompt: data.prompt } : {}),
        ...(data.model ? { model: data.model } : {}),
      },
    ],
    cur: 0,
  }
}

/**
 * 一次媒体回填（上传落地 / 生成终态 / 只清 job id）→ 新 data。
 *
 * ⭐ **这是产出版本表唯一的写入点**：`setMedia` 是全仓所有回填的必经之路
 * （上传三条路 + 生成 reconcile 都在这里汇合），所以版本表只在这里长出来。
 * ⛔ 别在生成钩子里再追加一次 —— 前台那条 `.then` 与刷新后的 reconcile pass
 * 读的是同一单，两处各写一次就是两颗一模一样的小点。
 *
 * 三种补丁分别怎么走：
 *   · 带 `url` → 追加一版并切过去（同 url 去重）。
 *   · 不带 `url` 但带尺寸 / 封面 → **补进当前版的 meta**。⚠ 视频封面与图片尺寸
 *     常常晚一拍才量出来；不补的话切回这一版会把它们清掉。
 *   · 只清 `mediaJobId` / 报失败 → 版本表一个字不动。
 */
export function applyMediaPatchOutputs<T extends NodeV4MediaData>(
  data: T,
  patch: OutputVersionInput,
  options: { readonly now: string; mintId(): string },
): T {
  // ⚠ 补丁里**产物那一半先摘出去**（url / 尺寸 / 封面 / 角标 / generationId），
  // 剩下的（今天只有 `mediaJobId`）才直接摊进 data。⛔ 不能先整份摊平再追加：
  // 摊平之后 `data.url` 已经是新的那一版，去重会把它当成「这一版早就有了」，
  // 于是走切换分支 —— 而切换会把这一版还没记进 meta 的尺寸全清掉。
  if (patch.url?.trim()) {
    // ⚠ 摊平时**不带 url**：带上的话去重会把它当成「这一版早就有了」而走切换
    // 分支，而切换会把这一版还没记进 meta 的尺寸全清掉。url 由
    // `appendOutputVersion` 从新版本镜像回来。
    const rest = { ...patch }
    delete (rest as { url?: string }).url
    return appendOutputVersion({ ...data, ...rest } as T, patch, options)
  }

  const merged = { ...data, ...patch } as T
  const facts = factsOf(patch)
  if (!facts) return merged

  const versions = readOutputVersions(merged)
  const index = readOutputIndex(merged)
  const current = versions[index]
  if (!current) return merged
  const next = [...versions]
  next[index] = { ...current, meta: { ...current.meta, ...facts } }
  return { ...merged, outputs: { versions: next, cur: index } }
}
