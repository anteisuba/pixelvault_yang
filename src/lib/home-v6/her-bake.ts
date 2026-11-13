import {
  EC,
  EI,
  EO,
  HER_SIZE,
  MOUTH_C,
  MOUTH_R,
  SC,
  SR,
  WC,
  WR,
  type Rgb,
  type Vec2,
} from './her-geometry'

/** 烘焙结果：两张 2000² RGBA（直通 alpha）和三种取样色。 */
export interface BakedHer {
  base: Uint8ClampedArray
  parts: Uint8ClampedArray
  skin: Rgb
  lash: Rgb
  hair: Rgb
}

/**
 * 离线在 2000² 原图上把会动的那几样一次抠干净（scripts/bake-home-her.mjs 调用）：得到 base（补好皮肤的底）和
 * parts（右眼 · 眨眼弧 · 原来的嘴，各在原位，带透明度）。线和皮肤之间的抗锯齿边
 * 按「皮肤→睫毛色」那条线拆出覆盖率；底上的洞从四周的皮肤一圈圈补。
 */
export function bakeHer(s: Uint8ClampedArray): BakedHer {
  const W = HER_SIZE
  const b = new Uint8ClampedArray(s)
  const p = new Uint8ClampedArray(W * W * 4)
  const col = (i: number): Rgb => {
    const a = s[i + 3] / 255
    return [
      1 - a * (1 - s[i] / 255),
      1 - a * (1 - s[i + 1] / 255),
      1 - a * (1 - s[i + 2] / 255),
    ]
  }
  const at = (x: number, y: number) => col((y * W + x) * 4)
  const skin = at(680, 1600)
  const lash = at(1190, 1377)
  const hair = at(1000, 700)
  const dist = (a: Rgb, c: Rgb) =>
    Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])
  const ell = (x: number, y: number, c: Vec2, r: Vec2) =>
    Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1])
  const hairish = (c: Rgb) => dist(c, hair) < 0.085
  const v: Rgb = [lash[0] - skin[0], lash[1] - skin[1], lash[2] - skin[2]]
  const vv = v[0] ** 2 + v[1] ** 2 + v[2] ** 2
  /* 一个像素拆成「覆盖率 + 前景色」：落在皮肤—睫毛色那条线上 = 线的抗锯齿边 */
  const split = (c: Rgb): [number, Rgb] => {
    const t = Math.min(
      1,
      Math.max(
        0,
        ((c[0] - skin[0]) * v[0] +
          (c[1] - skin[1]) * v[1] +
          (c[2] - skin[2]) * v[2]) /
          vv,
      ),
    )
    const r = Math.hypot(
      c[0] - skin[0] - t * v[0],
      c[1] - skin[1] - t * v[1],
      c[2] - skin[2] - t * v[2],
    )
    return r < 0.05 ? [t, lash] : [1, c]
  }
  const hole = new Uint8Array(W * W)
  const holes: number[] = []
  const dig = (x: number, y: number) => {
    const i = y * W + x
    if (!hole[i]) {
      hole[i] = 1
      holes.push(i)
    }
  }
  const put = (x: number, y: number, [a, E]: [number, Rgb]) => {
    if (a < 0.008) return
    const i = (y * W + x) * 4
    p[i] = E[0] * 255
    p[i + 1] = E[1] * 255
    p[i + 2] = E[2] * 255
    p[i + 3] = a * 255
    dig(x, y)
  }
  /* 只从「像皮肤」的邻居取色：头发和线 ⛔ 算，不然头发的粉会顺着补进来拉出条纹 */
  const skinlike = (j: number): Rgb | null => {
    const a = b[j * 4 + 3] / 255
    const c: Rgb = [
      1 - a * (1 - b[j * 4] / 255),
      1 - a * (1 - b[j * 4 + 1] / 255),
      1 - a * (1 - b[j * 4 + 2] / 255),
    ]
    return dist(c, skin) < 0.15 && dist(c, hair) > 0.115 ? c : null
  }
  const peel = () => {
    let left = holes
    while (left.length) {
      const next: number[] = []
      const fills: number[] = []
      for (const i of left) {
        let r = 0
        let g = 0
        let bl = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * W + dx
            const c = j !== i && !hole[j] ? skinlike(j) : null
            if (c) {
              r += c[0]
              g += c[1]
              bl += c[2]
              n++
            }
          }
        if (n) fills.push(i, r / n, g / n, bl / n)
        else next.push(i)
      }
      if (!fills.length) break
      for (let k = 0; k < fills.length; k += 4) {
        const i = fills[k] * 4
        b[i] = fills[k + 1] * 255
        b[i + 1] = fills[k + 2] * 255
        b[i + 2] = fills[k + 3] * 255
        b[i + 3] = 255
        hole[fills[k]] = 0
      }
      left = next
    }
    for (const i of left) {
      b[i * 4] = skin[0] * 255
      b[i * 4 + 1] = skin[1] * 255
      b[i * 4 + 2] = skin[2] * 255
      b[i * 4 + 3] = 255
    }
    /* 一圈圈补会留下三角形的小块：在补过的地方再松弛几十轮，颜色彼此匀开 */
    const filled = new Uint8Array(W * W)
    for (const i of holes) filled[i] = 1
    const buf = new Float32Array(holes.length * 3)
    for (let it = 0; it < 40; it++) {
      holes.forEach((i, k) => {
        let r = 0
        let g = 0
        let bl = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * W + dx
            if (j === i || (!filled[j] && !skinlike(j))) continue
            r += b[j * 4]
            g += b[j * 4 + 1]
            bl += b[j * 4 + 2]
            n++
          }
        buf[k * 3] = n ? r / n : b[i * 4]
        buf[k * 3 + 1] = n ? g / n : b[i * 4 + 1]
        buf[k * 3 + 2] = n ? bl / n : b[i * 4 + 2]
      })
      holes.forEach((i, k) => {
        b[i * 4] = buf[k * 3]
        b[i * 4 + 1] = buf[k * 3 + 1]
        b[i * 4 + 2] = buf[k * 3 + 2]
      })
    }
  }
  /* 区域蒙版（方形形态学，可分离）：grow = 膨胀，否则腐蚀 */
  const morph = (
    src: Uint8Array,
    w: number,
    h: number,
    R: number,
    grow: boolean,
  ) => {
    const tmp = new Uint8Array(w * h)
    const out = new Uint8Array(w * h)
    const pass = (
      a: Uint8Array,
      o: Uint8Array,
      step: number,
      n: number,
      len: number,
    ) => {
      for (let k = 0; k < len; k++)
        for (let i = 0; i < n; i++) {
          let m = grow ? 0 : 1
          for (let d = -R; d <= R; d++) {
            const val =
              a[
                k * (step === 1 ? n : 1) +
                  Math.min(n - 1, Math.max(0, i + d)) * step
              ]
            m = grow ? m | val : m & val
          }
          o[k * (step === 1 ? n : 1) + i * step] = m
        }
    }
    pass(src, tmp, 1, w, h)
    pass(tmp, out, w, h, w)
    return out
  }
  const mask = (
    c0: Vec2,
    r: Vec2,
    test: (c: Rgb) => boolean,
    fn: (m: Uint8Array, w: number, h: number) => Uint8Array,
  ) => {
    const x0 = c0[0] - r[0] - 12
    const y0 = c0[1] - r[1] - 12
    const w = 2 * r[0] + 25
    const h = 2 * r[1] + 25
    const core = new Uint8Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        core[y * w + x] = test(at(x0 + x, y0 + y)) ? 1 : 0
    const out = fn(core, w, h)
    return (x: number, y: number) => out[(y - y0) * w + (x - x0)] === 1
  }
  const nearLash = (c0: Vec2, r: Vec2) =>
    mask(
      c0,
      r,
      (c) => dist(c, lash) < 0.17,
      (m, w, h) => morph(m, w, h, 9, true),
    )
  /* 头发 = 成片的发色（先腐蚀 2px 再膨胀 4px）：发色几乎正好落在「皮肤→睫毛色」那条线上，单看颜色会把线边当头发 */
  const hairAt = (c0: Vec2, r: Vec2) =>
    mask(c0, r, hairish, (m, w, h) =>
      morph(morph(m, w, h, 2, false), w, h, 4, true),
    )
  const each = (
    c0: Vec2,
    r: Vec2,
    fn: (x: number, y: number, c: Rgb) => void,
  ) => {
    for (let y = c0[1] - r[1]; y <= c0[1] + r[1]; y++)
      for (let x = c0[0] - r[0]; x <= c0[0] + r[0]; x++)
        if (ell(x, y, c0, r) < 1) fn(x, y, at(x, y))
  }
  /* 脸中间那块白色高光：两只眼都睁开后夹在中间很怪，抹掉（只动底，不进 parts）。原图这块是透明的洞，连外圈半透明的一起挖掉 */
  const SX: Vec2 = [Math.round(SR[0] * 1.4), Math.round(SR[1] * 1.4)]
  const hairS = hairAt(SC, SX)
  each(SC, SX, (x, y) => {
    if (!hairS(x, y) && (ell(x, y, SC, SR) < 1 || s[(y * W + x) * 4 + 3] < 248))
      dig(x, y)
  })
  /* 右眼：眼眶里凡不是皮肤都算；外圈只认睫毛线 */
  const nearEye = nearLash(EC, EO)
  const hairE = hairAt(EC, EO)
  each(EC, EO, (x, y, c) => {
    if (ell(x, y, EC, EI) < 1) return put(x, y, split(c))
    if (nearEye(x, y) && !hairE(x, y)) put(x, y, split(c))
  })
  /* 左边那道眨眼弧与原来的嘴：都只认睫毛色的线 */
  const nearArc = nearLash(WC, WR)
  const hairW = hairAt(WC, WR)
  each(WC, WR, (x, y, c) => {
    if (nearArc(x, y) && !hairW(x, y)) put(x, y, split(c))
  })
  const nearMouth = nearLash(MOUTH_C, MOUTH_R)
  const hairM = hairAt(MOUTH_C, MOUTH_R)
  each(MOUTH_C, MOUTH_R, (x, y, c) => {
    if (nearMouth(x, y) && !hairM(x, y)) put(x, y, split(c))
  })
  /* 线外 2–4px 偏粉偏亮的毛边（webp 色度隔行采样）：不挖掉会被当成补皮肤的颜色来源 */
  const fringe = (
    c0: Vec2,
    r: Vec2,
    hairMask: (x: number, y: number) => boolean,
  ) => {
    const x0 = c0[0] - r[0] - 12
    const y0 = c0[1] - r[1] - 12
    const w = 2 * r[0] + 25
    const h = 2 * r[1] + 25
    const m = new Uint8Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) m[y * w + x] = hole[(y0 + y) * W + x0 + x]
    const g = morph(m, w, h, 4, true)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!g[y * w + x] || m[y * w + x] || hairMask(x0 + x, y0 + y)) continue
        if (dist(at(x0 + x, y0 + y), skin) < 0.06) dig(x0 + x, y0 + y)
      }
  }
  fringe(EC, EO, hairE)
  fringe(WC, WR, hairW)
  fringe(MOUTH_C, MOUTH_R, hairM)
  peel()
  return { base: b, parts: p, skin, lash, hair }
}
