/**
 * UI 几何探针 —— 在真浏览器里量「肉眼要盯着才发现」的那几类 UI 问题。
 *
 * 用法（claude-in-chrome / DevTools Console 都行）：
 *   1. 把本文件整段贴进页面执行一次，得到 `window.__uiProbe`
 *   2. `__uiProbe()`                      → 全页扫描
 *      `__uiProbe({ root: '.studio-workbench-stage' })` → 只扫结果区
 *
 * 为什么要有它：这些问题都不在「代码写错了」那一层，而在「渲染出来才知道」那一层
 * ——tsc 绿、vitest 绿、jsdom 也绿（jsdom 没有布局，getBoundingClientRect 恒为 0）。
 * 只有真浏览器的真实布局能判。
 *
 * 五类判据：
 *   occluded    一个可交互元素的中心点，点下去命中的是别人 → 它被压住了
 *   overlap     两个可交互/徽章元素的矩形相交 → 视觉打架（即使还能点中）
 *   counter     出现「N / M」这种计数，但同一块里没有任何切换控件 → 承诺了能翻页却翻不了
 *   space       容器里单个格子多高、首屏能完整看见几个 → 占空过大
 *   tapTarget   可交互元素小于 44px → 触屏够不着
 *
 * ⚠ opacity:0 的元素照样有矩形、照样吃点击（不同于 display:none / visibility:hidden），
 *   所以 hover 才出现的浮层不用真的 hover 就能被查出来 —— 而「看不见却拦截点击」
 *   本身就是一类 bug。
 */
;(() => {
  const INTERACTIVE_SELECTOR = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  /** 计数文案：`1 / 2`、`1/2`、`第 1 / 5 张` 都算。M 必须 > 1 才是「承诺可翻」。 */
  const COUNTER_RE = /(\d+)\s*\/\s*(\d+)/

  /** 切换控件的识别词（三语 + 图标 aria-label 常见写法）。 */
  const NAV_WORDS =
    /prev|next|前|后|上一|下一|左|右|◀|▶|←|→|carousel|slide|swiper/i

  /** WCAG 2.5.5 / Apple HIG 的触控下限。 */
  const MIN_TAP_PX = 44

  const rectOf = (el) => el.getBoundingClientRect()
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height)

  const intersect = (a, b) => {
    const x = Math.max(a.left, b.left)
    const y = Math.max(a.top, b.top)
    const r = Math.min(a.right, b.right)
    const bo = Math.min(a.bottom, b.bottom)
    if (r <= x || bo <= y) return null
    return {
      left: x,
      top: y,
      right: r,
      bottom: bo,
      width: r - x,
      height: bo - y,
    }
  }

  const related = (a, b) => a === b || a.contains(b) || b.contains(a)

  /**
   * Next.js 的开发浮层（`nextjs-portal`）是 dev-only 的宿主元素，命中测试会
   * 把它报成遮挡者，但它在生产里根本不存在。不排掉的话每次跑都带一条假阳性，
   * 假阳性多了这份报告就没人看了。
   */
  const isDevOverlay = (el) =>
    el.tagName === 'NEXTJS-PORTAL' || el.closest('nextjs-portal') !== null

  const isRendered = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = rectOf(el)
    return r.width > 0 && r.height > 0
  }

  /** 元素的可读身份：给报告用，不参与判定。 */
  const idOf = (el) => {
    const label =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.innerText || '').trim().split('\n')[0] ||
      ''
    const cls =
      el.className && typeof el.className === 'string'
        ? el.className.split(/\s+/).slice(0, 3).join('.')
        : ''
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${
      label ? ` "${label.slice(0, 32)}"` : ''
    }`
  }

  const round = (r) => ({
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  })

  /**
   * 遮挡：拿元素中心点做 elementFromPoint。命中的既不是它自己也不是它的
   * 后代/祖先 → 用户点这个元素的正中心，点到的是别的东西。
   * ⚠ 这是最硬的一条：不依赖任何样式假设，直接问浏览器「这一下点给谁」。
   */
  const findOccluded = (els) => {
    const out = []
    for (const el of els) {
      const r = rectOf(el)
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || related(el, hit) || isDevOverlay(hit)) continue
      out.push({
        element: idOf(el),
        rect: round(r),
        blockedBy: idOf(hit),
        blockerRect: round(rectOf(hit)),
      })
    }
    return out
  }

  /**
   * 相交：两个都能点/都在传达信息的元素矩形重叠。
   * 只报「相交面积占较小者 ≥ 10%」的，避免 1px 描边级噪声。
   */
  const findOverlaps = (els) => {
    const out = []
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i]
        const b = els[j]
        if (related(a, b)) continue
        const ra = rectOf(a)
        const rb = rectOf(b)
        const hit = intersect(ra, rb)
        if (!hit) continue
        const ratio = area(hit) / Math.max(1, Math.min(area(ra), area(rb)))
        if (ratio < 0.1) continue
        out.push({
          a: idOf(a),
          b: idOf(b),
          overlapRatio: Number(ratio.toFixed(2)),
          overlap: round(hit),
        })
      }
    }
    return out
  }

  /**
   * 计数承诺：页面上写着「1 / 2」，但同一个可视块里没有任何切换控件。
   * 判定范围取该文本节点向上三层的容器 —— 再往上会把整页的按钮都算进来。
   */
  const findCounterWithoutControl = (root) => {
    const out = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    let node
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').trim()
      const m = COUNTER_RE.exec(text)
      if (!m) continue
      const total = Number(m[2])
      if (!Number.isFinite(total) || total <= 1) continue
      const el = node.parentElement
      if (!el || !isRendered(el) || seen.has(el)) continue
      seen.add(el)

      let scope = el
      for (let i = 0; i < 3 && scope.parentElement; i++)
        scope = scope.parentElement

      const controls = [...scope.querySelectorAll(INTERACTIVE_SELECTOR)].filter(
        (c) =>
          isRendered(c) &&
          NAV_WORDS.test(
            `${c.getAttribute('aria-label') || ''} ${c.getAttribute('title') || ''} ${
              c.innerText || ''
            } ${c.className || ''}`,
          ),
      )
      if (controls.length > 0) continue

      out.push({
        text: text.slice(0, 48),
        showing: `${m[1]} / ${m[2]}`,
        scope: idOf(scope),
        note: '有计数、无切换控件 —— 用户看得到第 N 张的存在，却没有到达它的路径',
      })
    }
    return out
  }

  /**
   * 占空：容器的直接子项各占多高，首屏能完整放下几个。
   * `visibleWhole` 远小于总数 = 一屏看不到几张，比较类界面基本失效。
   */
  const measureSpace = (container) => {
    if (!container) return null
    const kids = [...container.children].filter(isRendered)
    if (kids.length === 0) return null
    const rects = kids.map(rectOf)
    const heights = rects.map((r) => Math.round(r.height))
    const visibleWhole = rects.filter(
      (r) => r.top >= 0 && r.bottom <= innerHeight,
    ).length
    return {
      container: idOf(container),
      children: kids.length,
      viewportHeight: innerHeight,
      childHeights: heights,
      tallestChild: Math.max(...heights),
      tallestVsViewport: Number(
        (Math.max(...heights) / innerHeight).toFixed(2),
      ),
      visibleWhole,
      scrollHeight: Math.round(container.scrollHeight),
    }
  }

  const findSmallTapTargets = (els) =>
    els
      .map((el) => ({ el, r: rectOf(el) }))
      .filter(({ r }) => r.width < MIN_TAP_PX || r.height < MIN_TAP_PX)
      .map(({ el, r }) => ({ element: idOf(el), rect: round(r) }))

  window.__uiProbe = (opts = {}) => {
    const root = opts.root ? document.querySelector(opts.root) : document.body
    if (!root) return { error: `root not found: ${opts.root}` }

    const els = [...root.querySelectorAll(INTERACTIVE_SELECTOR)].filter(
      isRendered,
    )
    // 徽章/角标：绝对定位且带文字的非交互元素，也要参与相交判定 ——
    // 「模型名徽章压住收藏按钮」这类问题两边有一半不是按钮。
    const badges = [...root.querySelectorAll('*')].filter((el) => {
      if (els.includes(el)) return false
      if (!isRendered(el)) return false
      const pos = getComputedStyle(el).position
      if (pos !== 'absolute' && pos !== 'fixed') return false
      return (el.innerText || '').trim().length > 0 && el.children.length === 0
    })

    return {
      root: idOf(root),
      viewport: { w: innerWidth, h: innerHeight },
      counted: { interactive: els.length, badges: badges.length },
      occluded: findOccluded(els),
      overlap: findOverlaps([...els, ...badges]),
      counterWithoutControl: findCounterWithoutControl(root),
      space: measureSpace(opts.grid ? document.querySelector(opts.grid) : root),
      smallTapTargets: findSmallTapTargets(els),
    }
  }

  return 'ready: __uiProbe({ root, grid })'
})()
