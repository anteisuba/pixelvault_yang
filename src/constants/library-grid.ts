/**
 * 库整页的格子（ui-spec §9「库」）：一行最多 8 张、图在上 3:4；叫出助手、库变窄时
 * 按「一格最窄多少」少几列。七个库共用这一份，⛔ 各写一套列数。
 */
export const LIBRARY_GRID = {
  gap: 10,
  minTileWidth: 120,
  maxColumns: 8,
  /** 宽 / 高。 */
  aspectRatio: 3 / 4,
} as const
