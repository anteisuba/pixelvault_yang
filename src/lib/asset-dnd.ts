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

/**
 * 拖拽载荷字符串里那些**库内资产 id**（`ASSET_DND_MIME` 的既有约定，
 * `KreaAssetBrowser.tsx` 的瓦片就是这么写的：`JSON.stringify(ids)`）。
 *
 * ⚠ 解析失败一律当作「没有资产」而不是抛：拖拽来源五花八门，一个格式没对上就把
 * 输入框整个打红是不成比例的 —— 那种情况下它照旧回落到上传通道。
 */
export function parseDroppedAssetIds(raw: string): readonly string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}
