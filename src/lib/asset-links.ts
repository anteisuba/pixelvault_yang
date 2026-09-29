/** 浏览器里直接存下一个文件（服务端代下失败、或没登录时的退路）。 */
export function triggerDirectAssetDownload(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/** 新标签页打开原图；被拦下就在当前页打开。 */
export function openExternalAsset(url: string) {
  const openedWindow = window.open(url, '_blank')
  if (openedWindow) {
    openedWindow.opener = null
    return
  }
  window.location.assign(url)
}
