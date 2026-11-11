/**
 * 首页 v6 的舞台引擎：一块钉住的整屏，舞台里的一切变化只由滚动位置算出来。
 * 从小样 `.claude/mockups/home-v6/scroll-19.html` 搬来；施工图 `docs/references/pages/home.md` §v6。
 *
 * React 只画骨架（`HomeV6Stage`）和文案；会随滚动动的东西（作品墙、长带、LoRA、语音卡、画布、
 * 换角色那一段）都在这里按小样的做法建出来，位置和透明度每帧写进行内样式。
 * 例外（不由滚动推）：作品墙图片载入时由糊变清、点语音卡播放、她的待机小动作、④ 的成片到位后自己播。
 */

import {
  HOME_V6_ASSETS,
  HOME_V6_BARS,
  HOME_V6_FILM_LINES,
  HOME_V6_LEN,
  HOME_V6_SEGS,
  HOME_V6_TRACK_VH,
  HOME_V6_VOICES,
  HOME_V6_WALL_SPEED,
  type HomeV6Seg,
  type HomeV6Voice,
  type HomeV6WallShot,
} from '@/constants/homepage-v6'

import { mountHer, type HerHandle, type HerMood } from './her-rig'

export interface HomeV6StageCopy {
  wallAlt: string
  /** 「她出的第 {n} 张图」 */
  shotAlt: string
  loraStyles: readonly string[]
  /** 「同一张图，{style}」 */
  loraAlt: string
  voices: Readonly<Record<HomeV6Voice, string>>
  /** 「播放：{text}」 */
  play: string
  stop: string
  lines: Readonly<Record<HomeV6Seg, readonly [string, string]>>
  canvas: {
    castLabel: string
    castName: string
    castSub: string
    scriptLabel: string
    script: readonly string[]
    seconds: string
    shotCount: string
    shotChip: string
    clipChip: string
    shotDone: string
    clipDone: string
    /** 「镜头 {n} · {name}」 */
    shotLabel: string
    shotNames: readonly string[]
    /** 「片段 {n}」 */
    clipLabel: string
    /** 「台词 · {who}」 */
    lineLabel: string
    who: Readonly<Record<HomeV6Voice, string>>
    filmLabel: string
    caps: readonly string[]
  }
  char: {
    picAlt: string
    herName: string
    herWhen: string
    whaleName: string
    whaleWhen: string
    whaleQuote: string
  }
}

interface StageOptions {
  /** `.home-v6` 根：换角色后的海蓝底色、减少动态效果都挂在它的 class 上。 */
  page: HTMLElement
  /** 轨道（`.track`）：舞台钉在它上面。 */
  track: HTMLElement
  copy: HomeV6StageCopy
  shots: readonly HomeV6WallShot[]
  locale: string
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const ease = (t: number) => t * t * (3 - 2 * t)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const px = (v: number) => v.toFixed(1) + 'px'
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  )

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  html = '',
) {
  const e = document.createElement(tag)
  e.className = cls
  if (html) e.innerHTML = html
  return e
}
function box(e: HTMLElement, x: number, y: number, w?: number, h?: number) {
  e.style.left = px(x)
  e.style.top = px(y)
  if (w != null && h != null) {
    e.style.width = px(w)
    e.style.height = px(h)
  }
}
function fade(e: HTMLElement, o: number, dy = 0) {
  e.style.opacity = clamp(o).toFixed(3)
  e.style.transform = dy ? `translateY(${dy.toFixed(1)}px)` : ''
}
const wave = (n: number, seed: number) =>
  `<span class="wv" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--i:${i};height:${Math.round(28 + 72 * Math.abs(Math.sin(i * 1.7 + seed * 2.1) * Math.cos(i * 0.37 + seed)))}%"></i>`).join('')}</span>`
const PLAY_ICON =
  '<svg class="tri" viewBox="0 0 20 20"><path d="M6 3.5v13l11-6.5z"/></svg><svg class="pause" viewBox="0 0 20 20"><path d="M5 3h3.6v14H5zM11.4 3H15v14h-3.6z"/></svg>'

/** 把舞台挂起来；返回卸载函数。 */
export function mountStage(
  stageRoot: HTMLElement,
  opts: StageOptions,
): () => void {
  const { page, track, copy, locale } = opts
  const q = <T extends HTMLElement = HTMLElement>(k: string) =>
    stageRoot.querySelector<T>(`[data-k="${k}"]`)!
  const stage = q('stage')
  const win = q('win')
  const thread = q('thread')
  const wallEl = q('wall')
  const herHost = q('her')
  const her2 = q('her2')
  const say = q('say')
  const idEl = q('id')
  const headline = q('headline')
  const voicesBox = q('voices')
  const sys = q('sys')
  const me = [0, 1, 2, 3, 4, 5].map((k) => q('me' + k))
  const fadebot = q('fadebot')
  const hint = q('hint')
  const tide = q('tide')
  const tideline = q('tideline')
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const cleanups: (() => void)[] = []

  /* 作品墙：手机两列、电脑四列的瀑布，整组排两遍保证往上走时底下不露白 */
  const wall = opts.shots.length ? opts.shots : []
  const wcols = [0, 1, 2, 3].map(() => {
    const c = el('div', 'wcol')
    wallEl.append(c)
    return c
  })
  const wtiles = wall.concat(wall).map((x, i) => {
    const t = el('figure', 'wt')
    const img = new Image()
    img.alt = copy.wallAlt
    img.decoding = 'async'
    if (i >= 8) img.loading = 'lazy'
    img.onload = () => {
      const id = setTimeout(
        () => img.classList.add('ok'),
        still ? 0 : 70 * (i % wall.length),
      )
      cleanups.push(() => clearTimeout(id))
    }
    img.src = x.src
    t.append(img)
    return { t, w: x.w ?? 3, h: x.h ?? 4 }
  })
  function tile(src: string, alt: string) {
    const t = el(
      'figure',
      'tile',
      // ⛔ lazy：这几张躺在被 transform 推到窗口外的对话里，直接跳到 ⑤ 时懒加载来不及触发
      `<img src="${src}" alt="${esc(alt)}" decoding="async">`,
    )
    thread.append(t)
    return t
  }
  const shots = HOME_V6_ASSETS.shots.map((src, i) =>
    tile(src, fill(copy.shotAlt, { n: i + 1 })),
  )

  /* ② LoRA：四种画风叠在同一张卡里，上面几层用 clip-path 从左往右露出来 */
  const lora = el(
    'figure',
    'tile',
    copy.loraStyles
      .map(
        (s, i) =>
          `<div class="ly"><img src="${HOME_V6_ASSETS.lora[i]}" alt="${esc(fill(copy.loraAlt, { style: s }))}" decoding="async" loading="lazy"><span class="tag">${esc(s)}</span></div>`,
      )
      .join('') + '<i class="wipe" aria-hidden="true"></i>',
  )
  thread.append(lora)
  const layers = [...lora.querySelectorAll<HTMLElement>('.ly')]
  const wipeLine = lora.querySelector<HTMLElement>('.wipe')!
  const stys = copy.loraStyles.map((s, i) => {
    const e = el(
      'div',
      'sty',
      `<img src="${HOME_V6_ASSETS.lora[i]}" alt="" loading="lazy"><span>${esc(s)}</span>`,
    )
    thread.append(e)
    return e
  })

  /* ③ 三条语音：波形从真实音频里量；量不到就用一组固定的高低 */
  interface Voice {
    el: HTMLElement
    bars: HTMLElement[]
    audio: HTMLAudioElement
    text: string
    shown: number
  }
  let playing: Voice | null = null
  let rafTick = 0
  const voices: Voice[] = HOME_V6_VOICES.map((key, j) => {
    const text = copy.voices[key]
    const e = el(
      'div',
      'voice',
      `<img src="${HOME_V6_ASSETS.voiceAvatar(key)}" alt=""><div><div class="txt">${esc(text)}</div><div class="wave" aria-hidden="true">${'<i></i>'.repeat(HOME_V6_BARS)}</div></div><button type="button" class="play" aria-label="${esc(fill(copy.play, { text }))}">${PLAY_ICON}</button>`,
    )
    voicesBox.append(e)
    const bars = [...e.querySelectorAll<HTMLElement>('.wave i')]
    const src = HOME_V6_ASSETS.voiceAudio(key, locale)
    const setHeights = (hs: number[]) =>
      bars.forEach((b, i) => {
        b.style.height = Math.round(mix(14, 100, hs[i])) + '%'
      })
    setHeights(
      bars.map(
        (_, i) =>
          0.35 +
          0.65 * Math.abs(Math.sin(i * 1.7 + j * 2.1) * Math.cos(i * 0.37 + j)),
      ),
    )
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => new AudioContext().decodeAudioData(buf))
      .then((a) => {
        const d = a.getChannelData(0)
        const step = Math.floor(d.length / HOME_V6_BARS)
        const peaks: number[] = []
        for (let i = 0; i < HOME_V6_BARS; i++) {
          let m = 0
          for (let k = i * step; k < (i + 1) * step; k += 32)
            m = Math.max(m, Math.abs(d[k]))
          peaks.push(m)
        }
        const top = Math.max(...peaks) || 1
        setHeights(peaks.map((v) => Math.sqrt(v / top)))
      })
      .catch(() => {})
    const audio = new Audio(src)
    audio.preload = 'none'
    return { el: e, bars, audio, text, shown: 0 }
  })
  function paintPlayed(v: Voice) {
    const k = v.audio.duration ? v.audio.currentTime / v.audio.duration : 0
    v.bars.forEach((b, i) =>
      b.classList.toggle('played', v === playing && i / HOME_V6_BARS < k),
    )
  }
  function tick() {
    if (!playing) return
    paintPlayed(playing)
    rafTick = requestAnimationFrame(tick)
  }
  function stopVoice(v: Voice) {
    v.audio.pause()
    v.audio.currentTime = 0
    v.el.classList.remove('playing')
    if (playing === v) playing = null
    paintPlayed(v)
    v.el
      .querySelector('.play')
      ?.setAttribute('aria-label', fill(copy.play, { text: v.text }))
  }
  voices.forEach((v) => {
    const btn = v.el.querySelector<HTMLButtonElement>('.play')!
    btn.onclick = () => {
      if (playing === v) {
        stopVoice(v)
        mood = null
        return measure()
      }
      if (playing) stopVoice(playing)
      playing = v
      v.el.classList.add('playing')
      btn.setAttribute('aria-label', copy.stop)
      v.audio
        .play()
        .then(() => {
          her?.act('hum')
          tick()
        })
        .catch(() => stopVoice(v))
    }
    v.audio.onended = () => {
      stopVoice(v)
      mood = null
      measure()
    }
  })

  /* ④ 画布：一张世界（节点 + 连线）放在内容区里，镜头的缩放和位置跟着滚动走 */
  const C = copy.canvas
  const KF = HOME_V6_ASSETS.keyframes
  const cv = el('div', 'cv')
  const world = el('div', 'world')
  cv.append(world)
  thread.append(cv)
  const SVGNS = 'http://www.w3.org/2000/svg'
  const wsvg = document.createElementNS(SVGNS, 'svg')
  wsvg.setAttribute('class', 'no-rail')
  world.append(wsvg)
  interface Node {
    e: HTMLElement
    cd: HTMLElement
    pl: HTMLElement
    pr: HTMLElement
  }
  const N: Record<string, Node> = {}
  function node(
    key: string,
    name: string,
    cls: string,
    inner: string,
    extra = '',
    tail = '',
  ) {
    const e = el(
      'div',
      'nd ' + extra,
      `<span class="nm">${esc(name)}</span><div class="cd ${cls}">${inner}</div>${tail}<i class="port l"></i><i class="port r"></i>`,
    )
    world.append(e)
    N[key] = {
      e,
      cd: e.querySelector<HTMLElement>('.cd')!,
      pl: e.querySelector<HTMLElement>('.port.l')!,
      pr: e.querySelector<HTMLElement>('.port.r')!,
    }
  }
  node(
    'cast',
    C.castLabel,
    'cast',
    `<i class="face"></i><div><b>${esc(C.castName)}</b><span>${esc(C.castSub)}</span></div>`,
    'no-rail',
  )
  node(
    'script',
    C.scriptLabel,
    'text',
    C.script.map((t, i) => `<p><span>${i + 1}</span>${esc(t)}</p>`).join('') +
      `<div class="meta"><span class="chip">${esc(C.seconds)}</span><span class="chip">${esc(C.shotCount)}</span></div>`,
  )
  KF.forEach((src, i) => {
    node(
      'img' + i,
      fill(C.shotLabel, { n: i + 1, name: C.shotNames[i] }),
      'media',
      `<img src="${src}" alt="" decoding="async" loading="lazy"><span class="chip">${esc(C.shotChip)}</span><span class="dots"><i></i><i class="on"></i><i></i></span>`,
      '',
      `<p class="ln only-rail">${esc(C.script[i])}</p><div class="meta only-rail"><span class="chip">${esc(C.shotDone)}</span><span class="chip">${esc(C.clipDone)}</span></div>`,
    )
    node(
      'vid' + i,
      fill(C.clipLabel, { n: i + 1 }),
      'media',
      `<img src="${src}" alt="" decoding="async" loading="lazy"><span class="chip">${esc(C.clipChip)}</span>`,
      'no-rail',
    )
  })
  HOME_V6_FILM_LINES.forEach(([, key], j) =>
    node(
      'aud' + j,
      fill(C.lineLabel, { who: C.who[key] }),
      'audio',
      `<img src="${HOME_V6_ASSETS.voiceAvatar(key)}" alt="">${wave(18, j)}`,
      'no-rail',
    ),
  )
  node(
    'out',
    C.filmLabel,
    'media film',
    `<video muted playsinline preload="none" poster="${KF[0]}" src="${HOME_V6_ASSETS.film}"></video><div class="cap"></div><span class="tc">00:00 / 00:30</span>`,
  )
  interface Wire {
    p: SVGPathElement
    a: string
    b: string
    t0: number
    t1: number
  }
  const WIRES: Wire[] = []
  function wire(a: string, b: string, t0: number, t1: number, soft = false) {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('pathLength', '1')
    if (soft) p.setAttribute('class', 'soft')
    wsvg.append(p)
    WIRES.push({ p, a, b, t0, t1 })
  }
  KF.forEach((_, i) =>
    wire('cast', 'img' + i, 0.27 + i * 0.03, 0.32 + i * 0.03, true),
  )
  HOME_V6_FILM_LINES.forEach((_, j) => wire('aud' + j, 'out', 0.56, 0.63, true))
  KF.forEach((_, i) => {
    wire('script', 'img' + i, 0.26 + i * 0.03, 0.31 + i * 0.03)
    wire('img' + i, 'vid' + i, 0.4 + i * 0.025, 0.44 + i * 0.025)
    wire('vid' + i, 'out', 0.54 + i * 0.01, 0.6 + i * 0.01)
  })
  /* 世界坐标（电脑）：左列 角色 / 分镜 / 三句台词，中间两列 镜头图 → 片段，右边成片 */
  const WW = 1140
  /** 全图高：英文、日文的分镜卡换行后变高，台词节点跟着往下排，全图也跟着变高（placeNodes 里算）。 */
  let WH = 610
  const POS: Record<string, [number, number, number]> = {
    cast: [20, 16, 210],
    script: [20, 128, 210],
    out: [730, 185, 390],
  }
  KF.forEach((_, i) => {
    POS['img' + i] = [300, 12 + i * 118, 150]
    POS['vid' + i] = [510, 12 + i * 118, 150]
  })
  HOME_V6_FILM_LINES.forEach((_, j) => {
    POS['aud' + j] = [20, 338 + j * 84, 210]
  })
  let cvMode = ''
  function placeNodes(rail: boolean, cw: number) {
    const mode = rail ? 'rail' + cw : 'graph'
    if (mode === cvMode) return
    cvMode = mode
    cv.classList.toggle('rail', rail)
    if (rail) {
      ;['script', ...KF.map((_, i) => 'img' + i), 'out'].forEach((k, n) => {
        const s = N[k].e.style
        s.left = 16 + n * (cw + 12) + 'px'
        s.top = '14px'
        s.width = (k === 'out' ? Math.round(cw * 1.3) : cw) + 'px'
      })
      return
    }
    for (const k in POS) {
      const [x, y, w] = POS[k]
      const s = N[k].e.style
      s.left = x + 'px'
      s.top = y + 'px'
      s.width = w + 'px'
    }
    // 三句台词排在分镜卡下面：英文、日文的分镜句会换行，卡片比中文高
    const scriptBottom = N.script.e.offsetTop + N.script.e.offsetHeight
    let bottom = 0
    HOME_V6_FILM_LINES.forEach((_, j) => {
      const e = N['aud' + j].e
      e.style.top = Math.max(338, scriptBottom + 24) + j * 84 + 'px'
      bottom = e.offsetTop + e.offsetHeight
    })
    WH = Math.max(610, bottom + 16)
    const port = (n: Node, r: boolean): [number, number] => [
      n.e.offsetLeft + (r ? n.e.offsetWidth : 0),
      n.e.offsetTop + n.cd.offsetTop + n.cd.offsetHeight / 2,
    ]
    WIRES.forEach(({ p, a, b }) => {
      const [x1, y1] = port(N[a], true)
      const [x2, y2] = port(N[b], false)
      const dx = Math.max(28, (x2 - x1) * 0.5)
      p.setAttribute(
        'd',
        `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      )
      for (const [n, pe] of [
        [N[a], N[a].pr],
        [N[b], N[b].pl],
      ] as const) {
        pe.style.display = 'block'
        pe.style.top = n.cd.offsetTop + n.cd.offsetHeight / 2 + 'px'
      }
    })
  }
  /* 成片就在「成片」节点里放（第 50 轮拿掉了剪辑台）；到位后自己播，⛔ 跟着滚动拖（第 51 轮） */
  const filmV = N.out.cd.querySelector('video')!
  const capEl = N.out.cd.querySelector<HTMLElement>('.cap')!
  const tcEl = N.out.cd.querySelector<HTMLElement>('.tc')!
  filmV.loop = true
  filmV.muted = true
  filmV.ontimeupdate = () => {
    const sec = filmV.currentTime
    tcEl.textContent = `00:${String(Math.floor(sec)).padStart(2, '0')} / 00:30`
    capEl.textContent = C.caps[Math.min(4, Math.floor(sec / 6))]
  }

  /* ⑤ 换角色：窗口里同一张图，ANTEI 上次说的和小鲸现在说的 */
  const ch = copy.char
  her2.innerHTML = `<img src="${HOME_V6_ASSETS.whale}" alt="">`
  const chPic = tile(HOME_V6_ASSETS.shots[1], ch.picAlt)
  const noteA = el(
    'div',
    'note old',
    `<img class="av" src="${HOME_V6_ASSETS.her}" alt=""><div><b>${esc(ch.herName)}<span>${esc(ch.herWhen)}</span></b><q>${esc(copy.lines.shots[1])}</q></div>`,
  )
  const noteB = el(
    'div',
    'note',
    `<img class="av" src="${HOME_V6_ASSETS.whale}" alt=""><div><b>${esc(ch.whaleName)}<span>${esc(ch.whaleWhen)}</span></b><q></q></div>`,
  )
  const whaleQ = noteB.querySelector('q')!
  thread.append(noteA, noteB)

  /* 她 */
  const her: HerHandle | null = mountHer(herHost, {
    src: HOME_V6_ASSETS.her,
    transparent: true,
  })
  let mood: HerMood | null = null
  function setMood(m: HerMood) {
    if (playing) return
    if (m !== mood) {
      mood = m
      her?.mood(m)
    }
  }
  const shown = new Map<HTMLElement, string>()
  function setText(e: HTMLElement, text: string) {
    if (shown.get(e) === text) return
    shown.set(e, text)
    e.textContent = text
    e.classList.remove('swap')
    void e.offsetWidth
    e.classList.add('swap')
  }
  function typeText(e: HTMLElement, text: string, t: number) {
    const part = text.slice(0, Math.round(text.length * clamp(t)))
    if (e.textContent !== part) e.textContent = part
  }

  /* 版面：S 是她的大小；窗口从她右边一点开始到屏幕右边。窗口里每一段占一屏窗口高（第 k 段从 k×H 开始） */
  function layout() {
    const vw = innerWidth
    const vh = stage.clientHeight
    const narrow = vw <= 760
    const P = narrow ? 12 : 28
    const S = narrow
      ? Math.min(vh * 0.28, vw * 0.52)
      : Math.min(vh * 0.75, vw * 0.36)
    herHost.style.width = herHost.style.height = px(S)
    her2.style.width = her2.style.height = px(S)
    const wl0 = narrow ? P : S * 0.9 + 8
    const idTop = P + 56 + (narrow ? 18 : 40)
    box(idEl, P + 6, idTop)
    idEl.style.width = px(narrow ? vw - 2 * P - 12 : wl0 - 12 - P - 6)
    const wl = wl0
    const wt = narrow ? idTop + headline.offsetHeight + 16 : P + 56 + 12
    const wr = vw - P
    const wb = narrow ? vh - S * 0.9 - 6 : vh - P
    say.style.maxWidth = px(narrow ? vw - S * 0.85 - 12 : wl0 - 12 - P - 6)
    if (narrow) {
      say.style.left = px(S * 0.85)
      say.style.bottom = px(S * 0.32)
    } else {
      say.style.left = px(P + 6)
      say.style.bottom = px(S * 0.8)
    }
    const W = wr - wl
    const H = wb - wt
    box(win, wl, wt, W, H)
    page.style.setProperty('--wl', narrow ? '100%' : px(wl - 28))
    const pad = narrow ? 16 : 28
    const g = narrow ? 8 : 14
    const fs = narrow ? 15 : 18
    const band = me.map((e) => {
      const keep = e.style.fontSize
      e.style.fontSize = fs + 'px'
      const h = e.offsetHeight
      e.style.fontSize = keep
      return h
    })
    const aTop = band.slice(0, 5).map((h) => pad + h + g)
    aTop[4] = pad + band[4] + 40 + band[5] + g // 换角色那一段：你一句、一行「换人了」、你再一句
    wallEl.style.height = px(H)
    const n = narrow ? 2 : 4
    const wp = 12
    const wg = 10
    const cw = (W - 2 * wp - (n - 1) * wg) / n
    const hs = new Array<number>(n).fill(wp)
    wcols.forEach((c, k) => {
      c.style.display = k < n ? '' : 'none'
      c.style.left = px(wp + k * (cw + wg))
      c.style.width = px(cw)
    })
    wtiles.forEach((x) => {
      const k = hs.indexOf(Math.min(...hs))
      const h = cw * Math.min(x.h / x.w, 1.5)
      if (x.t.parentNode !== wcols[k]) wcols[k].append(x.t)
      x.t.style.top = px(hs[k])
      x.t.style.height = px(h)
      hs[k] += h + wg
    })
    return {
      narrow,
      W,
      H,
      pad,
      g,
      fs,
      band,
      iw: W - 2 * pad,
      aTop,
      aH: aTop.map((t) => H - pad - t),
    }
  }

  function apply(p: number) {
    const L = layout()
    const { W, H, pad, g, iw } = L
    const y = p * HOME_V6_TRACK_VH
    const w0 = clamp(y / HOME_V6_LEN.wall)
    const y1 = y - HOME_V6_LEN.wall
    const Pg = {} as Record<HomeV6Seg, number>
    let off = 0
    HOME_V6_SEGS.forEach((k) => {
      Pg[k] = clamp((y1 - off) / HOME_V6_LEN[k])
      off += HOME_V6_LEN[k]
    })
    const a = Pg.shots
    const b = Pg.lora
    const c = Pg.voice
    const d = Pg.canvas
    const e = Pg.char
    hint.style.opacity = fadebot.style.opacity = (
      1 - seg(w0, 0.02, 0.12)
    ).toFixed(3)

    /* 第一屏：四列以不同的速度往上走（视差）；那一句淡掉 */
    wcols.forEach((col, k) => {
      col.style.transform = `translateY(${(-w0 * H * HOME_V6_WALL_SPEED[k]).toFixed(1)}px)`
    })
    const idOut = ease(seg(w0, 0.15, 0.42))
    fade(headline, 1 - idOut, -idOut * (L.narrow ? 8 : 30))

    // 换段：整条对话往上推一屏窗口高，上一段出去、下一段进来是同一个动作
    const s =
      ease(seg(w0, 0.35, 1)) +
      [b, c, d, e].reduce((n, t) => n + ease(seg(t, 0, 0.12)), 0)
    thread.style.transform = `translateY(${(-s * H).toFixed(1)}px)`

    /* 你说的话 */
    ;[0, 1, 2, 3, 4].forEach((k) => {
      const m = me[k]
      m.style.fontSize = px(L.fs)
      box(m, W - pad - m.offsetWidth, (k + 1) * H + pad)
    })
    {
      const m = me[5]
      const r = ease(seg(e, 0.48, 0.53))
      m.style.fontSize = px(L.fs)
      box(m, W - pad - m.offsetWidth, 5 * H + pad + L.band[4] + 40)
      fade(m, r, (1 - r) * 10)
      sys.style.top = px(5 * H + pad + L.band[4] + 10)
      sys.style.opacity = ease(seg(e, 0.3, 0.35)).toFixed(3)
    }

    /* 她的回话 */
    const sayIn =
      e > 0
        ? e < 0.32
          ? ease(seg(e, 0.13, 0.17)) * (1 - ease(seg(e, 0.2, 0.25)))
          : ease(seg(e, 0.4, 0.44))
        : d > 0
          ? ease(seg(d, 0.16, 0.22))
          : c > 0
            ? ease(seg(c, 0.16, 0.22))
            : b > 0
              ? ease(seg(b, 0.16, 0.22))
              : y1 > 0
                ? ease(seg(a, 0.06, 0.12))
                : 0
    fade(say, sayIn, (1 - sayIn) * 10)
    say.classList.toggle('whale', e >= 0.32)

    /* ① 出图：长带。电脑上同时看得见两张、正好撑满内容区的宽；手机上一张 */
    {
      const top = H + L.aTop[0]
      const AH = L.aH[0]
      const slots = L.narrow ? 1 : 2
      const w = (iw - (slots - 1) * g) / slots
      const h = Math.min(AH, (w * 4) / 3)
      const rs = shots.map((_, i) =>
        ease(seg(a, 0.18 + i * 0.15, 0.32 + i * 0.15)),
      )
      const cam = rs.slice(slots).reduce((n, r) => n + r, 0)
      shots.forEach((t, i) => {
        const x = pad + (i - cam) * (w + g)
        box(t, x, top + (1 - rs[i]) * 18, w, h)
        t.style.opacity = (rs[i] * clamp((x - pad) / (w + g) + 1)).toFixed(3)
        t.style.filter =
          rs[i] < 1 ? `blur(${((1 - rs[i]) * 14).toFixed(1)}px)` : 'none'
      })
    }

    /* ② LoRA：左半那一张图被刷三次换画风；右半 2×2 记下四种。手机只留那一张 */
    let loraLive = -1
    {
      const top = 2 * H + L.aTop[1]
      const AH = L.aH[1]
      const twoCol = !L.narrow
      const w = twoCol ? (iw - g) / 2 : iw
      const h = Math.min(AH, (w * 4) / 3)
      const r0 = ease(seg(b, 0.24, 0.32))
      box(lora, pad, top + (1 - r0) * 18, w, h)
      lora.style.opacity = r0.toFixed(3)
      lora.style.filter =
        r0 < 1 ? `blur(${((1 - r0) * 14).toFixed(1)}px)` : 'none'
      const wipes = [0, 1, 2].map((n) =>
        seg(b, 0.38 + n * 0.19, 0.52 + n * 0.19),
      )
      layers.forEach((ly, i) => {
        if (i)
          ly.style.clipPath = `inset(0 ${((1 - wipes[i - 1]) * 100).toFixed(2)}% 0 0)`
      })
      loraLive = wipes.findIndex((t) => t > 0 && t < 1)
      wipeLine.style.opacity = loraLive < 0 ? '0' : '1'
      if (loraLive >= 0)
        wipeLine.style.left = (wipes[loraLive] * 100).toFixed(2) + '%'
      const cur =
        loraLive >= 0 ? loraLive + 1 : wipes.filter((t) => t >= 1).length
      const gx = pad + w + g
      const cw = (w - g) / 2
      const chh = (h - g) / 2
      stys.forEach((se, i) => {
        const done = i === 0 ? r0 : wipes[i - 1] >= 1 ? 1 : 0
        box(se, gx + (i % 2) * (cw + g), top + (i >> 1) * (chh + g), cw, chh)
        se.style.opacity = twoCol ? (0.12 + 0.88 * ease(done)).toFixed(3) : '0'
        se.classList.toggle('on', twoCol && i === cur && done > 0)
        se.classList.toggle('empty', done < 1)
      })
    }

    /* ③ 配音：三张语音卡排满内容区 */
    {
      const top = 3 * H + L.aTop[2]
      const AH = L.aH[2]
      voicesBox.style.setProperty(
        '--ch',
        px(Math.min(L.narrow ? 92 : 150, (AH - 2 * g) / 3)),
      )
      voicesBox.style.gap = px(g)
      box(voicesBox, pad, top, iw, AH)
      voices.forEach((v, j) => {
        const r = ease(seg(c, 0.28 + j * 0.13, 0.37 + j * 0.13))
        fade(v.el, r, (1 - r) * 22)
        v.el.classList.toggle('live', r > 0.9)
        const n = Math.round(
          HOME_V6_BARS * seg(c, 0.32 + j * 0.13, 0.44 + j * 0.13),
        )
        if (n !== v.shown) {
          v.shown = n
          v.bars.forEach((x, i) => x.classList.toggle('on', i < n))
        }
        if (r < 0.5 && playing === v) stopVoice(v)
      })
    }

    /* ④ 画布：摆节点（镜头先贴近左上，再拉远看全图）→ 推到「成片」节点上 → 片子自己播 */
    {
      const top = 4 * H + L.aTop[3]
      const AH = L.aH[3]
      const rail = L.narrow
      const cw = Math.round(Math.min(240, iw * 0.7))
      box(cv, pad, top, iw, AH)
      cv.style.opacity = ease(seg(d, 0.12, 0.18)).toFixed(3)
      placeNodes(rail, cw)
      let k: number
      let tx: number
      let ty: number
      if (rail) {
        const z = ease(seg(d, 0.24, 0.68))
        const ww = 16 + 6 * (cw + 12) + Math.round(cw * 1.3) + 16
        k = 1
        tx = -z * Math.max(0, ww - iw)
        ty = Math.max(0, (AH - N.img0.e.offsetHeight - 28) / 2)
      } else {
        const kf = Math.min(iw / WW, AH / WH)
        const k0 = Math.min(iw / 500, AH / 340)
        const z = ease(seg(d, 0.3, 0.56))
        const o = N.out.e
        const z2 = ease(seg(d, 0.66, 0.78))
        const k2 = Math.min(
          (iw * 0.9) / o.offsetWidth,
          (AH * 0.86) / o.offsetHeight,
        )
        k = mix(mix(k0, kf, z), k2, z2)
        tx =
          iw / 2 -
          mix(mix(250, WW / 2, z), o.offsetLeft + o.offsetWidth / 2, z2) * k
        ty =
          AH / 2 -
          mix(mix(170, WH / 2, z), o.offsetTop + o.offsetHeight / 2, z2) * k
      }
      world.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${k.toFixed(4)})`
      cv.style.backgroundSize = `${(18 * k).toFixed(2)}px ${(18 * k).toFixed(2)}px`
      cv.style.backgroundPosition = `${tx.toFixed(1)}px ${ty.toFixed(1)}px`
      const show = (key: string, t0: number, t1: number, blur = false) => {
        const st = N[key].e.style
        const r = ease(seg(d, t0, t1))
        st.opacity = r.toFixed(3)
        st.transform = r < 1 ? `translateY(${((1 - r) * 12).toFixed(1)}px)` : ''
        st.filter =
          blur && r < 1 ? `blur(${((1 - r) * 10).toFixed(1)}px)` : 'none'
      }
      show('cast', 0.16, 0.21)
      show('script', 0.18, 0.23)
      N.script.cd.querySelectorAll<HTMLElement>('p').forEach((pe, i) => {
        pe.style.opacity = seg(d, 0.215 + i * 0.012, 0.235 + i * 0.012).toFixed(
          2,
        )
      })
      KF.forEach((_, i) => {
        if (rail) return show('img' + i, 0.2 + i * 0.02, 0.26 + i * 0.02, true)
        show('img' + i, 0.29 + i * 0.03, 0.36 + i * 0.03, true)
        show('vid' + i, 0.43 + i * 0.025, 0.49 + i * 0.025, true)
      })
      HOME_V6_FILM_LINES.forEach((_, j) =>
        show('aud' + j, 0.5 + j * 0.02, 0.55 + j * 0.02),
      )
      if (rail) show('out', 0.5, 0.58)
      else show('out', 0.57, 0.63)
      WIRES.forEach((w) => {
        w.p.style.strokeDashoffset = (1 - ease(seg(d, w.t0, w.t1))).toFixed(3)
      })
      const live = !still && (rail ? d > 0.62 : d > 0.74) && e < 0.1
      if (d > 0.3 && filmV.preload !== 'auto') {
        filmV.preload = 'auto'
        filmV.load()
      }
      if (live && filmV.paused) filmV.play().catch(() => {})
      if (!live && !filmV.paused) filmV.pause()
    }

    /* ⑤ 换角色：她退场 → 整页底色从左往右被刷成小鲸的颜色 → 小鲸从同一位置出来 */
    {
      const top = 5 * H + L.aTop[4]
      const AH = L.aH[4]
      const out = ease(seg(e, 0.2, 0.28))
      const wp = seg(e, 0.24, 0.36)
      const inn = ease(seg(e, 0.32, 0.42))
      herHost.style.transform = `translate(${(-10 - 70 * out).toFixed(1)}%, ${(10 + 70 * out).toFixed(1)}%)`
      herHost.style.visibility = out >= 1 ? 'hidden' : ''
      her2.style.transform = `translate(${(-10 - 70 * (1 - inn)).toFixed(1)}%, ${(10 + 70 * (1 - inn)).toFixed(1)}%)`
      her2.style.opacity = inn > 0 ? '1' : '0'
      tide.style.clipPath = `inset(0 ${((1 - wp) * 100).toFixed(2)}% 0 0)`
      tideline.style.opacity = wp > 0 && wp < 1 ? '1' : '0'
      tideline.style.left = (wp * 100).toFixed(2) + '%'
      page.classList.toggle('sea', wp >= 1)
      stage.classList.toggle('seab', wp > 0.8)
      const w = L.narrow ? iw * 0.42 : (iw - g) / 2
      const h = Math.min(AH, (w * 4) / 3)
      const pw = (h * 3) / 4
      const r0 = ease(seg(e, 0.52, 0.6))
      const ra = ease(seg(e, 0.58, 0.64))
      const rb = ease(seg(e, 0.64, 0.68))
      box(chPic, pad, top + (1 - r0) * 18, pw, h)
      chPic.style.opacity = r0.toFixed(3)
      chPic.style.filter =
        r0 < 1 ? `blur(${((1 - r0) * 14).toFixed(1)}px)` : 'none'
      const nx = pad + pw + g
      const nw = iw - pw - g
      box(noteA, nx, top)
      noteA.style.width = px(nw)
      fade(noteA, ra, (1 - ra) * 14)
      box(noteB, nx, top + noteA.offsetHeight + g)
      noteB.style.width = px(nw)
      fade(noteB, rb, (1 - rb) * 14)
      typeText(whaleQ, ch.whaleQuote, still ? 1 : seg(e, 0.68, 0.86))
    }

    /* 她的表情和回话：开头答应一句，干活时不出声，结束时说一句有偏好的话 */
    const LN = copy.lines
    if (e > 0.12) {
      if (e < 0.32) {
        setMood('happy')
        setText(say, LN.char[0])
      } else {
        typeText(say, LN.char[1], still ? 1 : seg(e, 0.39, 0.5))
        shown.set(say, say.textContent ?? '')
      }
    } else if (d > 0.12) {
      if (d < 0.24) {
        setMood('read')
        setText(say, LN.canvas[0])
      } else if (d < 0.9) {
        setMood('work')
        setText(say, LN.canvas[0])
      } else {
        setMood('proud')
        setText(say, LN.canvas[1])
      }
    } else if (c > 0.12) {
      if (c < 0.28) {
        setMood('read')
        setText(say, LN.voice[0])
      } else if (c < 0.8) {
        setMood('work')
        setText(say, LN.voice[0])
      } else {
        setMood('proud')
        setText(say, LN.voice[1])
      }
    } else if (b > 0.12) {
      if (b < 0.32) {
        setMood('read')
        setText(say, LN.lora[0])
      } else if (b < 0.95) {
        setMood(loraLive >= 0 ? 'work' : 'happy')
        setText(say, LN.lora[0])
      } else {
        setMood('proud')
        setText(say, LN.lora[1])
      }
    } else if (y1 <= 0) {
      setMood(w0 < 0.35 ? 'happy' : 'read')
    } else if (a < 0.18) {
      setMood('read')
      setText(say, LN.shots[0])
    } else if (a < 0.84) {
      setMood('work')
      setText(say, LN.shots[0])
    } else {
      setMood('wow')
      setText(say, LN.shots[1])
    }
  }

  let queued = false
  let raf = 0
  // 网页字体载入后字宽会变，节点高度跟着变：重新摆一次
  void document.fonts?.ready.then(() => {
    cvMode = ''
    onScroll()
  })
  function measure() {
    queued = false
    if (still) return apply(1)
    const total = track.offsetHeight - innerHeight
    apply(total > 0 ? clamp((scrollY - track.offsetTop) / total) : 0)
  }
  function onScroll() {
    if (!queued) {
      queued = true
      raf = requestAnimationFrame(measure)
    }
  }
  if (still) page.classList.add('still')
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll)
  measure()

  return () => {
    removeEventListener('scroll', onScroll)
    removeEventListener('resize', onScroll)
    cancelAnimationFrame(raf)
    cancelAnimationFrame(rafTick)
    cleanups.forEach((fn) => fn())
    voices.forEach((v) => v.audio.pause())
    filmV.pause()
    her?.destroy()
    page.classList.remove('sea', 'still')
    ;[wallEl, voicesBox, her2].forEach((x) => (x.innerHTML = ''))
    ;[...shots, lora, ...stys, cv, chPic, noteA, noteB].forEach((x) =>
      x.remove(),
    )
  }
}
