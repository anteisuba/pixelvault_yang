/**
 * 从 GIF 文件头读画布尺寸（Logical Screen Descriptor：签名 6 字节之后两个
 * 小端 uint16）。GPT Image 出 GIF 时存库的宽高以它为准，不信请求值。
 *
 * ⚠ Worker 用相对路径 import 这个文件：⛔ 不要加 `@/` 导入或 Node 专属 API。
 */
export function readGifDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 10) return null
  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null
  const width = bytes[6] | (bytes[7] << 8)
  const height = bytes[8] | (bytes[9] << 8)
  return width > 0 && height > 0 ? { width, height } : null
}
