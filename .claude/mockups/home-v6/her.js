/* 她：owner 原图（her/her.webp，2000×2000）做本体，像素不重画，全部由代码驱动。
   ─ WebGL：原图铺在 64×64 网格上，耳朵 / 发尾按权重局部变形（连续变形，没有裁切缝）。
     片元里：右眼可眨、可半垂、可瞪大；左眼 = 右眼沿脸的中线镜像过去「造」出来的睁眼，
     原图那只眨眼只在得意 / 调皮时露出来；开心时两眼都换成 ^ ^（右眼借左边眨眼的弧镜像）；腮红可加深。
   ─ SVG 叠层（同一套 2000 坐标）：嘴型库、漫画符号（! ? ♪ z ✦ ♥ 汗滴 /// …）、眼镜。
   ─ 行为：跟着鼠标看、待机时自己找事做、鼠标停在她身上会害羞、久不动会打瞌睡，被惊醒。 */
(function () {
  const SRC = 'her/her.webp'
  const N = 64
  const RC = [1113, 1408], LC = [582, 1302]
  /* 量过原图：右眼深色像素 1010–1326 × 1280–1528（含外侧睫毛尖），眨眼弧 424–720 × 1250–1406，
     脸中间的白色高光 684–888 × 1172–1390；腮红左 (522,1430) 右 (1146,1596)；嘴 764–894 × 1501–1560 */
  const EC = [1160, 1404], EO = [206, 150], EI = [162, 128]
  const WC = [576, 1330], WR = [196, 126]
  const SC = [786, 1281], SR = [124, 130]
  const MOUTH_C = [829, 1530], MOUTH_R = [100, 56]
  /* 右眼里两颗高光（量过原图）：冒星星时先用瞳色盖掉，再在原位画 ✦ */
  const H1 = [1107, 1364, 37], H2 = [1122, 1452, 20]

  /* 载入时在 2000² 原图上把会动的那几样一次抠干净（11-10：以前每个屏幕像素现判「是不是线」，
     头像缩小时走模糊过的 mipmap，线边晕开抠不净，眼睛外留一圈灰点、瞪眼露出旧睫毛、嘴角剩一粒）。
     得到 base（补好皮肤的底）和 parts（右眼 · 眨眼弧 · 原来的嘴，各在原位，带透明度）。
     线和皮肤之间的抗锯齿边按「皮肤→睫毛色」那条线拆出覆盖率，抠下来是半透明的睫毛色；底上的洞从四周的皮肤补。 */
  function prepare(img) {
    const W = 2000
    const cv = document.createElement('canvas'); cv.width = cv.height = W
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, W)
    const s = cx.getImageData(0, 0, W, W).data
    const base = new ImageData(new Uint8ClampedArray(s), W, W), b = base.data
    const parts = new ImageData(W, W), p = parts.data
    const col = i => { const a = s[i + 3] / 255; return [1 - a * (1 - s[i] / 255), 1 - a * (1 - s[i + 1] / 255), 1 - a * (1 - s[i + 2] / 255)] }
    const at = (x, y) => col((y * W + x) * 4)
    const skin = at(680, 1600), lash = at(1190, 1377), hair = at(1000, 700)
    const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])
    const ell = (x, y, c, r) => Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1])
    const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
    const hairish = c => dist(c, hair) < 0.085
    const v = [lash[0] - skin[0], lash[1] - skin[1], lash[2] - skin[2]], vv = v[0] ** 2 + v[1] ** 2 + v[2] ** 2
    /* 一个像素拆成「覆盖率 + 前景色」：落在皮肤—睫毛色那条线上 = 线的抗锯齿边；不在线上 = 眼睛里面的颜色，整块算 */
    const split = c => {
      const t = Math.min(1, Math.max(0, ((c[0] - skin[0]) * v[0] + (c[1] - skin[1]) * v[1] + (c[2] - skin[2]) * v[2]) / vv))
      const r = Math.hypot(c[0] - skin[0] - t * v[0], c[1] - skin[1] - t * v[1], c[2] - skin[2] - t * v[2])
      return r < 0.05 ? [t, lash] : [1, c]
    }
    /* 抠掉的地方先记下来，最后从四周往里一圈圈补（peel）：原图眼睛周围的皮肤带一层很淡的阴影，
       补一个纯色会在眼睛轮廓处留一道接缝（11-10：闭眼 / ^ 眼时露出旧眼形） */
    const hole = new Uint8Array(W * W), holes = []
    const dig = (x, y) => { const i = y * W + x; if (!hole[i]) { hole[i] = 1; holes.push(i) } }
    const put = (x, y, a, E) => {
      /* 很淡的线边也要抠：留着的话眼睛换成 ^ 时会露出一道旧轮廓（11-10 在 720 下看到） */
      if (a < 0.008) return
      const i = (y * W + x) * 4
      p[i] = E[0] * 255; p[i + 1] = E[1] * 255; p[i + 2] = E[2] * 255; p[i + 3] = a * 255
      dig(x, y)
    }
    /* 只从「像皮肤」的邻居取色：皮肤、带阴影的皮肤、腮红（离皮肤约 0.13）算；头发（0.37）和线（0.62）⛔ 算，
       不然头发的粉会顺着补进来拉出条纹。四周一个像样的都没有的，最后用皮肤色兜底 */
    const skinlike = j => {
      const a = b[j * 4 + 3] / 255, c = [1 - a * (1 - b[j * 4] / 255), 1 - a * (1 - b[j * 4 + 1] / 255), 1 - a * (1 - b[j * 4 + 2] / 255)]
      return dist(c, skin) < 0.15 && dist(c, hair) > 0.115 ? c : null
    }
    const peel = () => {
      let left = holes
      while (left.length) {
        const next = [], fills = []
        for (const i of left) {
          let r = 0, g = 0, bl = 0, n = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * W + dx, c = j !== i && !hole[j] ? skinlike(j) : null
            if (c) { r += c[0]; g += c[1]; bl += c[2]; n++ }
          }
          if (n) fills.push(i, r / n, g / n, bl / n); else next.push(i)
        }
        if (!fills.length) break
        for (let k = 0; k < fills.length; k += 4) {
          const i = fills[k] * 4; b[i] = fills[k + 1] * 255; b[i + 1] = fills[k + 2] * 255; b[i + 2] = fills[k + 3] * 255; b[i + 3] = 255; hole[fills[k]] = 0
        }
        left = next
      }
      for (const i of left) { b[i * 4] = skin[0] * 255; b[i * 4 + 1] = skin[1] * 255; b[i * 4 + 2] = skin[2] * 255; b[i * 4 + 3] = 255 }
      /* 一圈圈补会留下三角形的小块：在补过的地方再松弛几十轮，颜色彼此匀开（边界上的原图像素不动） */
      const filled = new Uint8Array(W * W); for (const i of holes) filled[i] = 1
      const buf = new Float32Array(holes.length * 3)
      for (let it = 0; it < 40; it++) {
        holes.forEach((i, k) => {
          let r = 0, g = 0, bl = 0, n = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * W + dx
            if (j === i || (!filled[j] && !skinlike(j))) continue
            r += b[j * 4]; g += b[j * 4 + 1]; bl += b[j * 4 + 2]; n++
          }
          buf[k * 3] = n ? r / n : b[i * 4]; buf[k * 3 + 1] = n ? g / n : b[i * 4 + 1]; buf[k * 3 + 2] = n ? bl / n : b[i * 4 + 2]
        })
        holes.forEach((i, k) => { b[i * 4] = buf[k * 3]; b[i * 4 + 1] = buf[k * 3 + 1]; b[i * 4 + 2] = buf[k * 3 + 2] })
      }
    }
    /* 区域蒙版（方形形态学，可分离）：grow = 膨胀，否则腐蚀 */
    const morph = (src, w, h, R, grow) => {
      const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h)
      const pass = (a, o, step, n, len) => {
        for (let k = 0; k < len; k++) for (let i = 0; i < n; i++) {
          let m = grow ? 0 : 1
          for (let d = -R; d <= R; d++) { const v = a[k * (step === 1 ? n : 1) + Math.min(n - 1, Math.max(0, i + d)) * step]; m = grow ? m | v : m & v }
          o[k * (step === 1 ? n : 1) + i * step] = m
        }
      }
      pass(src, tmp, 1, w, h); pass(tmp, out, w, h, w)
      return out
    }
    const mask = (c0, r, test, fn) => {
      const x0 = c0[0] - r[0] - 12, y0 = c0[1] - r[1] - 12, w = 2 * r[0] + 25, h = 2 * r[1] + 25
      const core = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) core[y * w + x] = test(at(x0 + x, y0 + y)) ? 1 : 0
      const out = fn(core, w, h)
      return (x, y) => out[(y - y0) * w + (x - x0)] === 1
    }
    /* 离睫毛色的线芯 9px 以内：眼眶外圈、弧、嘴只认这一圈 */
    const nearLash = (c0, r) => mask(c0, r, c => dist(c, lash) < 0.17, (m, w, h) => morph(m, w, h, 9, true))
    /* 头发 = 成片的发色（先腐蚀 2px 再膨胀 4px）。⚠ 发色几乎正好落在「皮肤→睫毛色」那条线上（t≈0.41），
       线的抗锯齿边单看颜色就是头发：以前按颜色判头发，眼眶外沿留下一圈没抠的点（11-10 闭眼 / ^ 眼时的虚线轮廓） */
    const hairAt = (c0, r) => mask(c0, r, hairish, (m, w, h) => morph(morph(m, w, h, 2, false), w, h, 4, true))
    const each = (c0, r, fn) => { for (let y = c0[1] - r[1]; y <= c0[1] + r[1]; y++) for (let x = c0[0] - r[0]; x <= c0[0] + r[0]; x++) if (ell(x, y, c0, r) < 1) fn(x, y, at(x, y)) }
    /* 脸中间那块白色高光：两只眼都睁开后夹在中间很怪，抹掉（只动底，不进 parts）。
       ⚠ 原图这块是透明的洞（中心 alpha 21，往外慢慢回到 253），透出白底才显得白：连外圈半透明的一起挖掉、从四周补成不透明的皮肤 */
    const SX = [Math.round(SR[0] * 1.4), Math.round(SR[1] * 1.4)], hairS = hairAt(SC, SX)
    each(SC, SX, (x, y) => { if (!hairS(x, y) && (ell(x, y, SC, SR) < 1 || s[(y * W + x) * 4 + 3] < 248)) dig(x, y) })
    /* 右眼：眼眶里凡不是皮肤都算；外圈只认睫毛线 */
    const nearEye = nearLash(EC, EO), hairE = hairAt(EC, EO)
    each(EC, EO, (x, y, c) => {
      if (ell(x, y, EC, EI) < 1) return put(x, y, ...split(c))
      if (nearEye(x, y) && !hairE(x, y)) put(x, y, ...split(c))
    })
    /* 左边那道眨眼弧与原来的嘴：都只认睫毛色的线 */
    const nearArc = nearLash(WC, WR), hairW = hairAt(WC, WR)
    each(WC, WR, (x, y, c) => { if (nearArc(x, y) && !hairW(x, y)) put(x, y, ...split(c)) })
    const nearMouth = nearLash(MOUTH_C, MOUTH_R), hairM = hairAt(MOUTH_C, MOUTH_R)
    each(MOUTH_C, MOUTH_R, (x, y, c) => { if (nearMouth(x, y) && !hairM(x, y)) put(x, y, ...split(c)) })
    /* 线外还有 2–4px 偏粉偏亮的毛边（webp 色度是隔行采的，颜色从线上渗出来；离皮肤 ~0.03，拆不出覆盖率）。
       不挖掉就会被当成补皮肤的颜色来源，补出来的那块比四周粉一点（11-10 放大 6 倍看到）：一起挖掉，不进 parts */
    const fringe = (c0, r, hairM) => {
      const x0 = c0[0] - r[0] - 12, y0 = c0[1] - r[1] - 12, w = 2 * r[0] + 25, h = 2 * r[1] + 25
      const m = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = hole[(y0 + y) * W + x0 + x]
      const g = morph(m, w, h, 4, true)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!g[y * w + x] || m[y * w + x] || hairM(x0 + x, y0 + y)) continue
        if (dist(at(x0 + x, y0 + y), skin) < 0.06) dig(x0 + x, y0 + y)
      }
    }
    fringe(EC, EO, hairE); fringe(WC, WR, hairW); fringe(MOUTH_C, MOUTH_R, hairM)
    peel()
    return { base, parts, skin, lash, hair }
  }

  const CSS = `
  .her-wrap { position:relative; width:100%; height:100%; transform-origin:50% 80%; animation:her-breathe 3.6s ease-in-out infinite; }
  .her-lean, .her-pop { position:absolute; inset:0; transform-origin:50% 75%; }
  .her-pop { background:#fff; }
  .her-wrap canvas, .her-wrap img, .her-wrap svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
  .her-wrap svg { overflow:visible; pointer-events:none; }
  @keyframes her-breathe { 50% { transform:translateY(-.6%) scale(1.006) } }
  .her-pop.hop { animation:her-hop .6s cubic-bezier(.34,1.6,.64,1); }
  .her-pop.squash { animation:her-squash .5s cubic-bezier(.34,1.6,.64,1); }
  .her-pop.startle { animation:her-startle .55s cubic-bezier(.34,1.6,.64,1); }
  .her-pop.nod { animation:her-nod .42s ease-in-out; }
  .her-pop.spin { animation:her-spin .6s cubic-bezier(.34,1.4,.64,1); }
  @keyframes her-hop { 40% { transform:translateY(-6%) scale(1.02,.98) } 70% { transform:translateY(0) scale(.98,1.02) } }
  @keyframes her-squash { 35% { transform:scale(.92,1.06) } 70% { transform:scale(1.04,.97) } }
  @keyframes her-startle { 25% { transform:translateY(-5%) scale(1.04) } 45% { transform:translateY(-5%) rotate(-3deg) } 65% { transform:translateY(-2%) rotate(3deg) } }
  @keyframes her-nod { 50% { transform:translateY(1.6%) rotate(1.5deg) } }
  @keyframes her-spin { 50% { transform:scale(.86) rotate(-8deg) } }

  .her-mouth > * , .em { opacity:0; }
  [data-mouth=a] .m-a, [data-mouth=e] .m-e, [data-mouth=o] .m-o, [data-mouth=w] .m-w, [data-mouth=wave] .m-wave,
  [data-mouth=grin] .m-grin, [data-mouth=flat] .m-flat, [data-mouth=small] .m-small,
  [data-mouth=purse] .m-purse, [data-mouth=wobble] .m-wobble, [data-mouth=pout] .m-pout { opacity:1; }
  .her-xx { opacity:0; transition:opacity .12s; }
  [data-mood=pout] .her-xx { opacity:1; }
  /* 眼镜常戴（owner 11-06：戴着更可爱），不随性格换 */

  .em * { transform-box:fill-box; transform-origin:50% 50%; }
  .em.on { opacity:1; }
  .em.on > * { animation:em-pop 1.5s cubic-bezier(.22,1,.36,1) both; }
  .em.on > *:nth-child(2) { animation-delay:.12s; } .em.on > *:nth-child(3) { animation-delay:.24s; }
  .em.hold.on > * { animation:em-float 2.4s ease-in-out infinite; }
  .em.hold.on > *:nth-child(2) { animation-delay:.8s; } .em.hold.on > *:nth-child(3) { animation-delay:1.6s; }
  .em-shy.on > * { animation:em-shy 1.6s ease both; }
  @keyframes em-pop { 0% { opacity:0; transform:translateY(12%) scale(.4) } 18% { opacity:1; transform:translateY(0) scale(1.15) } 30% { transform:scale(1) } 75% { opacity:1 } 100% { opacity:0; transform:translateY(-35%) } }
  @keyframes em-float { 0% { opacity:0; transform:translate(0,20%) scale(.6) } 30% { opacity:1 } 100% { opacity:0; transform:translate(25%,-60%) scale(1.1) } }
  @keyframes em-shy { 0%,100% { opacity:0 } 20%,80% { opacity:.9 } }
  /* 一直挂着的三个：干活转圈、委屈的汗、嘟嘴冒气 */
  .em-work.on > * { animation:em-spin 1s linear infinite; }
  .em-drop.on > * { animation:em-drip 2.4s ease-in infinite; }
  .em-huff.on > * { animation:em-huff 1.6s ease-out infinite; }
  .em-huff.on > *:nth-child(2) { animation-delay:.8s; }
  @keyframes em-spin { from { transform:rotate(0) } to { transform:rotate(360deg) } }
  @keyframes em-drip { 0% { opacity:0; transform:translateY(-20%) scale(.7) } 20% { opacity:1; transform:none } 75% { opacity:1; transform:translateY(25%) } 100% { opacity:0; transform:translateY(40%) } }
  @keyframes em-huff { 0% { opacity:0; transform:scale(.3) } 25% { opacity:1; transform:scale(1) } 100% { opacity:0; transform:translate(30%,-45%) scale(1.25) } }
  @media (prefers-reduced-motion: reduce) { .her-wrap, .her-wrap * { animation:none !important; transition:none !important; } }
  `

  const VS = `
  attribute vec2 a; varying vec2 vUv;
  uniform float earL, earR, swayL, swayR, puff;
  vec2 rot(vec2 p, vec2 pv, float ang) { vec2 d = p - pv; float c = cos(ang), s = sin(ang); return pv + vec2(c*d.x - s*d.y, s*d.x + c*d.y); }
  float w(vec2 p, vec2 c, float r) { float k = clamp(1.0 - distance(p, c) / r, 0.0, 1.0); return k*k*(3.0 - 2.0*k); }
  void main() {
    vec2 p = a;
    p = mix(p, rot(p, vec2(.205, .29), earL), w(a, vec2(.135, .171), .20));
    p = mix(p, rot(p, vec2(.735, .445), earR), w(a, vec2(.838, .321), .17));
    p.x += swayR * smoothstep(.74, .96, a.y) * smoothstep(.50, .60, a.x) * (a.y - .74);
    p.x += swayL * smoothstep(.70, .96, a.y) * (1.0 - smoothstep(.20, .28, a.x)) * (a.y - .70);
    /* 嘟嘴：右边腮帮子往右下鼓（量过：脸和头发的分界从 (1296,1560) 斜到 (1116,1740)） */
    p += puff * w(a, vec2(.605, .825), .085) * vec2(.024, .02);
    vUv = a;
    gl_Position = vec4(p.x*2.0 - 1.0, 1.0 - p.y*2.0, 0.0, 1.0);
  }`

  const FS = `
  precision highp float; varying vec2 vUv;
  /* base = 原图抠掉右眼、左边眨眼弧、原来的嘴、脸中间高光后补好皮肤的底；
     parts = 抠下来的那几样（预乘 alpha，各在原图位置）。都是载入时在 2000² 原图上算好的（prepare）。 */
  uniform sampler2D base; uniform sampler2D parts;
  uniform vec3 skin, lash, hair;
  uniform float lidR, lidL, winkL, happy, wide, blush, mouthErase, px1, clear, star, tw, shut, slant, wet;
  const vec2 RC = vec2(${RC[0]}.0, ${RC[1]}.0);
  const vec2 LC = vec2(${LC[0]}.0, ${LC[1]}.0);
  const vec2 EC = vec2(${EC[0]}.0, ${EC[1]}.0);
  const vec2 EO = vec2(${EO[0]}.0, ${EO[1]}.0);
  const vec2 WC = vec2(${WC[0]}.0, ${WC[1]}.0);
  const vec2 WR = vec2(${WR[0]}.0, ${WR[1]}.0);
  const vec2 MC = vec2(${MOUTH_C[0]}.0, ${MOUTH_C[1]}.0);
  const vec2 MR = vec2(${MOUTH_R[0]}.0, ${MOUTH_R[1]}.0);
  const vec3 H1 = vec3(${H1[0]}.0, ${H1[1]}.0, ${H1[2]}.0);
  const vec3 H2 = vec3(${H2[0]}.0, ${H2[1]}.0, ${H2[2]}.0);
  float aa;
  /* 原图背景是透明的：一律先压到白底上再用 */
  vec3 at(vec2 p) { vec4 t = texture2D(base, p / 2000.0); return mix(vec3(1.0), t.rgb, t.a); }
  vec4 part(vec2 p) { return texture2D(parts, p / 2000.0); }
  float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r); }
  float inside(vec2 p, vec2 c, vec2 r) { return 1.0 - smoothstep(0.9, 1.0, ell(p, c, r)); }
  /* 沿脸的中线（两眼连线的垂直平分线）镜像：LC ↔ RC */
  vec2 mirror(vec2 p) { vec2 n = normalize(RC - LC); vec2 m = (RC + LC) * 0.5; return p - 2.0 * dot(p - m, n) * n; }
  float hairness(vec3 c) { return 1.0 - smoothstep(0.05, 0.12, distance(c, hair)); }
  vec3 over(vec3 c, vec4 p) { return p.rgb + c * (1.0 - p.a); }
  /* ✦：四角星（|x|^0.6 + |y|^0.6 < 1） */
  float sparkle(vec2 d, float R) {
    vec2 a = max(abs(d) / R, vec2(1e-4));
    return 1.0 - smoothstep(1.0 - 3.0 * aa / R, 1.0, pow(a.x, 0.6) + pow(a.y, 0.6));
  }
  /* 右眼在 p 处的样子（预乘）：可瞪大（wd）、可垂眼皮（lid） */
  vec4 eyeR(vec2 p, float lid, float wd) {
    vec2 q = RC + (p - RC) / wd;
    float m = inside(q, EC, EO);
    if (m <= 0.0) return vec4(0.0);
    vec4 e = part(q) * m;
    /* 冒星星：两颗圆高光先用瞳色盖掉，原位画一大一小两颗 ✦，一闪一闪 */
    if (star > 0.01) {
      float h = max(1.0 - smoothstep(H1.z + 3.0, H1.z + 8.0, length(q - H1.xy)), 1.0 - smoothstep(H2.z + 3.0, H2.z + 8.0, length(q - H2.xy)));
      e = mix(e, vec4(lash, 1.0), h * star * m);
      float k = 1.0 + 0.14 * sin(tw * 5.0);
      /* 大星在瞳孔正中，小星在右上角，都不出瞳孔（星和皮肤同色，出界就像瞳孔被劈开） */
      float s = max(sparkle(q - vec2(1112.0, 1404.0), 100.0 * k), sparkle(q - vec2(1166.0, 1334.0), 32.0 * (2.0 - k)));
      e = mix(e, vec4(1.0, 0.985, 0.95, 1.0), s * star * m);
    }
    /* 委屈：瞳孔下沿一道晃动的水光 */
    if (wet > 0.01) {
      vec2 d = (q - vec2(1112.0, 1418.0)) / vec2(80.0, 84.0);
      float r = length(d) - 1.0 + 0.035 * sin(atan(d.y, d.x) * 9.0 + tw * 4.0);
      float band = (1.0 - smoothstep(0.06, 0.06 + 2.0 * aa / 80.0, abs(r))) * smoothstep(0.3, 0.7, d.y / max(length(d), 1e-3));
      e = mix(e, vec4(1.0, 0.985, 0.95, 1.0), band * wet * e.a);
    }
    if (lid > 0.02) {
      float u = clamp((q.x - RC.x) / 178.0, -1.0, 1.0);
      /* slant > 0：外眼角那头压得更低，眼皮成「八」字（委屈） */
      float yl = 1283.0 + lid * (1515.0 - 1283.0) + 30.0 * lid * (1.0 - u*u) + slant * u * 90.0;
      e *= smoothstep(yl - aa, yl + aa, q.y);
      float th = (4.0 + 13.0 * (1.0 - u*u)) * min(1.0, max(lid, abs(slant) * 0.5) * 1.6);
      float st = (1.0 - smoothstep(th - aa, th + aa, abs(q.y - yl))) * (1.0 - smoothstep(0.80, 0.95, abs(u))) * m;
      e = mix(e, vec4(lash, 1.0), st);
    }
    return e;
  }
  void main() {
    vec2 px = vUv * 2000.0;
    aa = px1 * 1.5;
    vec3 c = at(px), c0 = c;
    /* 右眼：睁着 = 抠下来的那只（可瞪大 / 垂眼皮）；开心 = 左边那道眨眼弧镜像过来 */
    if (ell(px, EC, EO * 1.3) < 1.0) {
      vec4 e = eyeR(px, lidR, wide);
      vec2 s = mirror(px);
      vec4 arc = part(s) * inside(s, WC, WR);
      c = mix(over(c, e), over(c, arc), happy);
    }
    /* 左眼：右眼沿中线镜像过来的睁眼（小一点）；眨眼 / 开心时露回原图那道弧 */
    if (ell(px, LC, EO * 1.3) < 1.0 || ell(px, WC, WR) < 1.0) {
      vec2 s = RC + (mirror(px) - RC) / 0.93;
      /* 镜像过来的外侧睫毛尖别画到头发上 */
      vec4 e = eyeR(s, lidL, wide) * (1.0 - hairness(c));
      vec4 arc = part(px) * inside(px, WC, WR);
      c = mix(over(c, e), over(c, arc), max(winkL, happy));
    }
    /* > <：眼睛整个收掉（底上眼睛早抠干净了），由 SVG 画 > < */
    c = mix(c, c0, shut);
    /* 原图那张笑嘴：换嘴型时隐去 */
    if (mouthErase < 0.99 && ell(px, MC, MR) < 1.0) c = over(c, part(px) * inside(px, MC, MR) * (1.0 - mouthErase));
    /* 腮红加深 */
    if (blush > 0.01) {
      float m = max(1.0 - smoothstep(0.6, 1.0, ell(px, vec2(1146.0, 1596.0), vec2(95.0, 60.0))),
                    1.0 - smoothstep(0.6, 1.0, ell(px, vec2(522.0, 1430.0), vec2(98.0, 64.0))));
      c = mix(c, vec3(0.97, 0.58, 0.64), m * blush * 0.55);
    }
    /* 透明底（全身用）：把压过白底的颜色还原成预乘 alpha */
    float A = mix(1.0, texture2D(base, px / 2000.0).a, clear);
    gl_FragColor = vec4(max(c - vec3(1.0 - A), 0.0), A);
  }`

  const MC = '#c9577a', MD = '#b4446a', TG = '#f4a3b4', EM = '#e2718f', LS = '#d06a89'
  const OVERLAY = `
  <svg viewBox="0 0 2000 2000" aria-hidden="true">
    <g class="her-mouth" stroke-linecap="round" stroke-linejoin="round">
      <g class="m-a"><path d="M772 1500 Q830 1494 888 1500 Q880 1596 830 1600 Q780 1596 772 1500Z" fill="${MD}"/><path d="M795 1570 Q830 1548 865 1570 Q850 1597 830 1598 Q810 1597 795 1570Z" fill="${TG}"/></g>
      <g class="m-e"><path d="M762 1508 Q830 1498 898 1508 Q880 1562 830 1566 Q780 1562 762 1508Z" fill="${MD}"/></g>
      <g class="m-o"><ellipse cx="830" cy="1538" rx="32" ry="40" fill="${MD}"/></g>
      <g class="m-small"><ellipse cx="830" cy="1532" rx="20" ry="16" fill="${MD}"/></g>
      <path class="m-w" d="M758 1508 Q772 1566 814 1532 Q830 1516 846 1532 Q888 1566 902 1508" fill="none" stroke="${MC}" stroke-width="22"/>
      <path class="m-wave" d="M762 1534 Q786 1506 810 1534 T858 1534 T906 1534" fill="none" stroke="${MC}" stroke-width="20"/>
      <g class="m-grin"><path d="M750 1490 Q830 1484 910 1490 Q902 1622 830 1628 Q758 1622 750 1490Z" fill="${MD}"/><path d="M788 1586 Q830 1556 872 1586 Q856 1626 830 1627 Q804 1626 788 1586Z" fill="${TG}"/></g>
      <path class="m-flat" d="M786 1534 Q830 1527 874 1533" fill="none" stroke="${MC}" stroke-width="20"/>
      <path class="m-purse" d="M808 1534 Q830 1527 852 1534" fill="none" stroke="${MC}" stroke-width="18"/>
      <path class="m-wobble" d="M786 1544 Q800 1528 814 1544 T842 1544 T870 1544" fill="none" stroke="${MC}" stroke-width="16"/>
      <path class="m-pout" d="M812 1546 Q838 1522 866 1542" fill="none" stroke="${MC}" stroke-width="18"/>
    </g>
    <g class="her-xx" fill="none" stroke="${LS}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
      <path d="M512 1236 L654 1302 L512 1368" transform="rotate(11.3 582 1302)"/>
      <path d="M1183 1342 L1041 1408 L1183 1474" transform="rotate(11.3 1113 1408)"/>
    </g>
    <g class="her-glasses" fill="none" stroke="#8a5a6c" stroke-width="22">
      <circle cx="${RC[0]}" cy="${RC[1] - 8}" r="190"/><circle cx="${LC[0]}" cy="${LC[1] - 6}" r="182"/><path d="M760 1350 Q840 1305 925 1370"/>
    </g>
    <g class="em em-shy" stroke="${EM}" stroke-width="16" stroke-linecap="round">
      <path d="M1090 1556 L1066 1620"/><path d="M1140 1556 L1116 1620"/><path d="M1190 1556 L1166 1620"/>
      <path d="M462 1412 L438 1476"/><path d="M512 1412 L488 1476"/><path d="M562 1412 L538 1476"/>
    </g>
    <g class="em em-bang"><g fill="#ff8a5c"><path d="M1795 300 L1865 300 L1846 560 L1814 560Z"/><circle cx="1830" cy="640" r="38"/></g></g>
    <g class="em em-q"><text x="1650" y="640" font-size="360" font-weight="700" fill="#8fa7e8" font-family="-apple-system,sans-serif">?</text></g>
    <g class="em em-note hold" fill="${EM}" font-family="-apple-system,sans-serif" font-weight="700">
      <text x="1700" y="420" font-size="230">♪</text><text x="1820" y="300" font-size="200">♫</text><text x="1640" y="260" font-size="170">♪</text>
    </g>
    <g class="em em-z hold" fill="#9aa8d6" font-family="-apple-system,sans-serif" font-weight="800">
      <text x="1700" y="430" font-size="170">z</text><text x="1800" y="300" font-size="220">z</text><text x="1700" y="170" font-size="260">Z</text>
    </g>
    <g class="em em-dots hold" fill="#c9a3b2"><circle cx="1660" cy="380" r="40"/><circle cx="1770" cy="260" r="50"/><circle cx="1890" cy="140" r="58"/></g>
    <g class="em em-spark" fill="#ffc94d">
      <path d="M1800 760 L1828 846 L1914 874 L1828 902 L1800 988 L1772 902 L1686 874 L1772 846Z"/>
      <path d="M1880 1040 L1896 1088 L1944 1104 L1896 1120 L1880 1168 L1864 1120 L1816 1104 L1864 1088Z"/>
      <path d="M1730 1150 L1742 1186 L1778 1198 L1742 1210 L1730 1246 L1718 1210 L1682 1198 L1718 1186Z"/>
    </g>
    <g class="em em-heart" fill="#ff7d9c">
      <path d="M1800 520 C1800 440 1700 430 1700 510 C1700 580 1800 630 1800 660 C1800 630 1900 580 1900 510 C1900 430 1800 440 1800 520Z"/>
      <path d="M1880 300 C1880 255 1825 250 1825 295 C1825 335 1880 362 1880 380 C1880 362 1935 335 1935 295 C1935 250 1880 255 1880 300Z"/>
    </g>
    <g class="em em-sweat"><path d="M1830 640 Q1900 760 1850 800 Q1790 820 1790 760 Q1790 720 1830 640Z" fill="#a9d4f2"/></g>
    <g class="em em-work"><circle cx="1790" cy="360" r="74" fill="none" stroke="#c9a3b2" stroke-width="28" stroke-linecap="round" stroke-dasharray="300 165"/></g>
    <g class="em em-drop"><path d="M1420 1100 Q1476 1196 1444 1232 Q1400 1250 1396 1204 Q1394 1166 1420 1100Z" fill="#a9d4f2"/></g>
    <g class="em em-huff" fill="#ddc8d0">
      <g><circle cx="1640" cy="470" r="44"/><circle cx="1700" cy="430" r="58"/><circle cx="1768" cy="468" r="46"/></g>
      <g><circle cx="1700" cy="380" r="34"/><circle cx="1748" cy="350" r="44"/><circle cx="1800" cy="380" r="36"/></g>
    </g>
  </svg>`

  /* 情绪 → 各通道的目标值。耳朵正值 = 顺时针：左耳顺时针 = 竖起，右耳逆时针 = 竖起 */
  const MOODS = {
    idle:    { ear: [0, 0],       lid: 0,   wide: 1,    happy: 0, wink: 0, blush: 0,   mouth: 'smile' },
    happy:   { ear: [.08, -.08],  lid: 0,   wide: 1,    happy: 1, wink: 0, blush: .8,  mouth: 'w', wiggle: 1 },
    gulp:    { ear: [.16, -.16],  lid: 0,   wide: 1.13, happy: 0, wink: 0, blush: .2,  mouth: 'o', lean: 1.8 },
    think:   { ear: [-.04, .24],  lid: .1,  wide: 1,    happy: 0, wink: 0, blush: 0,   mouth: 'small', tilt: -7 },
    talk:    { ear: [.04, -.04],  lid: 0,   wide: 1,    happy: 0, wink: 0, blush: .15, mouth: 'smile' },
    proud:   { ear: [.12, -.12],  lid: 0,   wide: 1,    happy: 0, wink: 1, blush: .6,  mouth: 'grin', wiggle: .7 },
    sleepy:  { ear: [-.2, .2],    lid: .82, wide: 1,    happy: 0, wink: 0, blush: 0,   mouth: 'small', nod: 1 },
    /* 11-10 加：读卡（头左右扫）· 干活（低头、抿嘴、转圈）· 冒星星 · 等你点头 · 委屈（八字眼、汗）· 嘟嘴（> <、鼓腮、冒气） */
    read:    { ear: [.04, -.04],  lid: .16, wide: 1,    happy: 0, wink: 0, blush: 0,   mouth: 'small', still: 1 },
    work:    { ear: [0, 0],       lid: .18, wide: 1,    happy: 0, wink: 0, blush: 0,   mouth: 'purse', tilt: 3, dip: 2.2, still: 1 },
    wow:     { ear: [.18, -.18],  lid: 0,   wide: 1.12, happy: 0, wink: 0, blush: .75, mouth: 'a', star: 1, wiggle: .5 },
    ask:     { ear: [.1, -.1],    lid: 0,   wide: 1.03, happy: 0, wink: 0, blush: .2,  mouth: 'smile', tilt: 6 },
    sad:     { ear: [-.24, .24],  lid: .06, wide: 1.04, happy: 0, wink: 0, blush: 0,   mouth: 'wobble', slant: .9, wet: 1, dip: 1.4 },
    pout:    { ear: [-.1, .1],    lid: 0,   wide: 1,    happy: 0, wink: 0, blush: .9,  mouth: 'pout', shut: 1, puff: 1, tilt: -4 },
  }
  const TONES = { friendly: { amp: 1, lid: 0, idleMouth: 'smile' }, pro: { amp: .6, lid: 0, idleMouth: 'smile' }, terse: { amp: .4, lid: .38, idleMouth: 'flat' } }

  let styled = false
  /* opts.still：检查用，关掉眨眼 / 小动作 / 跟鼠标 / 犯困，只停在指定情绪上；
     opts.res：检查用，按这个分辨率渲染，放大显示时能看清真实头像尺寸下的像素；
     opts.transparent：透明底，头下面接身体用；opts.extra：额外 SVG（2000 坐标），跟着头一起动 */
  function mount(host, opts = {}) {
    if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); styled = true }
    host.innerHTML = `<div class="her-wrap" data-tone="friendly" data-mood="idle" data-mouth="smile"><div class="her-lean"><div class="her-pop"><canvas></canvas>${opts.extra ? OVERLAY.replace('</svg>', opts.extra + '</svg>') : OVERLAY}</div></div></div>`
    const wrap = host.firstChild, lean = wrap.querySelector('.her-lean'), popEl = wrap.querySelector('.her-pop'), canvas = wrap.querySelector('canvas')
    const reduce = opts.still || matchMedia('(prefers-reduced-motion: reduce)').matches
    if (opts.transparent) popEl.style.background = 'transparent'
    const gl = canvas.getContext('webgl', { antialias: true })

    let mood = 'idle', tone = 'friendly', hovered = false, lastActive = performance.now()
    const st = { earL: 0, earR: 0, lidR: 0, lidL: 0, wide: 1, happy: 0, wink: 0, blush: 0, erase: 0, lx: 0, ly: 0, rot: 0, star: 0, shut: 0, slant: 0, puff: 0, wet: 0 }
    const act = { until: 0, kind: null, dir: [0, 0] }
    let blinkUntil = 0, blinkL = false, nextBlink = 1200, nextAct = 2500, talkMouth = null, flick = { until: 0, side: 0 }
    const pointer = { x: 0, y: 0, seen: false }

    function pop(name) { popEl.classList.remove('hop', 'squash', 'startle', 'nod', 'spin'); void popEl.offsetWidth; popEl.classList.add(name) }
    function emote(name, ms = 1500) {
      const el = wrap.querySelector('.em-' + name); if (!el) return
      el.classList.remove('on'); void el.getBoundingClientRect(); el.classList.add('on')
      clearTimeout(el._t); if (ms) el._t = setTimeout(() => el.classList.remove('on'), ms)
    }
    function hold(name, on) { const el = wrap.querySelector('.em-' + name); if (el) { clearTimeout(el._t); el.classList.toggle('on', on) } }

    function setMood(m) {
      if (m === mood) return
      const prev = mood; mood = m; talkMouth = null; wrap.dataset.mood = m
      hold('dots', m === 'think'); hold('z', m === 'sleepy'); hold('note', false)
      hold('work', m === 'work'); hold('drop', m === 'sad'); hold('huff', m === 'pout')
      if (m === 'wow') { pop('hop'); emote('spark', 1600) }
      if (m === 'ask') { pop('nod'); emote('q', 1400) }
      if (m === 'sad') pop('nod')
      if (m === 'pout') pop('squash')
      if (m === 'gulp') { emote('bang'); pop('squash') }
      if (m === 'proud') { pop('hop'); emote(tone === 'terse' ? 'spark' : (Math.random() < .5 ? 'heart' : 'spark'), 1800) }
      if (m === 'happy' && tone !== 'terse') emote('heart', 1400)
      if (prev === 'sleepy' && m !== 'sleepy') { pop('startle'); emote('bang', 1100); st.wide = 1.2 }
    }

    addEventListener('pointermove', e => {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; lastActive = performance.now()
      if (mood === 'sleepy') setMood(hovered ? 'happy' : 'idle')
    }, { passive: true })
    host.addEventListener('pointerenter', () => { hovered = true; if (mood === 'idle' || mood === 'sleepy') { setMood('happy'); if (tone === 'friendly') emote('shy', 1600) } })
    host.addEventListener('pointerleave', () => { hovered = false; if (mood === 'happy') setMood('idle') })

    /* 待机小动作：按性格挑，友好最多花样，简洁几乎只眨眼 */
    const ACTS = {
      friendly: ['look', 'look', 'flick', 'double', 'hum', 'wink', 'shy', 'tilt'],
      pro: ['look', 'look', 'flick', 'double', 'tilt'],
      terse: ['look', 'flick', 'double'],
    }
    function idleAct(now, pick) {
      const list = ACTS[tone], kind = pick || list[Math.floor(Math.random() * list.length)]
      act.kind = kind; act.until = now + ({ look: 1500, hum: 2200, wink: 1100, shy: 1600, tilt: 1300 }[kind] || 0)
      if (kind === 'look') act.dir = [Math.random() * 2 - 1, Math.random() * 1.2 - .7]
      if (kind === 'flick') flick = { until: now + 260, side: Math.random() < .5 ? 0 : 1 }
      if (kind === 'double') { blinkUntil = now + 130; setTimeout(() => { blinkUntil = performance.now() + 130 }, 260) }
      if (kind === 'hum') hold('note', true), setTimeout(() => hold('note', false), 2200)
      if (kind === 'wink') emote('spark', 1100)
      if (kind === 'shy') emote('shy', 1600)
    }

    if (!gl) { canvas.replaceWith(Object.assign(new Image(), { src: SRC })); return api() }

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s }
    const prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog)
    const verts = [], idx = []
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) verts.push(x / N, y / N)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * (N + 1) + x; idx.push(i, i + 1, i + N + 1, i + 1, i + N + 2, i + N + 1) }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW)
    const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
    const U = {}; ['earL', 'earR', 'swayL', 'swayR', 'lidR', 'lidL', 'winkL', 'happy', 'wide', 'blush', 'mouthErase', 'px1', 'clear', 'base', 'parts', 'skin', 'lash', 'hair', 'star', 'tw', 'shut', 'slant', 'puff', 'wet'].forEach(n => U[n] = gl.getUniformLocation(prog, n))

    /* 2000 不是 2 的幂：画进 2048 再上传，才能开 mipmap，缩到头像尺寸不闪。
       parts 按预乘上传：mipmap 在预乘空间里平均，半透明的线边缩小后不发灰不留圈 */
    function upload(unit, data, premultiply) {
      const src = document.createElement('canvas'); src.width = src.height = 2000
      src.getContext('2d').putImageData(data, 0, 0)
      const pot = document.createElement('canvas'); pot.width = pot.height = 2048
      pot.getContext('2d').drawImage(src, 0, 0, 2048, 2048)
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pot)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }

    const img = new Image()
    img.onload = () => {
      const prep = prepare(img)
      upload(0, prep.base, false); upload(1, prep.parts, true)
      gl.uniform1i(U.base, 0); gl.uniform1i(U.parts, 1)
      gl.uniform3fv(U.skin, prep.skin); gl.uniform3fv(U.lash, prep.lash); gl.uniform3fv(U.hair, prep.hair)
      requestAnimationFrame(frame)
    }
    img.src = SRC

    let last = performance.now()
    function frame(now) {
      const dt = Math.min(50, now - last); last = now
      const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr)
      const RW = opts.res || W, RH = opts.res || H
      if (RW && (canvas.width !== RW || canvas.height !== RH)) { canvas.width = RW; canvas.height = RH }
      gl.viewport(0, 0, canvas.width, canvas.height)
      const T = TONES[tone], M = MOODS[mood], amp = T.amp, t = reduce ? 0 : now / 1000

      if (!reduce) {
        /* 眨眼：偶尔只眨一只，偶尔连眨两下（连眨归在小动作里） */
        nextBlink -= dt
        if (nextBlink <= 0) { if (mood !== 'proud' && mood !== 'happy' && mood !== 'pout') { blinkUntil = now + 130; blinkL = Math.random() < .12 } nextBlink = 2200 + Math.random() * 3200 }
        if (mood === 'idle') {
          nextAct -= dt
          if (nextAct <= 0) { idleAct(now); nextAct = (3200 + Math.random() * 3800) / Math.max(.5, amp) }
          if (now - lastActive > 20000) setMood('sleepy')
        }
      }
      const acting = mood === 'idle' && now < act.until ? act.kind : null

      /* 目标值 */
      let eL = M.ear[0] * amp, eR = M.ear[1] * amp
      if (M.wiggle && !reduce) { eL += Math.sin(t * 9) * .07 * M.wiggle * amp; eR += Math.sin(t * 9 + 1.5) * .07 * M.wiggle * amp }
      if (mood === 'work' && !reduce && now > flick.until + 1400 && Math.random() < dt / 1200) flick = { until: now + 260, side: Math.random() < .5 ? 0 : 1 }
      if (now < flick.until) { if (flick.side === 0) eL += .22; else eR -= .22 }
      if (mood === 'talk' && !reduce) { eL += Math.sin(t * 6) * .03; eR += Math.sin(t * 6 + 1) * .03 }
      const blinking = now < blinkUntil
      let lidBase = Math.max(M.lid, mood === 'idle' || mood === 'talk' ? T.lid : 0)
      if (mood === 'sleepy') lidBase = .78 + Math.sin(t * .9) * .12
      const lR = blinking && !blinkL ? 1 : lidBase
      const lL = blinking ? 1 : lidBase
      let hap = M.happy, wink = M.wink, bl = M.blush, wide = M.wide
      if (acting === 'hum') { hap = 1; bl = .4 }
      if (acting === 'wink') { wink = 1; bl = .4 }
      if (acting === 'shy') { bl = 1 }
      let mouth = M.mouth
      if (mood === 'idle') mouth = acting === 'hum' ? 'w' : acting === 'wink' ? 'w' : acting === 'shy' ? 'small' : T.idleMouth
      if (mood === 'talk' && talkMouth) mouth = talkMouth
      if (mood === 'happy' && tone === 'terse') { hap = .0; mouth = 'smile'; bl = .3 }

      /* 头：跟着鼠标看，思考歪头，瞌睡点头，待机小动作 */
      let tx = 0, ty = M.dip || 0, rt = M.tilt || 0
      if (!opts.still && pointer.seen && mood !== 'sleepy' && mood !== 'think' && !M.still) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        const dx = Math.max(-1, Math.min(1, (pointer.x - cx) / 500)), dy = Math.max(-1, Math.min(1, (pointer.y - cy) / 400))
        const k = (M.lean || 1) * amp
        tx = dx * 3 * k; ty += dy * 2 * k; rt += dx * 4 * k
      }
      if (acting === 'look') { tx = act.dir[0] * 4 * amp; ty = act.dir[1] * 2.5 * amp; rt = act.dir[0] * 5 * amp }
      if (acting === 'tilt') { rt = (Math.sin(t * 2.2) > 0 ? 1 : -1) * 6 * amp }
      if (acting === 'hum') { rt = Math.sin(t * 4) * 5 * amp }
      if (mood === 'sleepy' && !reduce) { ty = 2 + Math.sin(t * 1.1) * 1.6; rt = 4 + Math.sin(t * 1.1) * 3 }
      /* 读卡：头跟着一行行字左右扫 */
      if (mood === 'read' && !reduce) { const sw = Math.sin(t * 2.4); tx = sw * 2.6 * amp; rt = sw * 3 * amp; ty = .8 + Math.abs(Math.cos(t * 1.2)) * .6 }

      const k = 1 - Math.pow(.001, dt / 1000 * (reduce ? 60 : 8))
      const ease = (key, v, s = 1) => { st[key] += (v - st[key]) * Math.min(1, k * s) }
      ease('earL', eL); ease('earR', eR)
      ease('lidR', lR, lR > st.lidR ? 3.2 : 1.6); ease('lidL', lL, lL > st.lidL ? 3.2 : 1.6)
      ease('wide', wide, 1.4); ease('happy', hap, 2); ease('wink', wink, 2.4); ease('blush', bl, .8)
      ease('lx', tx, .7); ease('ly', ty, .7); ease('rot', rt, .7)
      ease('star', M.star || 0, 1.6); ease('shut', M.shut || 0, 3); ease('slant', M.slant || 0, 1.2); ease('wet', M.wet || 0, 1.2); ease('puff', (M.puff || 0) * (.85 + (reduce ? 0 : Math.sin(t * 3) * .15)), 1.4)
      const erase = mouth === 'smile' ? 0 : 1
      st.erase = erase
      wrap.dataset.mouth = mouth
      lean.style.transform = `translate(${st.lx.toFixed(2)}%, ${st.ly.toFixed(2)}%) rotate(${st.rot.toFixed(2)}deg) scale(${(1 + Math.abs(st.rot) * .006).toFixed(3)})`

      gl.uniform1f(U.earL, st.earL); gl.uniform1f(U.earR, st.earR)
      gl.uniform1f(U.swayL, Math.sin(t * 1.4) * .05 * amp); gl.uniform1f(U.swayR, Math.sin(t * 1.4 + 1.6) * .06 * amp)
      gl.uniform1f(U.lidR, st.lidR); gl.uniform1f(U.lidL, st.lidL); gl.uniform1f(U.winkL, st.wink)
      gl.uniform1f(U.happy, st.happy); gl.uniform1f(U.wide, st.wide); gl.uniform1f(U.blush, st.blush)
      gl.uniform1f(U.mouthErase, st.erase); gl.uniform1f(U.px1, 2000 / Math.max(1, canvas.width))
      gl.uniform1f(U.clear, opts.transparent ? 1 : 0)
      gl.uniform1f(U.star, st.star); gl.uniform1f(U.tw, t); gl.uniform1f(U.shut, st.shut); gl.uniform1f(U.slant, st.slant); gl.uniform1f(U.puff, st.puff); gl.uniform1f(U.wet, st.wet)
      const bg = opts.transparent ? 0 : 1; gl.clearColor(bg, bg, bg, bg); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
      requestAnimationFrame(frame)
    }

    function api() {
      return {
        mood(m) { lastActive = performance.now(); setMood(m) },
        tone(tn) { if (tn === tone) return; tone = tn; wrap.dataset.tone = tn; pop('spin'); emote(tn === 'terse' ? 'q' : 'spark', 1200) },
        /* 说话时每打一个字调一次：换口型，标点闭嘴，句末点一下头 */
        mouth(ch) {
          if (/[。！？!?]/.test(ch)) { talkMouth = 'smile'; pop('nod') }
          else if (/[，、～…\s,.]/.test(ch)) talkMouth = 'smile'
          else talkMouth = talkMouth && talkMouth !== 'smile' && Math.random() < .45 ? 'smile' : ['a', 'e', 'o', 'a', 'e', 'small'][Math.floor(Math.random() * 6)]
        },
        emote, pop,
        /* 表情板用：立刻做一个待机小动作（look · flick · double · hum · wink · shy · tilt） */
        act(kind) { if (mood !== 'idle') setMood('idle'); lastActive = performance.now(); idleAct(performance.now(), kind) },
        sleep() { setMood('sleepy') },
      }
    }
    return api()
  }
  window.Her = { mount }
})()
