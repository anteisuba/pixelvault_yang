/**
 * 她的原图（`public/homepage/v6/her.webp`，2000×2000）上量出来的位置，烘焙脚本和运行时共用。
 * 量过原图：右眼深色像素 1010–1326 × 1280–1528（含外侧睫毛尖），眨眼弧 424–720 × 1250–1406，
 * 脸中间的白色高光 684–888 × 1172–1390；腮红左 (522,1430) 右 (1146,1596)；嘴 764–894 × 1501–1560
 */
export type Vec2 = readonly [number, number]
export type Rgb = [number, number, number]

export const HER_SIZE = 2000
export const EC = [1160, 1404] as const
export const EO = [206, 150] as const
export const EI = [162, 128] as const
export const WC = [576, 1330] as const
export const WR = [196, 126] as const
export const SC = [786, 1281] as const
export const SR = [124, 130] as const
export const MOUTH_C = [829, 1530] as const
export const MOUTH_R = [100, 56] as const
