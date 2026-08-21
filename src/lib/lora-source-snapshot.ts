import {
  LORA_CANDIDATE_SOURCE_IDS,
  LORA_CANDIDATE_UNRESOLVED_FAMILIES,
  LORA_METADATA_COMPLETENESS,
  LORA_METADATA_COMPLETENESS_THRESHOLDS,
} from '@/constants/lora-candidate'
import type {
  HuggingFaceLoraFile,
  HuggingFaceLoraSearchItem,
  LoraCandidateLicense,
  LoraSourceSnapshot,
} from '@/types'

/**
 * 来源快照的**唯一构造点**（策略 C，已拍板边界 7）。
 *
 * ── 为什么是 `lib/` 而不是留在候选服务里 ──────────────────────────
 * 导入 LoRA 有两条入口：助手推荐卡（`services/lora/lora-candidates.service.ts`，
 * 服务端）与库 modal 的「使用」按钮（`LoraLibraryModal`，客户端）。两条都要
 * 写同一个 `LoraAsset.sourceSnapshot`。构造逻辑留在 `server-only` 的服务里，
 * 客户端那条就只能自己抄一份 —— 而抄出来的第二份**必然漂**：作者是从 `repoId`
 * 前缀切的、许可要压成结构、完整度是六个信号数出来的，任何一处不一致，
 * 同一把 LoRA 从两个入口导入就会得到两份不同的出处记录。
 *
 * ⛔ 所以这里没有「HF 版」和「Civitai 版」两套形状，只有一个
 * `LoraSourceSnapshot`（`types/index.ts`）+ 一个按源填格子的函数。
 *
 * ⚠ 纯函数、零副作用、不碰 DB/网络 —— 服务端与浏览器都跑得动。
 */

type LoraMetadataCompleteness = LoraSourceSnapshot['metadataCompleteness']

/**
 * 上游说的家族是不是一个**真家族**。
 *
 * `'unknown'`（Civitai 缺 baseModel 时 `toLibraryItem` 写的）与 `'other'`
 * （HF 的 `inferBaseModelFamily` 推不出来时的落点）都不是家族名，是哨兵值。
 * 导入门槛判的就是它们 —— 家族定不出来，权重就不知道该挂到哪个底模上。
 */
export function resolveLoraFamily(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return (LORA_CANDIDATE_UNRESOLVED_FAMILIES as readonly string[]).includes(
    trimmed.toLowerCase(),
  )
    ? null
    : trimmed
}

export function dedupeLoraStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/**
 * 六个信号（作者 / 许可 / 家族 / 触发词 / 文件大小 / 样图）里有几个。
 * **如实分级，不是评分** —— 唯一用途是让卡面说得出「这条我们知道的不多」。
 */
export function gradeLoraMetadataCompleteness(signals: {
  author: string | null
  license: LoraCandidateLicense
  baseModelFamily: string | null
  triggerWords: readonly string[]
  fileSizeBytes: number | null
  sampleImageUrls: readonly string[]
}): LoraMetadataCompleteness {
  const present = [
    signals.author !== null,
    signals.license.known,
    signals.baseModelFamily !== null,
    signals.triggerWords.length > 0,
    signals.fileSizeBytes !== null,
    signals.sampleImageUrls.length > 0,
  ].filter(Boolean).length

  if (present >= LORA_METADATA_COMPLETENESS_THRESHOLDS.complete) {
    return LORA_METADATA_COMPLETENESS.complete
  }
  return present >= LORA_METADATA_COMPLETENESS_THRESHOLDS.partial
    ? LORA_METADATA_COMPLETENESS.partial
    : LORA_METADATA_COMPLETENESS.minimal
}

export function buildLoraSourceSnapshot(input: {
  source: LoraSourceSnapshot['source']
  author: string | null
  license: LoraCandidateLicense
  pageUrl: string | null
  revision: string | null
  fileSizeBytes: number | null
  metadataCompleteness: LoraMetadataCompleteness
  retrievedAt: string
}): LoraSourceSnapshot {
  return {
    source: input.source,
    author: input.author,
    license: input.license,
    pageUrl: input.pageUrl,
    revision: input.revision,
    retrievedAt: input.retrievedAt,
    fileSizeBytes: input.fileSizeBytes,
    metadataCompleteness: input.metadataCompleteness,
  }
}

/** HF 的许可：`cardData.license` 原样透传，其余三格该源没有这个概念。 */
export function huggingFaceLicense(
  item: Pick<HuggingFaceLoraSearchItem, 'license'>,
): LoraCandidateLicense {
  return {
    label: item.license,
    // HF 没有 Civitai 那套逐项权限声明 —— null 表示「这个源没有这个概念」，
    // 与「有这个概念但值不知道」不同。
    commercialUse: null,
    allowDerivatives: null,
    allowNoCredit: null,
    known: item.license !== null,
  }
}

/** 作者 = `repoId` 的命名空间段。没有 `/` 说明是官方无命名空间仓，取不到作者。 */
export function huggingFaceAuthor(repoId: string): string | null {
  const [namespace] = repoId.split('/')
  return repoId.includes('/') && namespace ? namespace : null
}

/**
 * HF 条目 → 来源快照。
 *
 * @param file **实际要导入的那个权重文件**，不是 `item.files[0]`：一个 HF 仓可含
 *   多把 `.safetensors`（不同底模族），文件大小与家族按选中的那把算。传错文件
 *   的表现是快照上的体积对不上真正下载的权重。
 * @param retrievedAt **抓取时刻**（列表回来的那一刻），不是导入时刻 —— 卡上写的
 *   作者/许可是那一刻上游说的，上游随后改了我们不知道。
 */
export function buildHuggingFaceSourceSnapshot(input: {
  item: HuggingFaceLoraSearchItem
  file: HuggingFaceLoraFile
  retrievedAt: string
}): LoraSourceSnapshot {
  const { item, file, retrievedAt } = input
  const author = huggingFaceAuthor(item.repoId)
  const license = huggingFaceLicense(item)
  const baseModelFamily = resolveLoraFamily(file.baseModelFamily)
  const triggerWords = dedupeLoraStrings(item.triggerWord.split(','))
  const sampleImageUrls = item.coverImageUrl ? [item.coverImageUrl] : []

  return buildLoraSourceSnapshot({
    source: LORA_CANDIDATE_SOURCE_IDS.huggingface,
    author,
    license,
    pageUrl: item.modelPageUrl,
    // ⭐ HF 的 commit sha —— 「同一个仓库不同时间下到的不是同一份权重」。
    // 这是策略 C 点名要的字段，也是 HF 行此前全空的那一格。
    revision: item.revision,
    fileSizeBytes: file.sizeBytes,
    metadataCompleteness: gradeLoraMetadataCompleteness({
      author,
      license,
      baseModelFamily,
      triggerWords,
      fileSizeBytes: file.sizeBytes,
      sampleImageUrls,
    }),
    retrievedAt,
  })
}
