/**
 * 检索回执的传输编码（响应头）。
 *
 * **为什么走响应头而不是流里的事件**：流式端点的正文是 `text/plain`，客户端直接把
 * body 当助手说的话渲染。往流里插一个 `data: {...}` 事件，老客户端会把它念出来 ——
 * 而 UI 的消费是下一批。响应头老客户端天然忽略，且在正文第一个字之前就到齐了。
 *
 * 编码是 base64(UTF-8 JSON)：回执里带中文错误信息，HTTP 头放不了非 ASCII。
 * 编解码放同一个文件，是为了让「服务端怎么写」和「客户端怎么读」永远对得上 ——
 * 这种两头各写一份的编码最容易悄悄漂移。
 */

import { RESEARCH_RECEIPT_HEADER_MAX_BYTES } from '@/constants/research'
import { ResearchReceiptSchema, type ResearchReceipt } from '@/types/research'

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
 * ⚠ **必须有上限**：单个 HTTP 头字段在多数服务端是 8KB 硬限，而回执里每个源都
 * 可能带一段错误原文。超限的表现不是「回执少了一行」，是**整个响应被拒**——
 * 助手一个字都出不来。所以太大时先丢错误文本（状态和计数才是 UI 要渲染的），
 * 仍然太大就整个不发。
 */
export function encodeResearchReceiptHeader(
  receipt: ResearchReceipt,
): string | null {
  const encoded = toBase64(JSON.stringify(receipt))
  if (encoded.length <= RESEARCH_RECEIPT_HEADER_MAX_BYTES) return encoded

  const slim: ResearchReceipt = {
    ...receipt,
    perSource: receipt.perSource.map((entry) => ({
      sourceId: entry.sourceId,
      status: entry.status,
      count: entry.count,
      tookMs: entry.tookMs,
      ...(entry.via ? { via: entry.via } : {}),
    })),
    queries: [],
  }
  const slimEncoded = toBase64(JSON.stringify(slim))
  return slimEncoded.length <= RESEARCH_RECEIPT_HEADER_MAX_BYTES
    ? slimEncoded
    : null
}

/** 读不出来就当没有 —— 回执坏了不该让一次对话失败。 */
export function decodeResearchReceiptHeader(
  value: string | null,
): ResearchReceipt | null {
  if (!value) return null
  try {
    const parsed = ResearchReceiptSchema.safeParse(
      JSON.parse(fromBase64(value)),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
