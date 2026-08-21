/**
 * LoRA 候选下发的传输编码（响应头）。
 *
 * ── 为什么客户端非拿到它不可 ───────────────────────────────────────
 * `[[lora]]` 块里**只有 candidateId**（外加理由和建议权重）。推荐卡上的名字、
 * 作者、许可、底模家族、样图、导入载荷全在候选对象上 —— 拿不到候选，模型说的
 * 那一句「推荐这把」就落不成一张卡，更导不进库。
 *
 * ── 为什么走响应头 ─────────────────────────────────────────────────
 * 与检索回执同一条路数（`lib/research-receipt.ts`）：流式端点的正文是
 * `text/plain`，客户端把 body 当助手说的话渲染；往流里插事件会被念出来。
 * 响应头在正文第一个字之前就到齐，且老客户端天然忽略。
 *
 * ── 为什么编解码在同一个文件 ───────────────────────────────────────
 * 这套编码有**三档降级**，两头各写一份必然漂移，而漂移的表现是「某一档解出来
 * 是半条数据」。encode / decode / 降级判据全在这里，配一组往返测试。
 *
 * ⚠ **降级绝不切半条候选**：要么整条按某一档投影，要么整批不发。截断成半条
 * 的结果是卡上出现一半真一半空的事实 —— 用户没法分辨哪半是真的。
 */

import {
  LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
  LORA_CANDIDATE_RECEIPT_LIMITS,
  LORA_CANDIDATE_RECEIPT_TIERS,
  LORA_METADATA_COMPLETENESS,
  type LoraCandidateReceiptTier,
} from '@/constants/lora-candidate'
import {
  LoraCandidateSearchResultSchema,
  type LoraCandidate,
  type LoraCandidateSearchResult,
} from '@/types/lora-candidate'

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * 第 1 档：卡面必需字段 + 导入载荷，样图每条留 1 张。
 *
 * ⚠ **导入载荷跟着候选走，不能省** —— 一次确认要用它直接调导入链。省掉它就只
 * 剩「按 id 再搜一次」，而那正是候选自带载荷要消灭的东西（上游会变，用户看到
 * 的卡必须等于导入的那版）。
 */
function toCardProjection(candidate: LoraCandidate): LoraCandidate {
  return {
    ...candidate,
    sampleImageUrls: candidate.sampleImageUrls.slice(
      0,
      LORA_CANDIDATE_RECEIPT_LIMITS.maxSampleImages,
    ),
  }
}

/** 第 2 档：丢样图 URL。卡少一张图，其余事实一个不少，导入照样能走。 */
function withoutSampleImages(candidate: LoraCandidate): LoraCandidate {
  return { ...candidate, sampleImageUrls: [] }
}

/**
 * 第 3 档：只够解析 picks + 说清「这条我们知道的不多」。
 *
 * ⚠ **被丢掉的字段一律落到「不知道」的表示，不是编一个值**：底模/大小/下载量
 * 归 null，完整度归 `minimal` —— 后者恰好就是这一档的事实（这个投影知道的确实
 * 只有最少那几项），卡面照旧如实显示「未知」。
 *
 * ⚠ `importPayload` 归 null 而 `importable` 保留真值：卡要说得出「这把本来能导，
 * 但这一轮的详情被裁掉了」，而不是谎称它不可导入。确认按钮的闸是
 * `importable && importPayload`，见推荐卡。
 */
function toMinimalProjection(candidate: LoraCandidate): LoraCandidate {
  return {
    candidateId: candidate.candidateId,
    source: candidate.source,
    name: candidate.name,
    author: candidate.author,
    license: candidate.license,
    baseModelFamily: null,
    type: candidate.type,
    triggerWords: [],
    sampleImageUrls: [],
    fileSizeBytes: null,
    pageUrl: '',
    downloads: null,
    metadataCompleteness: LORA_METADATA_COMPLETENESS.minimal,
    importable: candidate.importable,
    ...(candidate.notImportableReason
      ? { notImportableReason: candidate.notImportableReason }
      : {}),
    alreadyMounted: candidate.alreadyMounted,
    alreadyImported: candidate.alreadyImported,
    importPayload: null,
  }
}

export interface LoraCandidateReceiptEncoding {
  /** base64 值；`null` = 最低档仍然装不下，整批不发。 */
  value: string | null
  tier: LoraCandidateReceiptTier
  /** 最后一次尝试的编码长度 —— 日志要说得出「差多少」，不是只说「太大了」。 */
  bytes: number
}

/**
 * 逐级降级地编码一轮候选。
 *
 * ⚠ **必须有上限**：单个 HTTP 头字段超限时被拒的是**整个响应**，表现不是
 * 「候选少了几条」，是助手一个字都出不来。所以宁可整批不发也不硬塞。
 */
export function encodeLoraCandidateReceiptHeader(
  result: LoraCandidateSearchResult,
): LoraCandidateReceiptEncoding {
  const ladder: { tier: LoraCandidateReceiptTier; value: string }[] = [
    {
      tier: LORA_CANDIDATE_RECEIPT_TIERS.full,
      value: toBase64(
        JSON.stringify({
          ...result,
          candidates: result.candidates.map(toCardProjection),
        }),
      ),
    },
    {
      tier: LORA_CANDIDATE_RECEIPT_TIERS.noImages,
      value: toBase64(
        JSON.stringify({
          ...result,
          candidates: result.candidates.map(withoutSampleImages),
        }),
      ),
    },
    {
      tier: LORA_CANDIDATE_RECEIPT_TIERS.minimal,
      value: toBase64(
        JSON.stringify({
          ...result,
          candidates: result.candidates.map(toMinimalProjection),
        }),
      ),
    },
  ]

  for (const step of ladder) {
    if (step.value.length <= LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES) {
      return { value: step.value, tier: step.tier, bytes: step.value.length }
    }
  }

  return {
    value: null,
    tier: LORA_CANDIDATE_RECEIPT_TIERS.dropped,
    // 最低档的长度 —— 日志里靠它判断「上限该调多少」。
    bytes: ladder[ladder.length - 1]?.value.length ?? 0,
  }
}

/**
 * 读不出来就当没有 —— 候选头坏了不该让一次对话失败（同 `decodeResearchReceiptHeader`）。
 *
 * 走 schema 校验而不是裸 `JSON.parse`：这个载荷会直接喂给推荐卡渲染、并且带着
 * 一份要发给导入链的载荷，形状对不上时**不渲染**比渲染半张卡安全得多。
 */
export function decodeLoraCandidateReceiptHeader(
  value: string | null,
): LoraCandidateSearchResult | null {
  if (!value) return null
  try {
    const parsed = LoraCandidateSearchResultSchema.safeParse(
      JSON.parse(fromBase64(value)),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
