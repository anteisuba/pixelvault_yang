import 'server-only'

/**
 * LoRA 推荐候选的检索与归一（切片 3「一次确认链」，任务包 §B）。
 *
 * ── 这一层存在的唯一理由 ───────────────────────────────────────────
 * ⭐ **模型绝不自己写 LoRA 的 id / URL / 任何元数据。** 它只能从这里返回的候选里
 * 挑，并说出为什么。卡上显示的每一条事实都来自这个函数的返回值。
 *
 * ── 三条设计规矩 ───────────────────────────────────────────────────
 * 1. **不知道就写 null，不猜、不省略。** 省略等于让用户以为「没有限制」——
 *    许可字段上这一条尤其致命（策略 C：不阻断，但必须如实展示）。
 * 2. **单源失败不拖垮另一源。** 形态照抄 `services/research/connector-runtime.ts`
 *    的 `runConnector`：重试 + 熔断 + 兜底翻成回执，**永不向上抛**。
 * 3. **导入门槛写在数据上，不写在 UI 上。** `importable:false` 的候选照样返回、
 *    照样展示，只是带一个原因码 —— 「只推荐不导入」是产品行为，不是错误。
 *
 * ⚠ **搜索来的 Civitai 候选没有文件大小。** 2026-08-21 实测：meilisearch 的版本
 * 对象根本没有 `files` 字段。这不是接漏了，是上游就没有 —— 卡上那一栏对搜索来的
 * 条目就是「未知」，⛔ 别为了填满它给每条候选补一次 REST 详情请求（6 条候选 =
 * 6 次外部往返，挂在用户等待的那条路上）。
 */

import {
  LORA_CANDIDATE_BREAKER_OPTIONS,
  LORA_CANDIDATE_BREAKER_PREFIX,
  LORA_CANDIDATE_LIMITS,
  LORA_CANDIDATE_NOT_IMPORTABLE_REASONS,
  LORA_CANDIDATE_SOURCE_IDS,
  LORA_CANDIDATE_SOURCE_STATUSES,
  LORA_CANDIDATE_UNRESOLVED_FAMILIES,
  LORA_METADATA_COMPLETENESS,
  LORA_METADATA_COMPLETENESS_THRESHOLDS,
} from '@/constants/lora-candidate'
import { normalizeToLoraBaseFamily } from '@/constants/lora-base-models'
import { CircuitOpenError, getCircuitBreaker } from '@/lib/circuit-breaker'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import {
  listCivitaiLoras,
  normalizeLoraNameKey,
} from '@/services/civitai-lora.service'
import { searchHuggingFaceLoras } from '@/services/huggingface-lora.service'
import {
  HuggingFaceLoraSearchQuerySchema,
  type CivitaiLoraLibraryItem,
  type HuggingFaceLoraSearchItem,
  type LoraCandidateLicense,
  type LoraSourceSnapshot,
} from '@/types'
import type {
  LoraCandidate,
  LoraCandidateImportPayload,
  LoraCandidateSearchResult,
  LoraCandidateSourceReceipt,
} from '@/types/lora-candidate'

type LoraCandidateSource = LoraCandidate['source']

export interface SearchLoraCandidatesInput {
  /** 内部 `User.id`（不是 clerkId）—— 用来比对「他库里已经有了」。 */
  userId: string
  query: string
  /**
   * 工作台当前底模家族。**软偏好，不是过滤**：匹配的候选排前面，不匹配的照样
   * 返回（卡上写着家族，用户自己判断）。硬过滤会把「你该换个底模」这种真实建议
   * 提前掐掉，而那正是助手该说的话。
   */
  baseModelFamily?: string
  limit?: number
  /** 工作台挂载栈上的 LoRA 名字 —— 用来标「你已经挂着这一把了」。 */
  mountedNames?: readonly string[]
}

// ─── 单源跑法（照 connector-runtime 的形态） ─────────────────────────

interface SourceOutcome {
  items: LoraCandidate[]
  receipt: LoraCandidateSourceReceipt
}

/**
 * 单源预算闸。
 *
 * ⚠ **两个上游各自的超时加起来管不住这一轮**：HF 那条路是「每次请求 15s ×
 * 最多 N 次游标扫描」，最坏能自己吃掉整轮的 `maxDuration`，表现是「助手转圈
 * 然后 504」—— 这条路上已经有过一次同形状的事故（检索与元数据必须并行的那条
 * 注释）。所以这里再压一道**整源**预算。
 *
 * 超时不中断底层请求（拿不到它的 AbortSignal），只是把结果丢掉 —— 代价是一次
 * 白花的请求，换的是这一轮准时回话。推荐卡缺一源，好过整轮 504。
 */
async function withSourceBudget<T>(
  source: LoraCandidateSource,
  fn: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${source} exceeded the ${LORA_CANDIDATE_LIMITS.sourceTimeoutMs}ms candidate budget`,
              ),
            ),
          LORA_CANDIDATE_LIMITS.sourceTimeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 跑一个源，**任何情况下都不抛**。空结果与失败是两件事，回执里分开表达 ——
 * 卡面要能说出「Civitai 没搜到」和「Civitai 挂了」的区别。
 */
async function runCandidateSource(
  source: LoraCandidateSource,
  fn: () => Promise<LoraCandidate[]>,
): Promise<SourceOutcome> {
  const startedAt = Date.now()
  const breaker = getCircuitBreaker(
    `${LORA_CANDIDATE_BREAKER_PREFIX}:${source}`,
    LORA_CANDIDATE_BREAKER_OPTIONS,
  )
  try {
    const items = await breaker.call(() =>
      withRetry(() => withSourceBudget(source, fn), {
        maxAttempts: LORA_CANDIDATE_LIMITS.maxAttempts,
        label: `lora-candidates.${source}`,
      }),
    )
    return {
      items,
      receipt: {
        source,
        status: items.length
          ? LORA_CANDIDATE_SOURCE_STATUSES.ok
          : LORA_CANDIDATE_SOURCE_STATUSES.empty,
        count: items.length,
        tookMs: Date.now() - startedAt,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('LoRA candidate source failed', { source, error: message })
    return {
      items: [],
      receipt: {
        source,
        status:
          error instanceof CircuitOpenError
            ? LORA_CANDIDATE_SOURCE_STATUSES.circuitOpen
            : LORA_CANDIDATE_SOURCE_STATUSES.failed,
        count: 0,
        tookMs: Date.now() - startedAt,
        error: message.slice(0, 400),
      },
    }
  }
}

// ─── 归一 helpers ───────────────────────────────────────────────────

function clampName(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > LORA_CANDIDATE_LIMITS.nameMaxLength
    ? trimmed.slice(0, LORA_CANDIDATE_LIMITS.nameMaxLength)
    : trimmed
}

/**
 * 上游说的家族是不是一个**真家族**。
 *
 * `'unknown'`（Civitai 缺 baseModel 时 `toLibraryItem` 写的）与 `'other'`
 * （HF 的 `inferBaseModelFamily` 推不出来时的落点）都不是家族名，是哨兵值。
 * 导入门槛判的就是它们 —— 家族定不出来，权重就不知道该挂到哪个底模上。
 */
function resolveFamily(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return (LORA_CANDIDATE_UNRESOLVED_FAMILIES as readonly string[]).includes(
    trimmed.toLowerCase(),
  )
    ? null
    : trimmed
}

function dedupeStrings(values: readonly string[]): string[] {
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
function gradeCompleteness(signals: {
  author: string | null
  license: LoraCandidateLicense
  baseModelFamily: string | null
  triggerWords: readonly string[]
  fileSizeBytes: number | null
  sampleImageUrls: readonly string[]
}): LoraCandidate['metadataCompleteness'] {
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

function buildSnapshot(input: {
  source: LoraCandidateSource
  author: string | null
  license: LoraCandidateLicense
  pageUrl: string
  revision: string | null
  fileSizeBytes: number | null
  metadataCompleteness: LoraCandidate['metadataCompleteness']
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

// ─── Civitai → LoraCandidate ────────────────────────────────────────

function civitaiToCandidate(
  item: CivitaiLoraLibraryItem,
  retrievedAt: string,
): LoraCandidate {
  const author = item.creatorName?.trim() || null
  /**
   * ⚠ **Civitai 没有许可字段**，只有作者勾的权限位。压成一个 `license: string`
   * 只有两条路：一律 null（把已知的商用声明丢掉），或者由我们编一个许可名（猜）。
   * 两条都违反「不许猜、不许省略」，所以许可是一个结构，不是一个字符串。
   *
   * ⚠ 已知偏差：Civitai 省略 `allowCommercialUse` 时上游映射写的是 `[]`，与
   * 「作者明确不允许任何商用」同形。偏差方向是**更保守**（多一条限制），且与
   * 现有库 UI 的许可徽章逐字一致，本批不改 —— 改它要动搜索侧映射，那是并行
   * 会话的地盘。
   */
  const license: LoraCandidateLicense = {
    label: null,
    commercialUse: item.allowCommercialUse,
    allowDerivatives: item.allowDerivatives,
    allowNoCredit: item.allowNoCredit ?? null,
    known: true,
  }
  const baseModelFamily = resolveFamily(item.baseModelFamily)
  const triggerWords = dedupeStrings([
    item.triggerWord,
    ...item.triggerAlternates,
  ])
  const sampleImageUrls = item.previewImageUrls.slice(
    0,
    LORA_CANDIDATE_LIMITS.maxSampleImages,
  )
  const fileSizeBytes = item.fileSizeBytes ?? null
  const metadataCompleteness = gradeCompleteness({
    author,
    license,
    baseModelFamily,
    triggerWords,
    fileSizeBytes,
    sampleImageUrls,
  })

  const importable = baseModelFamily !== null && Boolean(item.loraUrl)
  const snapshot = buildSnapshot({
    source: LORA_CANDIDATE_SOURCE_IDS.civitai,
    author,
    license,
    pageUrl: item.modelPageUrl,
    // Civitai 的版本 id 已经把「哪一版权重」钉死了，没有第二个 revision 概念。
    revision: null,
    fileSizeBytes,
    metadataCompleteness,
    retrievedAt,
  })

  const importPayload: LoraCandidateImportPayload | null =
    importable && baseModelFamily
      ? {
          name: clampName(item.name),
          triggerWord: item.triggerWord,
          loraUrl: item.loraUrl,
          type: item.type,
          baseModelFamily,
          provider: item.provider,
          coverImageUrl: item.coverImageUrl,
          recommendedPrompt: item.recommendedPrompt,
          ...(item.modelId ? { modelId: item.modelId } : {}),
          ...(item.modelVersionId
            ? { modelVersionId: item.modelVersionId }
            : {}),
          fileHashAutoV3: item.fileHashAutoV3,
          sourceSnapshot: snapshot,
        }
      : null

  return {
    candidateId: item.id,
    source: LORA_CANDIDATE_SOURCE_IDS.civitai,
    name: item.name,
    author,
    license,
    baseModelFamily,
    type: item.type,
    triggerWords,
    sampleImageUrls,
    fileSizeBytes,
    pageUrl: item.modelPageUrl,
    downloads: item.downloadCount,
    metadataCompleteness,
    importable,
    ...(importable
      ? {}
      : {
          notImportableReason: item.loraUrl
            ? LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.unknownBaseModel
            : LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.noWeightFile,
        }),
    // 两个标注在 `annotateOwnership` 里统一打 —— 这里先给确定的默认值。
    alreadyMounted: false,
    alreadyImported: false,
    importPayload,
  }
}

// ─── Hugging Face → LoraCandidate ───────────────────────────────────

/**
 * 一个仓库出一条候选，权重文件取 `files[0]`。
 *
 * ⚠ 多文件仓库（一个 repo 里放了多个 outfit 的权重）在库浏览里是让用户自己选
 * 的，但推荐卡是「一次确认」——把一个仓库摊成五张卡等于把选择成本原样退回去。
 * 取第一条并在 id 里带上文件序号，将来要展开也不用换 id 形状。
 */
function huggingFaceToCandidate(
  item: HuggingFaceLoraSearchItem,
  retrievedAt: string,
): LoraCandidate | null {
  const file = item.files[0]
  if (!file) return null

  const [namespace] = item.repoId.split('/')
  const author = item.repoId.includes('/') && namespace ? namespace : null
  const license: LoraCandidateLicense = {
    label: item.license,
    // HF 没有 Civitai 那套逐项权限声明 —— null 表示「这个源没有这个概念」，
    // 与「有这个概念但值不知道」不同。
    commercialUse: null,
    allowDerivatives: null,
    allowNoCredit: null,
    known: item.license !== null,
  }
  const baseModelFamily = resolveFamily(file.baseModelFamily)
  const triggerWords = dedupeStrings(item.triggerWord.split(','))
  const sampleImageUrls = item.coverImageUrl ? [item.coverImageUrl] : []
  const fileSizeBytes = file.sizeBytes
  const metadataCompleteness = gradeCompleteness({
    author,
    license,
    baseModelFamily,
    triggerWords,
    fileSizeBytes,
    sampleImageUrls,
  })

  // gated / private 仓库**技术上取不到权重**（已拍板边界 7 的「技术不可得仍阻断」）。
  // 它排在家族判定之前：拿不到文件的时候，家族对不对已经不重要了。
  const notImportableReason =
    item.gated || item.private
      ? LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.gatedRepo
      : baseModelFamily === null
        ? LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.unknownBaseModel
        : null
  const importable = notImportableReason === null

  const snapshot = buildSnapshot({
    source: LORA_CANDIDATE_SOURCE_IDS.huggingface,
    author,
    license,
    pageUrl: item.modelPageUrl,
    // ⭐ HF 的 commit sha —— 「同一个仓库不同时间下到的不是同一份权重」。
    // 这是策略 C 点名要的字段，也是 HF 行此前全空的那一格。
    revision: item.revision,
    fileSizeBytes,
    metadataCompleteness,
    retrievedAt,
  })

  const importPayload: LoraCandidateImportPayload | null =
    importable && baseModelFamily
      ? {
          name: clampName(item.name),
          triggerWord: item.triggerWord,
          loraUrl: file.downloadUrl,
          type: item.type,
          baseModelFamily,
          provider: LORA_CANDIDATE_SOURCE_IDS.huggingface,
          coverImageUrl: item.coverImageUrl,
          recommendedPrompt: null,
          // ⚠ 三个 civitai 标识符对 HF 行**就该是空的**，别为了「填满」编。
          fileHashAutoV3: null,
          sourceSnapshot: snapshot,
        }
      : null

  return {
    candidateId: `hf:${item.repoId}#0`,
    source: LORA_CANDIDATE_SOURCE_IDS.huggingface,
    name: item.name,
    author,
    license,
    baseModelFamily,
    type: item.type,
    triggerWords,
    sampleImageUrls,
    fileSizeBytes,
    pageUrl: item.modelPageUrl,
    downloads: item.downloads,
    metadataCompleteness,
    importable,
    ...(notImportableReason ? { notImportableReason } : {}),
    alreadyMounted: false,
    alreadyImported: false,
    importPayload,
  }
}

// ─── 合并 / 标注 ────────────────────────────────────────────────────

/**
 * 两源交替取，直到填满。
 *
 * ⚠ **不是按热度全局排序**：Civitai 的下载数动辄六位数、HF 常常三位数，
 * 混在一起排等于 HF 永远排不进前六 —— 那就等于没接第二个源。交替保证两边都
 * 有露面机会，家族匹配的那一批优先（软偏好，见 `SearchLoraCandidatesInput`）。
 */
function interleave(
  civitai: readonly LoraCandidate[],
  huggingface: readonly LoraCandidate[],
  limit: number,
): LoraCandidate[] {
  const out: LoraCandidate[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < limit; i += 1) {
    const next = [civitai[i], huggingface[i]].filter(Boolean) as LoraCandidate[]
    if (next.length === 0) break
    for (const candidate of next) {
      if (out.length >= limit || seen.has(candidate.candidateId)) continue
      seen.add(candidate.candidateId)
      out.push(candidate)
    }
  }
  return out
}

/** 家族匹配的排前面。匹配不上的**不删** —— 见 `SearchLoraCandidatesInput`。 */
function preferFamily(
  candidates: readonly LoraCandidate[],
  baseModelFamily: string | undefined,
): LoraCandidate[] {
  const target = baseModelFamily
    ? normalizeToLoraBaseFamily(baseModelFamily)
    : null
  if (!target) return [...candidates]
  const matches = (candidate: LoraCandidate) =>
    candidate.baseModelFamily !== null &&
    normalizeToLoraBaseFamily(candidate.baseModelFamily) === target
  return [
    ...candidates.filter(matches),
    ...candidates.filter((candidate) => !matches(candidate)),
  ]
}

/**
 * 打上「已挂载 / 已收藏」两个标注。
 *
 * ⚠ 两条比对用的是**不同精度的键**，故意的：
 *  - 已挂载：挂载栈上只有名字（`AssistantWorkbenchLoraMount` 没有 url），
 *    所以按 `normalizeLoraNameKey` 归一名比对 —— 与「一键补挂」的第 0 层
 *    用的是同一把尺子。
 *  - 已收藏：库里有精确键（loraUrl / civitaiModelVersionId），就用精确的。
 *    名字比对在这一侧会误判（同名不同版本）。
 */
async function annotateOwnership(
  candidates: LoraCandidate[],
  input: { userId: string; mountedNames?: readonly string[] },
): Promise<LoraCandidate[]> {
  if (candidates.length === 0) return candidates

  const mountedKeys = new Set(
    (input.mountedNames ?? [])
      .map((name) => normalizeLoraNameKey(name))
      .filter(Boolean),
  )

  const loraUrls = candidates
    .map((candidate) => candidate.importPayload?.loraUrl)
    .filter((url): url is string => Boolean(url))
  const versionIds = candidates
    .map((candidate) => candidate.importPayload?.modelVersionId)
    .filter((id): id is number => typeof id === 'number')

  const ownedRows =
    loraUrls.length > 0 || versionIds.length > 0
      ? await db.loraAsset.findMany({
          where: {
            userId: input.userId,
            OR: [
              ...(loraUrls.length ? [{ loraUrl: { in: loraUrls } }] : []),
              ...(versionIds.length
                ? [{ civitaiModelVersionId: { in: versionIds } }]
                : []),
            ],
          },
          select: { loraUrl: true, civitaiModelVersionId: true },
          take: LORA_CANDIDATE_LIMITS.maxOwnedAssetsScanned,
        })
      : []

  const ownedUrls = new Set(ownedRows.map((row) => row.loraUrl))
  const ownedVersionIds = new Set(
    ownedRows
      .map((row) => row.civitaiModelVersionId)
      .filter((id): id is number => id !== null),
  )

  return candidates.map((candidate) => ({
    ...candidate,
    alreadyMounted: mountedKeys.has(normalizeLoraNameKey(candidate.name)),
    alreadyImported:
      (candidate.importPayload?.loraUrl !== undefined &&
        ownedUrls.has(candidate.importPayload.loraUrl)) ||
      (typeof candidate.importPayload?.modelVersionId === 'number' &&
        ownedVersionIds.has(candidate.importPayload.modelVersionId)),
  }))
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * 并行打 Civitai + HF，归一成统一的候选形状。**永不抛** —— 两源全挂时返回空
 * 候选 + 两条失败回执，助手照常回答，只是这一轮没有推荐卡。
 */
export async function searchLoraCandidates(
  input: SearchLoraCandidatesInput,
): Promise<LoraCandidateSearchResult> {
  const query = input.query
    .trim()
    .slice(0, LORA_CANDIDATE_LIMITS.maxQueryLength)
  const limit = Math.min(
    input.limit ?? LORA_CANDIDATE_LIMITS.maxCandidates,
    LORA_CANDIDATE_LIMITS.maxCandidates,
  )
  const retrievedAt = new Date().toISOString()

  if (!query) {
    return { candidates: [], query: '', sources: [] }
  }

  const [civitai, huggingface] = await Promise.all([
    runCandidateSource(LORA_CANDIDATE_SOURCE_IDS.civitai, async () => {
      const result = await listCivitaiLoras({
        search: query,
        pageSize: LORA_CANDIDATE_LIMITS.perSourcePageSize,
      })
      return result.items.map((item) => civitaiToCandidate(item, retrievedAt))
    }),
    runCandidateSource(LORA_CANDIDATE_SOURCE_IDS.huggingface, async () => {
      const result = await searchHuggingFaceLoras(
        HuggingFaceLoraSearchQuerySchema.parse({
          search: query,
          limit: LORA_CANDIDATE_LIMITS.perSourcePageSize,
        }),
      )
      return result.items
        .map((item) => huggingFaceToCandidate(item, retrievedAt))
        .filter((candidate): candidate is LoraCandidate => candidate !== null)
    }),
  ])

  const merged = interleave(
    preferFamily(civitai.items, input.baseModelFamily),
    preferFamily(huggingface.items, input.baseModelFamily),
    limit,
  )
  const candidates = await annotateOwnership(merged, input)

  logger.info('LoRA candidates resolved', {
    query,
    total: candidates.length,
    civitai: civitai.receipt.status,
    huggingface: huggingface.receipt.status,
  })

  return {
    candidates,
    query,
    sources: [civitai.receipt, huggingface.receipt],
  }
}
