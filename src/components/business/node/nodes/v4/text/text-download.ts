/**
 * 文本卡的**下载**（spec §2：以 `名字.md` 下载正文）。
 *
 * ⚠ 与四类卡的媒体下载（`triggerNodeV4Download`，`<a href={R2 地址}>`）不是一回事：
 * 正文没有 URL，它只在浏览器内存里，所以这条走 Blob + objectURL，并**当场释放**。
 */

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

/**
 * 下载文件名：`名字.md`。⚠ 路径分隔符与 Windows 保留字符换成 `-` —— 节点名是用户
 * 自己打的，一个 `/` 会让浏览器把整个文件名当路径丢掉。
 */
export function textNodeFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return `${safe.length > 0 ? safe : 'untitled'}.md`
}
