/**
 * GIF 作品 → 第一帧 PNG（浏览器端）。owner 2026-11-05 gif-output mockup ③：
 * 改图、参考图、助手都只看一帧，拿 GIF 当输入时先取第一帧存成 PNG 新作品，
 * GIF 原件不动。
 *
 * 为什么 `drawImage` 就是第一帧：动图 `<img>` 刚解码完、还没开始播时画到
 * canvas 上取的是首帧；这里用一张从没挂进文档的 `Image`，不存在「播到第几帧」。
 * 尺寸按原图 `naturalWidth / naturalHeight`，不缩放。
 *
 * ⚠ 读像素要匿名 CORS（同 `svg-to-png.ts`）：预览部署的域不在 CDN 允许名单里，
 * 那里 `fetch` 会失败，按普通失败报给用户。
 */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('GIF could not be decoded'))
    image.src = url
  })
}

export async function rasterizeGifFirstFrameToPng(params: {
  url: string
  baseName: string
}): Promise<File> {
  const response = await fetch(params.url, {
    mode: 'cors',
    credentials: 'omit',
  })
  if (!response.ok) throw new Error(`GIF fetch failed (${response.status})`)
  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    const image = await loadImage(objectUrl)
    const width = Math.max(1, image.naturalWidth)
    const height = Math.max(1, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas 2d context unavailable')
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('toBlob failed')),
        'image/png',
      ),
    )
    return new File([blob], `${params.baseName}-frame1.png`, {
      type: 'image/png',
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
