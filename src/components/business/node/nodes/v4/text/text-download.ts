/**
 * 文本卡的**下载**（spec §2：以 `名字.md` 下载正文）。
 *
 * ⚠ 与四类卡的媒体下载（`triggerNodeV4Download`，`<a href={R2 地址}>`）不是一回事：
 * 正文没有 URL，它只在浏览器内存里，所以这条走 Blob + objectURL，并**当场释放**。
 */

import { textNodeFileName } from './text-markdown'

export function downloadTextNodeBody(name: string, body: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = textNodeFileName(name)
  anchor.click()
  URL.revokeObjectURL(url)
}
