/**
 * 台上「从图读串」（owner 2026-10-25）：拖一张图 / 点键选一张图，读它自带的配方，
 * 读不到就交给 PixAI Tagger 认标签，勾上的填进输入框。
 *
 * ⭐ 图只是借道 R2 临时放一下（Tagger 只收 https 地址；Vercel 请求体 4.5 MB 硬顶装不下
 *   大 PNG），读完就删，⛔ 不进素材库。
 */
export const IMAGE_RECIPE = {
  STORAGE_PREFIX: 'tmp/recipe-read',
  UPLOAD_URL_EXPIRES_SECONDS: 300,
  /** 画风一类大多是画师名；低于这个分只是「有点像」，⛔ 往提示词里塞。 */
  MIN_ARTIST_SCORE: 0.4,
  MAX_ARTISTS: 3,
  MAX_CHARACTERS: 3,
} as const
