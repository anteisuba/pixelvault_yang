import 'server-only'

import {
  RESEARCH_BREAKER_OPTIONS,
  RESEARCH_LIMITS,
  RESEARCH_SOURCE_META,
  RESEARCH_SOURCE_STATUSES,
  RESEARCH_USER_AGENT,
  type ResearchSourceId,
} from '@/constants/research'
import { CircuitOpenError, getCircuitBreaker } from '@/lib/circuit-breaker'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import type { EvidenceItem, ResearchSourceReceipt } from '@/types/research'

/**
 * 连接器的共享跑法。**这里只有一件事：让单源失败不拖垮整体**（§3.2）。
 *
 * 三层，缺一不可：
 *  1. `with-retry` —— 瞬时错误重试（5xx / 超时 / 网络）；
 *  2. `circuit-breaker` —— 连挂即短路（本管线是这个 lib 的第一个消费者），
 *     短路状态如实反映进 perSource，不假装「查到了空结果」；
 *  3. 本文件的 `runConnector` —— 兜住一切异常并翻成回执，**永不向上抛**。
 *
 * ⚠ 每个源自己声明「怎么算失败」（§3.4 第 1 闸）：MediaWiki 的拒绝是
 * **HTTP 200 + body 里的 `error.code`**，共用一条 `response.ok` 会把「这个源被封了」
 * 当成「查到了空结果」——这正是本管线要区分的两件事。
 */

export interface ConnectorResult {
  items: EvidenceItem[]
  /** 走了退路时如实标注（如 B站退到 Serper）。 */
  via?: string
}

/** 连接器主动抛这个来表达「这个源坏了」，而不是「没料」。 */
export class ResearchSourceError extends Error {
  readonly sourceId: ResearchSourceId
  readonly status?: number

  constructor(sourceId: ResearchSourceId, message: string, status?: number) {
    super(message)
    this.name = 'ResearchSourceError'
    this.sourceId = sourceId
    this.status = status
  }
}

export function getResearchBreaker(sourceId: ResearchSourceId) {
  return getCircuitBreaker(`research:${sourceId}`, RESEARCH_BREAKER_OPTIONS)
}

/** 测试用：把本进程里所有检索熔断器复位。 */
export function resetResearchBreakers(sourceIds: ResearchSourceId[]): void {
  for (const sourceId of sourceIds) getResearchBreaker(sourceId).reset()
}

/**
 * 跑一个连接器，产出 `{ items, receipt }`。**任何情况下都不抛**。
 */
export async function runConnector(
  sourceId: ResearchSourceId,
  fn: () => Promise<ConnectorResult>,
): Promise<{ items: EvidenceItem[]; receipt: ResearchSourceReceipt }> {
  const startedAt = Date.now()
  try {
    const result = await getResearchBreaker(sourceId).call(fn)
    const items = result.items.slice(0, RESEARCH_LIMITS.maxItemsPerSource)
    return {
      items,
      receipt: {
        sourceId,
        status:
          items.length > 0
            ? RESEARCH_SOURCE_STATUSES.ok
            : RESEARCH_SOURCE_STATUSES.empty,
        count: items.length,
        tookMs: Date.now() - startedAt,
        ...(result.via ? { via: result.via } : {}),
      },
    }
  } catch (error) {
    const isOpen = error instanceof CircuitOpenError
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('Research connector failed', { sourceId, error: message })
    return {
      items: [],
      receipt: {
        sourceId,
        status: isOpen
          ? RESEARCH_SOURCE_STATUSES.circuitOpen
          : RESEARCH_SOURCE_STATUSES.failed,
        count: 0,
        tookMs: Date.now() - startedAt,
        error: message.slice(0, 400),
      },
    }
  }
}

export function skippedReceipt(
  sourceId: ResearchSourceId,
  reason: string,
): ResearchSourceReceipt {
  return {
    sourceId,
    status: RESEARCH_SOURCE_STATUSES.skipped,
    count: 0,
    tookMs: 0,
    error: reason.slice(0, 400),
  }
}

// ─── HTTP ───────────────────────────────────────────────────────

function markStatus(error: Error, status: number): Error {
  ;(error as { status?: number }).status = status
  return error
}

/**
 * 带礼仪 UA 的只读 GET，过 `with-retry`。
 *
 * 🔬 萌百实测**不按 UA 拦、不按速率拦**（四种 UA 全 200；12 并发全 200，最慢
 * 260ms），按 API 模块白名单拦 —— 所以这里用 MediaWiki 官方礼仪要求的
 * 「项目名 + 联系方式」格式，不伪装浏览器。
 */
export async function researchFetchJson<T = unknown>(
  sourceId: ResearchSourceId,
  url: string,
  options: {
    timeoutMs?: number
    headers?: Record<string, string>
    label?: string
    maxAttempts?: number
  } = {},
): Promise<T> {
  const {
    timeoutMs = RESEARCH_LIMITS.sourceTimeoutMs,
    headers = {},
    label = `research.${sourceId}`,
    maxAttempts = RESEARCH_LIMITS.maxFetchAttempts,
  } = options

  return withRetry(
    async () => {
      const response = await fetch(url, {
        headers: { 'User-Agent': RESEARCH_USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        throw markStatus(
          new ResearchSourceError(
            sourceId,
            `${sourceId} responded ${response.status}`,
            response.status,
          ),
          response.status,
        )
      }
      return (await response.json()) as T
    },
    { label, maxAttempts },
  )
}

// ─── Evidence helpers ───────────────────────────────────────────

export function evidenceTier(sourceId: ResearchSourceId) {
  return RESEARCH_SOURCE_META[sourceId].tier
}

export function evidenceId(sourceId: ResearchSourceId, key: string): string {
  return `${sourceId}:${key}`.slice(0, 120)
}

/**
 * 摘录截断。**留整句**优先：从截断点往回找最后一个句读，找不到才硬切。
 * 半个词喂进去比少一句更容易让模型脑补。
 */
export function clampExcerpt(
  text: string,
  maxChars = RESEARCH_LIMITS.excerptChars,
): string {
  const normalized = text.replace(/\s+\n/g, '\n').trim()
  if (normalized.length <= maxChars) return normalized
  const head = normalized.slice(0, maxChars)
  const lastStop = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
    head.lastIndexOf('. '),
    head.lastIndexOf('\n'),
  )
  const cut = lastStop > maxChars * 0.5 ? head.slice(0, lastStop + 1) : head
  return `${cut.trim()}…`
}
