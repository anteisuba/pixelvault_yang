/**
 * 首页 v6 左下角的「她」：一张头像原图（`/homepage/v6/her.webp`，2000×2000）做本体，
 * 像素不重画，表情和动作全由代码驱动。从小样 `.claude/mockups/home-v6/her.js` 搬来。
 * 原图离线烘焙成底 / 五官层 / 静态图（`scripts/bake-home-her.mjs`），运行时只读烘焙结果。
 *
 * - WebGL：底图铺在 64×64 网格上，耳朵 / 发尾按权重局部变形；片元里眨眼、垂眼、瞪大、
 *   开心时换成 ^ ^、腮红加深。首帧和不支持 WebGL 时是一张静态图。
 * - SVG 叠层（同一套 2000 坐标）：嘴型、漫画符号、眼镜。
 * - 长相规则在 `src/app/home-v6.css` 的 `.her-wrap` 一族里。
 */

import { HER_COLORS } from './her-colors'
import { EC, EO, MOUTH_C, MOUTH_R, WC, WR } from './her-geometry'

const N = 64
const RC = [1113, 1408] as const
const LC = [582, 1302] as const
/* 右眼里两颗高光：冒星星时先用瞳色盖掉，再在原位画 ✦ */
const H1 = [1107, 1364, 37] as const
const H2 = [1122, 1452, 20] as const

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
     parts = 抠下来的那几样（预乘 alpha，各在原图位置）。都是离线在 2000² 原图上烘焙好的（her-bake.ts）。 */
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

const MC = '#c9577a'
const MD = '#b4446a'
const TG = '#f4a3b4'
const EM = '#e2718f'
const LS = '#d06a89'
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

export type HerMood =
  | 'idle'
  | 'happy'
  | 'gulp'
  | 'think'
  | 'talk'
  | 'proud'
  | 'sleepy'
  | 'read'
  | 'work'
  | 'wow'
  | 'ask'
  | 'sad'
  | 'pout'

interface MoodSpec {
  ear: [number, number]
  lid: number
  wide: number
  happy: number
  wink: number
  blush: number
  mouth: string
  wiggle?: number
  lean?: number
  tilt?: number
  nod?: number
  still?: number
  dip?: number
  star?: number
  slant?: number
  wet?: number
  shut?: number
  puff?: number
}

/* 情绪 → 各通道的目标值。耳朵正值 = 顺时针：左耳顺时针 = 竖起，右耳逆时针 = 竖起 */
const MOODS: Record<HerMood, MoodSpec> = {
  idle: {
    ear: [0, 0],
    lid: 0,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0,
    mouth: 'smile',
  },
  happy: {
    ear: [0.08, -0.08],
    lid: 0,
    wide: 1,
    happy: 1,
    wink: 0,
    blush: 0.8,
    mouth: 'w',
    wiggle: 1,
  },
  gulp: {
    ear: [0.16, -0.16],
    lid: 0,
    wide: 1.13,
    happy: 0,
    wink: 0,
    blush: 0.2,
    mouth: 'o',
    lean: 1.8,
  },
  think: {
    ear: [-0.04, 0.24],
    lid: 0.1,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0,
    mouth: 'small',
    tilt: -7,
  },
  talk: {
    ear: [0.04, -0.04],
    lid: 0,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0.15,
    mouth: 'smile',
  },
  proud: {
    ear: [0.12, -0.12],
    lid: 0,
    wide: 1,
    happy: 0,
    wink: 1,
    blush: 0.6,
    mouth: 'grin',
    wiggle: 0.7,
  },
  sleepy: {
    ear: [-0.2, 0.2],
    lid: 0.82,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0,
    mouth: 'small',
    nod: 1,
  },
  read: {
    ear: [0.04, -0.04],
    lid: 0.16,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0,
    mouth: 'small',
    still: 1,
  },
  work: {
    ear: [0, 0],
    lid: 0.18,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0,
    mouth: 'purse',
    tilt: 3,
    dip: 2.2,
    still: 1,
  },
  wow: {
    ear: [0.18, -0.18],
    lid: 0,
    wide: 1.12,
    happy: 0,
    wink: 0,
    blush: 0.75,
    mouth: 'a',
    star: 1,
    wiggle: 0.5,
  },
  ask: {
    ear: [0.1, -0.1],
    lid: 0,
    wide: 1.03,
    happy: 0,
    wink: 0,
    blush: 0.2,
    mouth: 'smile',
    tilt: 6,
  },
  sad: {
    ear: [-0.24, 0.24],
    lid: 0.06,
    wide: 1.04,
    happy: 0,
    wink: 0,
    blush: 0,
    mouth: 'wobble',
    slant: 0.9,
    wet: 1,
    dip: 1.4,
  },
  pout: {
    ear: [-0.1, 0.1],
    lid: 0,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0.9,
    mouth: 'pout',
    shut: 1,
    puff: 1,
    tilt: -4,
  },
}

type IdleAct = 'look' | 'flick' | 'double' | 'hum' | 'wink' | 'shy' | 'tilt'
const ACTS: IdleAct[] = [
  'look',
  'look',
  'flick',
  'double',
  'hum',
  'wink',
  'shy',
  'tilt',
]
const ACT_MS: Partial<Record<IdleAct, number>> = {
  look: 1500,
  hum: 2200,
  wink: 1100,
  shy: 1600,
  tilt: 1300,
}

const UNIFORMS = [
  'earL',
  'earR',
  'swayL',
  'swayR',
  'lidR',
  'lidL',
  'winkL',
  'happy',
  'wide',
  'blush',
  'mouthErase',
  'px1',
  'clear',
  'base',
  'parts',
  'skin',
  'lash',
  'hair',
  'star',
  'tw',
  'shut',
  'slant',
  'puff',
  'wet',
] as const
type UniformName = (typeof UNIFORMS)[number]

export interface HerHandle {
  mood: (m: HerMood) => void
  act: (kind: IdleAct) => void
  destroy: () => void
}

interface MountOptions {
  /** 烘焙好的底和五官层（scripts/bake-home-her.mjs）。 */
  base: string
  parts: string
  /** 她静止时的样子：首帧先摆它，WebGL 画出第一帧再撤；不支持 WebGL 时一直用它。 */
  still?: string
  /** 透明底：她贴在页面底色上，不画白底。 */
  transparent?: boolean
}

/** 她的骨架（叠层 + 静态图），服务端直接输出，挂载时接着用，不重建。 */
export function herMarkup(still?: string, transparent?: boolean): string {
  const bg = transparent ? ' style="background:transparent"' : ''
  const img = still
    ? `<img class="her-still" src="${still}" alt="" draggable="false">`
    : ''
  return `<div class="her-wrap" data-mood="idle" data-mouth="smile"><div class="her-lean"><div class="her-pop"${bg}>${img}${OVERLAY}</div></div></div>`
}

/**
 * 把她挂进 `host`。返回的句柄换表情、做小动作、卸载（停掉渲染循环、摘掉监听）。
 * 减少动态效果时只停在指定表情上，不眨眼、不跟鼠标、不打瞌睡。
 */
export function mountHer(host: HTMLElement, opts: MountOptions): HerHandle {
  if (!host.querySelector('.her-wrap'))
    host.innerHTML = herMarkup(opts.still, opts.transparent)
  const wrap = host.querySelector<HTMLDivElement>('.her-wrap')!
  const lean = wrap.querySelector<HTMLDivElement>('.her-lean')!
  const popEl = wrap.querySelector<HTMLDivElement>('.her-pop')!
  let still = popEl.querySelector<HTMLImageElement>('.her-still')
  const canvas = document.createElement('canvas')
  popEl.prepend(canvas)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  let mood: HerMood = 'idle'
  let hovered = false
  let lastActive = performance.now()
  let alive = true
  let raf = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  const st = {
    earL: 0,
    earR: 0,
    lidR: 0,
    lidL: 0,
    wide: 1,
    happy: 0,
    wink: 0,
    blush: 0,
    lx: 0,
    ly: 0,
    rot: 0,
    star: 0,
    shut: 0,
    slant: 0,
    puff: 0,
    wet: 0,
  }
  type StKey = keyof typeof st
  const act: { until: number; kind: IdleAct | null; dir: [number, number] } = {
    until: 0,
    kind: null,
    dir: [0, 0],
  }
  let blinkUntil = 0
  let blinkL = false
  let nextBlink = 1200
  let nextAct = 2500
  let flick = { until: 0, side: 0 }
  const pointer = { x: 0, y: 0, seen: false }
  const emoteTimers = new Map<Element, ReturnType<typeof setTimeout>>()

  function pop(name: string) {
    popEl.classList.remove('hop', 'squash', 'startle', 'nod', 'spin')
    void popEl.offsetWidth
    popEl.classList.add(name)
  }
  function emote(name: string, ms = 1500) {
    const el = wrap.querySelector('.em-' + name)
    if (!el) return
    el.classList.remove('on')
    void el.getBoundingClientRect()
    el.classList.add('on')
    const prev = emoteTimers.get(el)
    if (prev) clearTimeout(prev)
    if (ms)
      emoteTimers.set(
        el,
        later(() => el.classList.remove('on'), ms),
      )
  }
  function hold(name: string, on: boolean) {
    const el = wrap.querySelector('.em-' + name)
    if (!el) return
    const prev = emoteTimers.get(el)
    if (prev) clearTimeout(prev)
    el.classList.toggle('on', on)
  }
  function setMood(m: HerMood) {
    if (m === mood) return
    const prev = mood
    mood = m
    wrap.dataset.mood = m
    hold('dots', m === 'think')
    hold('z', m === 'sleepy')
    hold('note', false)
    hold('work', m === 'work')
    hold('drop', m === 'sad')
    hold('huff', m === 'pout')
    if (m === 'wow') {
      pop('hop')
      emote('spark', 1600)
    }
    if (m === 'ask') {
      pop('nod')
      emote('q', 1400)
    }
    if (m === 'sad') pop('nod')
    if (m === 'pout') pop('squash')
    if (m === 'gulp') {
      emote('bang')
      pop('squash')
    }
    if (m === 'proud') {
      pop('hop')
      emote(Math.random() < 0.5 ? 'heart' : 'spark', 1800)
    }
    if (m === 'happy') emote('heart', 1400)
    if (prev === 'sleepy' && m !== 'sleepy') {
      pop('startle')
      emote('bang', 1100)
      st.wide = 1.2
    }
  }

  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.seen = true
    lastActive = performance.now()
    if (mood === 'sleepy') setMood(hovered ? 'happy' : 'idle')
  }
  const onEnter = () => {
    hovered = true
    if (mood === 'idle' || mood === 'sleepy') {
      setMood('happy')
      emote('shy', 1600)
    }
  }
  const onLeave = () => {
    hovered = false
    if (mood === 'happy') setMood('idle')
  }
  addEventListener('pointermove', onMove, { passive: true })
  host.addEventListener('pointerenter', onEnter)
  host.addEventListener('pointerleave', onLeave)

  function idleAct(now: number, pick?: IdleAct) {
    const kind = pick ?? ACTS[Math.floor(Math.random() * ACTS.length)]
    act.kind = kind
    act.until = now + (ACT_MS[kind] ?? 0)
    if (kind === 'look')
      act.dir = [Math.random() * 2 - 1, Math.random() * 1.2 - 0.7]
    if (kind === 'flick')
      flick = { until: now + 260, side: Math.random() < 0.5 ? 0 : 1 }
    if (kind === 'double') {
      blinkUntil = now + 130
      later(() => {
        blinkUntil = performance.now() + 130
      }, 260)
    }
    if (kind === 'hum') {
      hold('note', true)
      later(() => hold('note', false), 2200)
    }
    if (kind === 'wink') emote('spark', 1100)
    if (kind === 'shy') emote('shy', 1600)
  }

  const handle: HerHandle = {
    mood(m) {
      lastActive = performance.now()
      setMood(m)
    },
    act(kind) {
      if (mood !== 'idle') setMood('idle')
      lastActive = performance.now()
      idleAct(performance.now(), kind)
    },
    destroy() {
      alive = false
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerenter', onEnter)
      host.removeEventListener('pointerleave', onLeave)
      host.innerHTML = ''
    },
  }

  const gl = canvas.getContext('webgl', { antialias: true })
  const fallback = () => canvas.remove()
  if (!gl) {
    fallback()
    return handle
  }

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    fallback()
    return handle
  }
  gl.useProgram(prog)
  const verts: number[] = []
  const idx: number[] = []
  for (let y = 0; y <= N; y++)
    for (let x = 0; x <= N; x++) verts.push(x / N, y / N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * (N + 1) + x
      idx.push(i, i + 1, i + N + 1, i + 1, i + N + 2, i + N + 1)
    }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW)
  const aLoc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(aLoc)
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
  const U = Object.fromEntries(
    UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)]),
  ) as Record<UniformName, WebGLUniformLocation | null>

  /* 2000 不是 2 的幂：画进 2048 再上传，才能开 mipmap，缩到头像尺寸不闪。parts 按预乘上传 */
  function upload(unit: number, src: HTMLImageElement, premultiply: boolean) {
    if (!gl) return
    const pot = document.createElement('canvas')
    pot.width = pot.height = 2048
    pot.getContext('2d')?.drawImage(src, 0, 0, 2048, 2048)
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pot)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  const load = (src: string) => {
    const img = new Image()
    img.src = src
    return img.decode().then(() => img)
  }
  Promise.all([load(opts.base), load(opts.parts)]).then(
    ([base, parts]) => {
      if (!alive) return
      upload(0, base, false)
      upload(1, parts, true)
      gl.uniform1i(U.base, 0)
      gl.uniform1i(U.parts, 1)
      gl.uniform3fv(U.skin, HER_COLORS.skin)
      gl.uniform3fv(U.lash, HER_COLORS.lash)
      gl.uniform3fv(U.hair, HER_COLORS.hair)
      raf = requestAnimationFrame(frame)
    },
    () => {
      if (alive) fallback()
    },
  )

  let last = performance.now()
  function frame(now: number) {
    if (!alive || !gl) return
    const dt = Math.min(50, now - last)
    last = now
    const r = canvas.getBoundingClientRect()
    const dpr = devicePixelRatio || 1
    const RW = Math.round(r.width * dpr)
    const RH = Math.round(r.height * dpr)
    if (RW && (canvas.width !== RW || canvas.height !== RH)) {
      canvas.width = RW
      canvas.height = RH
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    const M = MOODS[mood]
    const t = reduce ? 0 : now / 1000

    if (!reduce) {
      nextBlink -= dt
      if (nextBlink <= 0) {
        if (mood !== 'proud' && mood !== 'happy' && mood !== 'pout') {
          blinkUntil = now + 130
          blinkL = Math.random() < 0.12
        }
        nextBlink = 2200 + Math.random() * 3200
      }
      if (mood === 'idle') {
        nextAct -= dt
        if (nextAct <= 0) {
          idleAct(now)
          nextAct = 3200 + Math.random() * 3800
        }
        if (now - lastActive > 20000) setMood('sleepy')
      }
    }
    const acting = mood === 'idle' && now < act.until ? act.kind : null

    let eL = M.ear[0]
    let eR = M.ear[1]
    if (M.wiggle && !reduce) {
      eL += Math.sin(t * 9) * 0.07 * M.wiggle
      eR += Math.sin(t * 9 + 1.5) * 0.07 * M.wiggle
    }
    if (
      mood === 'work' &&
      !reduce &&
      now > flick.until + 1400 &&
      Math.random() < dt / 1200
    )
      flick = { until: now + 260, side: Math.random() < 0.5 ? 0 : 1 }
    if (now < flick.until) {
      if (flick.side === 0) eL += 0.22
      else eR -= 0.22
    }
    const blinking = now < blinkUntil
    let lidBase = M.lid
    if (mood === 'sleepy') lidBase = 0.78 + Math.sin(t * 0.9) * 0.12
    const lR = blinking && !blinkL ? 1 : lidBase
    const lL = blinking ? 1 : lidBase
    let hap = M.happy
    let wink = M.wink
    let bl = M.blush
    if (acting === 'hum') {
      hap = 1
      bl = 0.4
    }
    if (acting === 'wink') {
      wink = 1
      bl = 0.4
    }
    if (acting === 'shy') bl = 1
    let mouth = M.mouth
    if (mood === 'idle')
      mouth =
        acting === 'hum' || acting === 'wink'
          ? 'w'
          : acting === 'shy'
            ? 'small'
            : 'smile'

    let tx = 0
    let ty = M.dip ?? 0
    let rt = M.tilt ?? 0
    if (
      !reduce &&
      pointer.seen &&
      mood !== 'sleepy' &&
      mood !== 'think' &&
      !M.still
    ) {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = Math.max(-1, Math.min(1, (pointer.x - cx) / 500))
      const dy = Math.max(-1, Math.min(1, (pointer.y - cy) / 400))
      const k = M.lean ?? 1
      tx = dx * 3 * k
      ty += dy * 2 * k
      rt += dx * 4 * k
    }
    if (acting === 'look') {
      tx = act.dir[0] * 4
      ty = act.dir[1] * 2.5
      rt = act.dir[0] * 5
    }
    if (acting === 'tilt') rt = (Math.sin(t * 2.2) > 0 ? 1 : -1) * 6
    if (acting === 'hum') rt = Math.sin(t * 4) * 5
    if (mood === 'sleepy' && !reduce) {
      ty = 2 + Math.sin(t * 1.1) * 1.6
      rt = 4 + Math.sin(t * 1.1) * 3
    }
    if (mood === 'read' && !reduce) {
      const sw = Math.sin(t * 2.4)
      tx = sw * 2.6
      rt = sw * 3
      ty = 0.8 + Math.abs(Math.cos(t * 1.2)) * 0.6
    }

    const k = 1 - Math.pow(0.001, (dt / 1000) * (reduce ? 60 : 8))
    const ease = (key: StKey, val: number, s = 1) => {
      st[key] += (val - st[key]) * Math.min(1, k * s)
    }
    ease('earL', eL)
    ease('earR', eR)
    ease('lidR', lR, lR > st.lidR ? 3.2 : 1.6)
    ease('lidL', lL, lL > st.lidL ? 3.2 : 1.6)
    ease('wide', M.wide, 1.4)
    ease('happy', hap, 2)
    ease('wink', wink, 2.4)
    ease('blush', bl, 0.8)
    ease('lx', tx, 0.7)
    ease('ly', ty, 0.7)
    ease('rot', rt, 0.7)
    ease('star', M.star ?? 0, 1.6)
    ease('shut', M.shut ?? 0, 3)
    ease('slant', M.slant ?? 0, 1.2)
    ease('wet', M.wet ?? 0, 1.2)
    ease(
      'puff',
      (M.puff ?? 0) * (0.85 + (reduce ? 0 : Math.sin(t * 3) * 0.15)),
      1.4,
    )
    wrap.dataset.mouth = mouth
    lean.style.transform = `translate(${st.lx.toFixed(2)}%, ${st.ly.toFixed(2)}%) rotate(${st.rot.toFixed(2)}deg) scale(${(1 + Math.abs(st.rot) * 0.006).toFixed(3)})`

    gl.uniform1f(U.earL, st.earL)
    gl.uniform1f(U.earR, st.earR)
    gl.uniform1f(U.swayL, Math.sin(t * 1.4) * 0.05)
    gl.uniform1f(U.swayR, Math.sin(t * 1.4 + 1.6) * 0.06)
    gl.uniform1f(U.lidR, st.lidR)
    gl.uniform1f(U.lidL, st.lidL)
    gl.uniform1f(U.winkL, st.wink)
    gl.uniform1f(U.happy, st.happy)
    gl.uniform1f(U.wide, st.wide)
    gl.uniform1f(U.blush, st.blush)
    gl.uniform1f(U.mouthErase, mouth === 'smile' ? 0 : 1)
    gl.uniform1f(U.px1, 2000 / Math.max(1, canvas.width))
    gl.uniform1f(U.clear, opts.transparent ? 1 : 0)
    gl.uniform1f(U.star, st.star)
    gl.uniform1f(U.tw, t)
    gl.uniform1f(U.shut, st.shut)
    gl.uniform1f(U.slant, st.slant)
    gl.uniform1f(U.puff, st.puff)
    gl.uniform1f(U.wet, st.wet)
    const bg = opts.transparent ? 0 : 1
    gl.clearColor(bg, bg, bg, bg)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
    if (still) {
      still.remove()
      still = null
    }
    raf = requestAnimationFrame(frame)
  }

  return handle
}
