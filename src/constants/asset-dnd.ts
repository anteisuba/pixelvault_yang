/**
 * Custom drag-and-drop MIME type for moving assets from the /assets grid onto
 * a folder (or the unassigned bucket) in the right-rail folder tree.
 *
 * The payload is a JSON string array of generation ids — a single tile when
 * dragged on its own, or the whole multi-select set when the dragged tile is
 * part of an active selection.
 */
export const ASSET_DND_MIME = 'application/x-pixelvault-asset-ids'
