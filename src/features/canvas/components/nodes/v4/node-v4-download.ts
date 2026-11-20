import { downloadRemoteAsset } from '@/lib/api-client'

/**
 * 下载：走 `/api/download`（与图库、作品详情同一条）。
 *
 * ⚠ 不能直接 `<a href={R2 地址} download>`：CDN 是跨域的，浏览器无视跨域链接上的
 * `download`，结果是新开一页把图打开（owner 2026-10-15 电脑与手机都撞上）。接口给自家
 * R2 对象签一条带 `attachment` 的地址、给 provider 临时地址转一次流，两种都真的落成
 * 文件。接口失败才退回开新页，至少还能手动另存。
 */
export function triggerNodeV4Download(url: string) {
  const fileName =
    decodeURIComponent(new URL(url, window.location.href).pathname)
      .split('/')
      .pop() || 'antei-download'
  void downloadRemoteAsset(url, fileName).then((result) => {
    if (!result.success) window.open(url, '_blank', 'noopener,noreferrer')
  })
}
