/**
 * Custom drag-and-drop MIME type for moving assets from the /assets grid onto
 * a folder (or the unassigned bucket) in the right-rail folder tree.
 *
 * The payload is a JSON string array of generation ids — a single tile when
 * dragged on its own, or the whole multi-select set when the dragged tile is
 * part of an active selection.
 */
export const ASSET_DND_MIME = 'application/x-pixelvault-asset-ids'

/**
 * 门牌自己的拖拽载荷（payload = 被拖的 folderId）—— 文件夹总览页里
 * 「拖门牌进门牌变子夹」用（`docs/references/pages/assets.md` §4 治理 2）。
 *
 * ⚠ 与 `ASSET_DND_MIME` **分成两种 MIME**：同一张门牌既是「素材归档」的落点，
 * 又是「变子夹」的落点，靠类型区分才不会把一次拖拽解读成另一件事。
 */
export const FOLDER_DND_MIME = 'application/x-pixelvault-folder-id'
