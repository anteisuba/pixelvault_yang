import { ASSET_DND_MIME } from '@/constants/asset-dnd'

/**
 * 解析「把素材拖到文件夹」的拖拽载荷，没有就返回 null。
 *
 * ⚠ 同一个 drop 目标上还可能落下别的东西（OS 文件 = 上传、门牌 = 变子夹），
 * 所以这里只认自己的 MIME，认不出来就交回给调用方继续判。
 */
export function readDroppedAssetIds(event: React.DragEvent): string[] | null {
  const raw = event.dataTransfer.getData(ASSET_DND_MIME)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter((id): id is string => typeof id === 'string')
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

/** 拖拽中的载荷是不是素材（`dragover` 阶段读不到数据，只能看类型表）。 */
export function hasAssetDragPayload(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(ASSET_DND_MIME)
}
