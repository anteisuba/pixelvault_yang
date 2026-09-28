/**
 * Custom drag-and-drop MIME type for dragging assets from the /assets grid onto
 * a folder in the left folder column (drop = also file them there).
 *
 * The payload is a JSON string array of generation ids — a single tile when
 * dragged on its own, or the whole multi-select set when the dragged tile is
 * part of an active selection.
 */
export const ASSET_DND_MIME = 'application/x-pixelvault-asset-ids'
