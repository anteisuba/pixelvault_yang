/**
 * Base64-encode a byte array in chunks.
 *
 * ⚠ 别改回逐字节 `binary += String.fromCharCode(bytes[i])`。那个写法是给 32 字节的
 * API key 写的（见上方注释），但 `readReferenceImageAsBase64` 拿它编码整张参考图：
 * 一张 8MB 的图会逐字节堆出上百万个中间字符串节点，128MB 的 Worker 直接 OOM——
 * 2026-08-24 生产上真炸过（`Worker exceeded memory limit.`）。
 *
 * 32766 = 3 × 10922：既是 3 的倍数（base64 每 3 字节编码成 4 字符，只有按 3 对齐
 * 分块才能把各块结果直接拼接），又低于 `String.fromCharCode` 的实参数量上限。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_BYTES = 32766
  let base64 = ''
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    base64 += btoa(String.fromCharCode(...bytes.subarray(i, i + CHUNK_BYTES)))
  }
  return base64
}

/** 服务商不回传种子时自己挑一颗，带回去记进作品配方。 */
export function randomUint32(): number {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return bytes[0]
}

// ─── API-key state encryption ──────────────────────────────────────────
// Resolved BYOK API keys flow through `step.do` results, which Cloudflare
// persists in workflow state. We AES-GCM encrypt them with a Worker secret
// so a Cloudflare-state dump alone is not enough to recover the plaintext.

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
