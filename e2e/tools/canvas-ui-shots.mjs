/**
 * 画布 UI 台账截图夹具
 * ────────────────────────────────────────────────────────────────────────
 * 按 `docs/plans/canvas-ui-inventory-2026-08-01.md` 的编号，逐个表面截图落盘到
 * `docs/plans/assets/canvas-ui-2026-08-01/<编号>-<名>.png`。
 *
 * 为什么要这个夹具（台账 §11）：claude-in-chrome 的截图在本机**不落盘**，只活在
 * 会话里；手动截图又无法复现，「修一处审一处」的 before/after 对不齐。
 *
 * 四条设计约束：
 *  1. **一个字节都不写库。** 画布状态的权威来源是服务端（`use-node-workflow.ts`
 *     的 server hydration：`serverProjects.length > 0` 时整体覆盖 localStorage），
 *     所以拦住 `/api/node-workflow/projects` 这一个口就完全接管，写操作一律吞掉。
 *  2. **不往仓库塞素材。** 夹具媒体是内联 SVG data URI，并显式给
 *     `mediaWidth/mediaHeight`，让卡宽钳制算法（`computeClampedCardSize`）不依赖
 *     onLoad 实测 —— 截图尺寸可复现。
 *  3. **一张图 = 一个小场景。** 不把 22 个节点堆进一个项目再指望相机飞过去：
 *     左面板的「定位」按钮实测**只选中、不移动相机**，节点留在视口外，
 *     Playwright 的 `scrollIntoView` 对 React Flow 的 transform 布局也无效。
 *     改成每张图换一份只含相关节点的夹具 → 重载 → fitView，卡自然居中放大。
 *  4. **每张独立 try/catch。** 一个选择器失效不该把整批带走。
 *
 * 前置：
 *   npx playwright test --project="auth setup"   # 生成 e2e/.auth/user.json
 *   npm run dev                                  # 3000 端口
 * 运行：
 *   node e2e/tools/canvas-ui-shots.mjs           # 全量
 *   node e2e/tools/canvas-ui-shots.mjs B2 C1     # 只跑指定编号
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'

const REPO = path.resolve(import.meta.dirname, '../..')
const OUT_DIR = path.join(REPO, 'docs/plans/assets/canvas-ui-2026-08-01')
const STORAGE_STATE = path.join(REPO, 'e2e/.auth/user.json')
const BASE_URL = 'http://localhost:3000'
const CANVAS_URL = `${BASE_URL}/zh/studio/node`

/**
 * 视口档。`--mobile` / `--tablet` 换档并给文件名加后缀，同一份清单跑三遍就得到
 * 三个断点的对照图（响应式调研里 768–1023 被点名是「当前最丑的区间」）。
 */
const VIEWPORT_PRESETS = {
  desktop: { width: 1600, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
}
const PRESET_NAME = process.argv.includes('--mobile')
  ? 'mobile'
  : process.argv.includes('--tablet')
    ? 'tablet'
    : 'desktop'
const VIEWPORT = VIEWPORT_PRESETS[PRESET_NAME]
const FILE_SUFFIX = PRESET_NAME === 'desktop' ? '' : `@${PRESET_NAME}`
const DEVICE_SCALE = 2

const PROJECT_ID = 'fixture-canvas-ui-ledger'
const PROJECT_NAME = '台账样本（夹具·只读）'
const FIXED_TIME = '2026-08-02T00:00:00.000Z'

const settle = (page, ms = 600) => page.waitForTimeout(ms)

/** 内联 SVG 媒体 —— 不落文件、比例可控、渲染确定。 */
function svgMedia(width, height, label, hue) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="hsl(${hue} 38% 80%)"/>`,
    `<stop offset="1" stop-color="hsl(${hue + 35} 32% 58%)"/>`,
    `</linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#g)"/>`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"`,
    ` font-family="system-ui,sans-serif" font-size="${Math.round(width / 11)}"`,
    ` fill="rgba(20,20,20,0.5)">${label}</text>`,
    `</svg>`,
  ].join('')
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const PORTRAIT = svgMedia(768, 1024, '3:4', 250)
const LANDSCAPE = svgMedia(1280, 720, '16:9', 200)
const SQUARE = svgMedia(900, 900, '1:1', 30)

function mk(id, type, x, y, data) {
  return {
    id,
    type,
    position: { x, y },
    data: { prompt: '', status: 'idle', ...data },
  }
}

// ── 场景（每个只装这张图要看的东西）─────────────────────────────────────
// `ImageNode.tsx` 按 role + 有无媒体分派到四个不同组件，所以图片族要分几个场景。

const SCENES = {
  /** B1 图片起步卡：空 / 生成失败 */
  imageStarter: {
    nodes: [
      mk('n-empty', 'image', 0, 0, {}),
      mk('n-genfail', 'image', 360, 0, {
        status: 'failed',
        generationStatus: 'error',
        generationError: '模型返回 429：请求过于频繁，请稍后重试。',
      }),
    ],
  },

  /** B2 图片就绪卡 */
  imageReady: {
    nodes: [
      mk('n-ready', 'image', 0, 0, {
        mediaUrl: SQUARE,
        mediaWidth: 900,
        mediaHeight: 900,
        mediaLabel: '散图就绪',
      }),
    ],
  },

  /** B2 审核态卡边：待审 / 已打回 并排 */
  reviewStates: {
    nodes: [
      mk('n-awaiting', 'image', 0, 0, {
        mediaUrl: PORTRAIT,
        mediaWidth: 768,
        mediaHeight: 1024,
        mediaLabel: '待审',
        mediaReview: {
          [PORTRAIT]: { state: 'awaiting_review', markedAt: FIXED_TIME },
        },
      }),
      mk('n-rejected', 'image', 420, 0, {
        mediaUrl: LANDSCAPE,
        mediaWidth: 1280,
        mediaHeight: 720,
        mediaLabel: '已打回',
        mediaReview: {
          [LANDSCAPE]: {
            state: 'rejected',
            reviewedAt: FIXED_TIME,
            reason: '构图偏了，主体不在视觉中心。',
          },
        },
      }),
    ],
  },

  /** B4 身份档案卡：有代表图 / 无代表图 */
  identity: {
    nodes: [
      mk('n-char', 'image', 0, 0, {
        role: 'character',
        characterName: '小林',
        mediaUrl: PORTRAIT,
        mediaWidth: 768,
        mediaHeight: 1024,
      }),
      mk('n-bg', 'image', 420, 0, {
        role: 'background',
        backgroundName: '深夜便利店',
      }),
    ],
  },

  /** B3 / B5 / B6 未落媒体的镜头族 + 生成中 */
  shotFamily: {
    nodes: [
      mk('n-shot', 'image', 0, 0, { role: 'shot', shotName: '镜1' }),
      mk('n-frame', 'image', 360, 0, { role: 'frame' }),
      mk('n-shot-running', 'image', 720, 0, {
        role: 'shot',
        shotName: '镜2',
        status: 'running',
        generationStatus: 'pending',
      }),
    ],
  },

  /** A7 卡外盖章八态（image 族把状态挪进媒体窗，所以用 shotText） */
  statuses: {
    nodes: [
      'idle',
      'queued',
      'ready',
      'running',
      'done',
      'failed',
      'stale',
      'disabled',
    ].map((status, index) =>
      // x 间距 520 是实测定的：卡外标签行里徽标 `ml-auto` 贴右缘，间距太小时
      // 上一张卡的徽标会压到下一张卡的名字上，看起来像「名字和徽标重叠」的产品
      // bug，其实是夹具排布太挤。
      mk(
        `n-status-${status}`,
        'shotText',
        (index % 4) * 520,
        Math.floor(index / 4) * 460,
        { status, shotName: status },
      ),
    ),
  },

  /** B10 音色卡 */
  voice: {
    nodes: [
      mk('n-voice', 'voice', 0, 0, {
        voiceName: '小林的声音',
        voiceProvider: 'fish_audio',
        voiceId: 'fixture-voice',
        dialogue: '你今天也来啦。',
      }),
    ],
  },

  /** B7 / B8 / B9 视频族（空态；有片态见文件尾「已知缺口」） */
  video: {
    nodes: [
      mk('n-seedance', 'seedance', 0, 0, {}),
      mk('n-videoref', 'videoReference', 360, 0, {}),
      mk('n-videomerge', 'videoMerge', 720, 0, {}),
    ],
  },

  /** A8 成分栏 + A2 连线：两个上游喂一张镜头卡 */
  ingredients: {
    nodes: [
      mk('n-char', 'image', 0, 0, {
        role: 'character',
        characterName: '小林',
        mediaUrl: PORTRAIT,
        mediaWidth: 768,
        mediaHeight: 1024,
      }),
      mk('n-bg', 'image', 0, 460, {
        role: 'background',
        backgroundName: '深夜便利店',
      }),
      mk('n-shot', 'image', 520, 230, { role: 'shot', shotName: '镜1' }),
    ],
    edges: [
      { id: 'e1', source: 'n-char', target: 'n-shot' },
      { id: 'e2', source: 'n-bg', target: 'n-shot' },
    ],
  },

  /**
   * 给「要点下方生成框」的镜头用：多一张垫底卡，让 fitView 落在更低的缩放档，
   * 卡因此变小、生成框整体上移 —— 否则 fitView 会顶到 200%，把生成框压到屏底
   * 被工具胶囊盖住，参数条上的按钮点不着。
   */
  imageReadyRoomy: {
    nodes: [
      mk('n-ready', 'image', 0, 0, {
        mediaUrl: SQUARE,
        mediaWidth: 900,
        mediaHeight: 900,
        mediaLabel: '散图就绪',
      }),
      mk('n-spacer', 'image', 0, 900, {
        mediaUrl: LANDSCAPE,
        mediaWidth: 1280,
        mediaHeight: 720,
        mediaLabel: '垫底（只为压低缩放档）',
      }),
    ],
  },

  /**
   * 单张视频生成卡。三张并排那个场景里最左那张会被 296px 的左面板盖住
   * （fitView 只保证「都进视口」，不知道左面板浮在上面），点不着 —— 要单独
   * 拍某一张时就给它一个只有它的场景。
   */
  seedanceOnly: { nodes: [mk('n-seedance', 'seedance', 0, 0, {})] },

  /** 单张镜头图卡（给真实生成序列用，同样避开左面板遮挡）。 */
  shotOnly: {
    nodes: [mk('n-shot', 'image', 0, 0, { role: 'shot', shotName: '镜1' })],
  },

  /** 单张空图片卡 —— 走生成框主路径（打提示词 + 选模型 + 发送）。 */
  emptyImageOnly: { nodes: [mk('n-empty', 'image', 0, 0, {})] },

  /** C4 待审：选中它，下方参数条才会同时出现「通过 / 打回」两个键。 */
  awaitingOnly: {
    nodes: [
      mk('n-awaiting', 'image', 0, 0, {
        mediaUrl: PORTRAIT,
        mediaWidth: 768,
        mediaHeight: 1024,
        mediaLabel: '待审',
        mediaReview: {
          [PORTRAIT]: { state: 'awaiting_review', markedAt: FIXED_TIME },
        },
      }),
    ],
  },

  /** B7 视频族的生成中 / 失败（此前只验过图片族与 shotText）。 */
  videoBusy: {
    nodes: [
      mk('n-seedance-running', 'seedance', 0, 0, {
        status: 'running',
        generationStatus: 'pending',
      }),
      mk('n-seedance-failed', 'seedance', 520, 0, {
        status: 'failed',
        generationStatus: 'error',
        generationError: '视频模型返回 400：时长参数超出该模型上限。',
      }),
    ],
  },

  /** B10 声音族的生成中 / 失败。 */
  voiceBusy: {
    nodes: [
      mk('n-voice-running', 'voice', 0, 0, {
        voiceName: '小林的声音',
        voiceProvider: 'fish_audio',
        voiceId: 'fixture-voice',
        dialogue: '你今天也来啦。',
        status: 'running',
        generationStatus: 'pending',
      }),
      mk('n-voice-failed', 'voice', 520, 0, {
        voiceName: '常客的声音',
        voiceProvider: 'fish_audio',
        voiceId: 'fixture-voice-2',
        dialogue: '老样子。',
        status: 'failed',
        generationStatus: 'error',
        generationError: '音色不存在或已下架。',
      }),
    ],
  },

  /**
   * A1 带壁纸的画布底。
   * ⚠ `CanvasAppearanceImageSchema.url` 是 `z.httpUrl()` —— data URI 过不了校验，
   * 所以用一个假域名，再用 `page.route` 把它兜成本地 SVG（见 main() 的路由）。
   */
  wallpaper: {
    nodes: [
      mk('n-ready', 'image', 0, 0, {
        mediaUrl: SQUARE,
        mediaWidth: 900,
        mediaHeight: 900,
        mediaLabel: '散图就绪',
      }),
    ],
    canvasAppearance: {
      backgroundColor: '#E8EEF4',
      image: {
        url: 'https://canvas-fixture.local/wallpaper.svg',
        fit: 'cover',
        opacity: 0.35,
      },
    },
  },

  /** B5 有图的镜头卡（此前只拍过空态；出图的那张走的是 role-less） */
  shotWithMedia: {
    nodes: [
      mk('n-shot-media', 'image', 0, 0, {
        role: 'shot',
        shotName: '镜1 · 中景',
        mediaUrl: LANDSCAPE,
        mediaWidth: 1280,
        mediaHeight: 720,
      }),
    ],
  },

  /**
   * 单张角色档案卡。`identity` 那个两节点场景里，fitView 之后左边那张会落到
   * 296px 左面板底下（fitView 不认浮层，见发现 #6），工具条上的「添加素材」
   * 因此点不着 —— 单节点场景居中，才拍得到。
   */
  characterOnly: {
    nodes: [
      mk('n-char', 'image', 0, 0, {
        role: 'character',
        characterName: '小林',
        mediaUrl: PORTRAIT,
        mediaWidth: 768,
        mediaHeight: 1024,
      }),
    ],
  },

  // 每个「扩大态」都用单节点场景 —— 多节点时 fitView 会把最左那张塞到左面板
  // 底下（发现 #6），工具条上的「展开」就点不着。
  backgroundOnly: {
    nodes: [
      mk('n-bg', 'image', 0, 0, {
        role: 'background',
        backgroundName: '深夜便利店',
        mediaUrl: LANDSCAPE,
        mediaWidth: 1280,
        mediaHeight: 720,
      }),
    ],
  },
  frameOnly: {
    nodes: [
      mk('n-frame', 'image', 0, 0, {
        role: 'frame',
        mediaUrl: LANDSCAPE,
        mediaWidth: 1280,
        mediaHeight: 720,
      }),
    ],
  },
  videoRefOnly: { nodes: [mk('n-videoref', 'videoReference', 0, 0, {})] },
  shotTextOnly: {
    nodes: [mk('n-shottext', 'shotText', 0, 0, { shotName: '镜头文本' })],
  },

  /** C3 视频合成能力区 */
  videoMergeOnly: { nodes: [mk('n-merge', 'videoMerge', 0, 0, {})] },

  /** C6 多选「合成 N 段」条 —— 两张视频卡 */
  twoVideos: {
    nodes: [
      mk('n-v1', 'seedance', 0, 0, {}),
      mk('n-v2', 'seedance', 520, 0, {}),
    ],
  },

  /** B11 旧编排器 / planner（先确认它们今天还长什么样，再决定去留） */
  legacy: {
    nodes: [
      mk('n-composer', 'composer', 0, 0, { prompt: '旧编排器' }),
      mk('n-agent', 'agent', 520, 0, { prompt: '旧 planner' }),
    ],
  },

  /** A4 空画布前门 */
  empty: { nodes: [] },
}

/** A0 全景：把所有场景摊在一张画布上，看整体密度与 chrome 占屏。 */
const OVERVIEW = (() => {
  const nodes = []
  let row = 0
  for (const [key, scene] of Object.entries(SCENES)) {
    if (key === 'empty' || scene.nodes.length === 0) continue
    for (const node of scene.nodes) {
      nodes.push({
        ...node,
        id: `${key}-${node.id}`,
        position: { x: node.position.x, y: node.position.y + row * 1000 },
      })
    }
    row += 1
  }
  return { nodes, edges: [] }
})()

function buildProjectRecord(scene) {
  return {
    id: PROJECT_ID,
    userId: 'fixture-user',
    name: PROJECT_NAME,
    state: {
      nodes: scene.nodes,
      edges: scene.edges ?? [],
      ...(scene.canvasAppearance
        ? { canvasAppearance: scene.canvasAppearance }
        : {}),
    },
    lastActiveAt: FIXED_TIME,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  }
}

/** 「适应画布」按钮（工具胶囊里，百分比文字与 ⊙ 图标共用同一个 aria-label）。 */
async function fitView(page) {
  await page
    .getByRole('button', { name: '适应画布' })
    .first()
    .click()
    .catch(() => {})
  await settle(page, 900)
}

/** 换一份夹具并重载 —— 每张图一个受控场景（见文件头约束 3）。 */
function makeSceneLoader(page, holder) {
  return async (scene) => {
    holder.record = buildProjectRecord(scene)
    await page.goto(CANVAS_URL, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid="canvas-stage"]', {
      timeout: 30_000,
    })
    await settle(page, 2200)
    if (scene.nodes.length > 0) await fitView(page)
  }
}

/**
 * 选中场景里的某张卡。场景小、已 fitView，卡一定在视口内，直接点即可。
 *
 * 点**中心**而不是左上角：卡名那行是 `absolute bottom:100%` 脱离卡框浮在上方
 * 的可点按钮（`EditableNodeLabel`），左上角容易点进改名编辑态、或落在卡框外
 * 导致 Playwright 判定不可操作而超时。中心一定落在媒体区。
 */
function clickNode(nodeId) {
  return async (page) => {
    await page.locator(`.react-flow__node[data-id="${nodeId}"]`).click()
    await settle(page, 1000)
  }
}

/** 近场工具条上的按钮（`role="toolbar"` 作用域内，避免和生成框的同名按钮撞）。 */
function clickToolbarButton(label) {
  return async (page) => {
    await page
      .locator('[role="toolbar"]')
      .getByRole('button', { name: label })
      .first()
      .click()
    await settle(page, 900)
  }
}

/** 组合若干 prepare 步骤。 */
function steps(...fns) {
  return async (page) => {
    for (const fn of fns) await fn(page)
  }
}

/**
 * 按无歧义的可访问名点按钮。
 * ⚠ 「展开」在近场工具条和生成框里都有 —— 那个必须走 `clickToolbarButton`
 *   或下面的 `clickSelector`，别用这个。
 */
function clickButton(label) {
  return async (page) => {
    await page.getByRole('button', { name: label }).first().click()
    await settle(page, 800)
  }
}

/**
 * 点下拉菜单项。⚠ 溢出菜单里的是 Radix `DropdownMenuItem` —— role 是
 * **`menuitem` 不是 `button`**，用 `getByRole('button')` 永远匹配不上（F2 第一版
 * 就是这么超时的）。
 */
function clickMenuItem(label) {
  return async (page) => {
    await page.getByRole('menuitem', { name: label }).first().click()
    await settle(page, 1200)
  }
}

/**
 * 往空图片卡的隐藏 file input 里塞一个文件，触发上传流程。
 * `ImageSourceStarter` 的 dropzone 背后就是个 `<input type=file>`。
 */
async function attachFileToStarter(page, nodeId = 'n-ready') {
  const input = page
    .locator(`.react-flow__node[data-id="${nodeId}"] input[type="file"]`)
    .first()
  await input.setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    // 1×1 透明 PNG
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
}

/** 悬停某个元素并停住 —— hover-only 的态（卡名铅笔 / 替换胶囊 / chip 的 × / 端口）。 */
function hoverSelector(selector, nth = 0) {
  return async (page) => {
    await page.locator(selector).nth(nth).hover()
    await settle(page, 700)
  }
}

/** 往左面板搜索框里打字（验空结果态）。 */
function typeInPanelSearch(text) {
  return async (page) => {
    const box = page.getByPlaceholder('搜索节点…').first()
    await box.click()
    await box.fill(text)
    await settle(page, 800)
  }
}

/** 按 CSS 选择器点（给没有稳定可访问名的控件，如生成框的模型丸）。 */
function clickSelector(selector, nth = 0) {
  return async (page) => {
    await page.locator(selector).nth(nth).click()
    await settle(page, 800)
  }
}

/**
 * 生成框参数条里的三个 `.canvas-composer-pill`，按 DOM 顺序：
 *   0 用模板 · 1 比例 · 2 张数
 * ⚠ 比例和张数那两个按钮**没有 aria-label** —— 可访问名是 `1:1` / `×1` 这类
 *   动态文本，会随选中值变，所以只能按序号定位，不能按名字。
 */
const COMPOSER_PILL = {
  template: 0,
  aspect: 1,
  batch: 2,
}

/** 标注层：截图前注入，截完移除，保证标注与图同源、不会随时间漂。 */
async function withAnnotations(page, marks, run) {
  if (marks?.length) {
    await page.evaluate((items) => {
      const layer = document.createElement('div')
      layer.id = '__shot_annotations__'
      layer.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:500 13px system-ui,sans-serif'
      items.forEach((item, index) => {
        const target = item.selector
          ? document.querySelector(item.selector)
          : null
        const box = target
          ? target.getBoundingClientRect()
          : { left: item.x ?? 0, top: item.y ?? 0, width: 0, height: 0 }
        const ring = document.createElement('div')
        ring.style.cssText = `position:absolute;left:${box.left - 4}px;top:${box.top - 4}px;width:${box.width + 8}px;height:${box.height + 8}px;border:2px solid #E24B4A;border-radius:6px`
        const tag = document.createElement('div')
        tag.textContent = `${index + 1}. ${item.label}`
        tag.style.cssText = `position:absolute;left:${box.left - 4}px;top:${Math.max(0, box.top - 30)}px;background:#E24B4A;color:#fff;padding:3px 8px;border-radius:4px;white-space:nowrap`
        layer.append(ring, tag)
      })
      document.body.append(layer)
    }, marks)
  }
  try {
    await run()
  } finally {
    await page.evaluate(() =>
      document.getElementById('__shot_annotations__')?.remove(),
    )
  }
}

/** 拍摄清单。编号与台账一一对应；加条目只要往这个数组里加。 */
const SHOTS = [
  { id: 'A0', name: 'canvas-overview', scene: OVERVIEW },
  { id: 'A4', name: 'empty-guide', scene: SCENES.empty },
  { id: 'A7', name: 'status-badges', scene: SCENES.statuses },
  {
    id: 'A8',
    name: 'ingredients-and-edges',
    scene: SCENES.ingredients,
    prepare: clickNode('n-shot'),
  },
  { id: 'B1', name: 'image-starter-empty-failed', scene: SCENES.imageStarter },
  { id: 'B2', name: 'image-card-ready', scene: SCENES.imageReady },
  {
    // 选中 ⇒ 同屏能看到卡选中态 + 近场能力条(C1) + 下方生成框(D1)
    id: 'B2b',
    name: 'image-card-selected',
    scene: SCENES.imageReady,
    prepare: clickNode('n-ready'),
  },
  { id: 'B2c', name: 'review-state-borders', scene: SCENES.reviewStates },
  { id: 'B3', name: 'shot-family-empty', scene: SCENES.shotFamily },
  { id: 'B4', name: 'identity-cards', scene: SCENES.identity },
  {
    id: 'B4b',
    name: 'identity-card-selected',
    scene: SCENES.characterOnly,
    prepare: clickNode('n-char'),
  },
  { id: 'B7', name: 'video-cards-empty', scene: SCENES.video },
  { id: 'B10', name: 'voice-card', scene: SCENES.voice },
  {
    id: 'B10b',
    name: 'voice-card-selected',
    scene: SCENES.voice,
    prepare: clickNode('n-voice'),
  },
  {
    id: 'E1',
    name: 'topbar',
    scene: SCENES.imageReady,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: 56 },
  },
  {
    id: 'E2',
    name: 'project-menu',
    scene: SCENES.imageReady,
    async prepare(page) {
      // 顶栏里第一个 button 就是片名条（项目切换器触发器）。
      await page.locator('header button').first().click()
      await settle(page, 700)
    },
  },
  {
    id: 'E4',
    name: 'left-panel',
    scene: OVERVIEW,
    locator: '[data-testid="canvas-left-panel"]',
  },
  {
    id: 'E6',
    name: 'bottom-dock',
    scene: SCENES.imageReady,
    locator: '.canvas-toolbar-capsule',
  },
  {
    id: 'D8',
    name: 'add-menu',
    scene: SCENES.imageReady,
    async prepare(page) {
      await page.locator('header').getByText('添加节点').first().click()
      await settle(page, 700)
    },
  },
  {
    id: 'E3',
    name: 'appearance-panel',
    scene: SCENES.imageReady,
    prepare: clickButton('设置画布外观'),
  },

  // ── 近场工具条的每个按钮点开之后 ────────────────────────────────────
  {
    id: 'C1a',
    name: 'toolbar-overflow-menu',
    scene: SCENES.imageReady,
    prepare: steps(clickNode('n-ready'), clickToolbarButton('更多')),
  },
  {
    // 台账 C1（2026-08-02）：分类不再是常驻条上的按钮，收进「更多」里成了
    // 子菜单 —— 它是属性不是动作，一张图只设一次，却占着最左带文字的位。
    id: 'C1b',
    name: 'toolbar-category-dropdown',
    scene: SCENES.imageReady,
    prepare: steps(
      clickNode('n-ready'),
      clickToolbarButton('更多'),
      clickMenuItem('分类'),
    ),
  },
  {
    id: 'C5',
    name: 'quick-edit-panel',
    scene: SCENES.imageReady,
    prepare: steps(clickNode('n-ready'), clickToolbarButton('快捷编辑')),
  },

  // ── F1 「展开」= 节点详情面板，每个族一张 ───────────────────────────
  {
    id: 'F1',
    name: 'detail-panel-loose-image',
    scene: SCENES.imageReady,
    prepare: steps(clickNode('n-ready'), clickToolbarButton('展开')),
  },
  {
    id: 'F1b',
    name: 'detail-panel-character',
    scene: SCENES.identity,
    prepare: steps(clickNode('n-char'), clickToolbarButton('展开')),
  },
  {
    id: 'F1c',
    name: 'detail-panel-shot',
    scene: SCENES.shotFamily,
    prepare: steps(clickNode('n-shot'), clickToolbarButton('展开')),
  },
  {
    id: 'F1d',
    name: 'detail-panel-voice',
    scene: SCENES.voice,
    prepare: steps(clickNode('n-voice'), clickToolbarButton('展开')),
  },
  {
    id: 'F1e',
    name: 'detail-panel-video',
    scene: SCENES.seedanceOnly,
    prepare: steps(clickNode('n-seedance'), clickToolbarButton('展开')),
  },

  // ── 生成框的参数条：每个下拉点开 ────────────────────────────────────
  {
    id: 'D1',
    name: 'generate-composer',
    scene: SCENES.imageReadyRoomy,
    prepare: clickNode('n-ready'),
  },
  {
    id: 'D7',
    name: 'model-picker-open',
    scene: SCENES.imageReadyRoomy,
    prepare: steps(
      clickNode('n-ready'),
      clickSelector('.canvas-composer-model-pill'),
    ),
  },
  {
    id: 'D1a',
    name: 'aspect-dropdown',
    scene: SCENES.imageReadyRoomy,
    prepare: steps(
      clickNode('n-ready'),
      clickSelector('.canvas-composer-pill', COMPOSER_PILL.aspect),
    ),
  },
  {
    id: 'D1b',
    name: 'batch-dropdown',
    scene: SCENES.imageReadyRoomy,
    prepare: steps(
      clickNode('n-ready'),
      clickSelector('.canvas-composer-pill', COMPOSER_PILL.batch),
    ),
  },
  {
    id: 'D1c',
    name: 'template-picker',
    scene: SCENES.imageReadyRoomy,
    prepare: steps(clickNode('n-ready'), clickButton('用模板')),
  },

  // ── 助手 ────────────────────────────────────────────────────────────
  {
    id: 'G2',
    name: 'assistant-dock',
    scene: SCENES.imageReady,
    prepare: clickButton('助手'),
  },

  // ── 助手线（mock `/api/studio/node-assistant`，见 ASSISTANT_REPLIES）──
  {
    id: 'G3',
    name: 'assistant-reply-markdown',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.assistantReply = ASSISTANT_REPLIES.markdown
      await clickButton('助手')(page)
      // ⚠ placeholder 是三个 **ASCII 句点**（`询问画布助手...`），不是 CJK 省略号
      //   `…` —— 用后者匹配不上，第一版四个助手镜头全挂在这。
      const input = page.getByPlaceholder('询问画布助手...').first()
      await input.click()
      await input.fill('帮我把这个角色的穿搭和镜头理一下')
      await page.getByRole('button', { name: '发送' }).first().click()
      await settle(page, 3000)
    },
  },
  {
    id: 'G4',
    name: 'assistant-op-proposal',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.assistantReply = ASSISTANT_REPLIES.proposal
      await clickButton('助手')(page)
      // ⚠ placeholder 是三个 **ASCII 句点**（`询问画布助手...`），不是 CJK 省略号
      //   `…` —— 用后者匹配不上，第一版四个助手镜头全挂在这。
      const input = page.getByPlaceholder('询问画布助手...').first()
      await input.click()
      await input.fill('按深夜便利店这条线把骨架铺出来')
      await page.getByRole('button', { name: '发送' }).first().click()
      await settle(page, 3000)
    },
  },
  {
    id: 'G9',
    name: 'scriptdoc-workspace',
    scene: SCENES.imageReady,
    prepare: steps(clickButton('助手'), clickButton('展开剧本工作区')),
  },
  {
    id: 'G5',
    name: 'clarifying-questions',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.scriptDoc = SCRIPT_DOC_QUESTIONS
      await clickButton('助手')(page)
      await clickButton('展开剧本工作区')(page)
      await clickButton('按对话生成大纲')(page)
      await settle(page, 2000)
    },
  },

  // ── F2 重编辑工作区（从工具条溢出菜单进）────────────────────────────
  {
    id: 'F2',
    name: 'image-edit-workspace',
    scene: SCENES.imageReady,
    prepare: steps(
      clickNode('n-ready'),
      clickToolbarButton('更多'),
      clickMenuItem('局部重绘'),
    ),
  },

  // ── F4 声音库（音色卡工具条）────────────────────────────────────────
  {
    id: 'F4',
    name: 'voice-library',
    scene: SCENES.voice,
    prepare: steps(clickNode('n-voice'), clickToolbarButton('声音库')),
  },

  // ── 状态补拍（2026-08-02 第三轮：owner「先补状态」）──────────────────
  {
    // C4 真正的待审态 = 通过 + 打回**两个**键。此前只拍到 approved 下的单钮。
    id: 'C4',
    name: 'review-buttons-awaiting',
    scene: SCENES.awaitingOnly,
    prepare: clickNode('n-awaiting'),
  },
  { id: 'B7b', name: 'video-running-failed', scene: SCENES.videoBusy },
  { id: 'B10c', name: 'voice-running-failed', scene: SCENES.voiceBusy },
  { id: 'A1b', name: 'canvas-with-wallpaper', scene: SCENES.wallpaper },
  {
    // A6 卡名 hover → 露出铅笔（只读态与编辑态过去视觉完全一样，这个提示是
    // S5 专门加的，值得单独有一张）
    id: 'A6b',
    name: 'card-label-hover-pencil',
    scene: SCENES.imageReady,
    // 按可访问名找（`EditableNodeLabel` 的 aria-label 是 nodeToolbar.rename =
    // 「命名」）。第一版按 `.canvas-label-trigger` 类名找超时。
    async prepare(page) {
      await page.getByRole('button', { name: '命名' }).first().hover()
      await settle(page, 700)
    },
  },
  {
    // G3 助手「思考中」—— 把 mock 的回复**延迟**返回，停在这一帧
    id: 'G3b',
    name: 'assistant-thinking',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.assistantReply = ASSISTANT_REPLIES.markdown
      mock.assistantDelayMs = 25_000
      await clickButton('助手')(page)
      const input = page.getByPlaceholder('询问画布助手...').first()
      await input.click()
      await input.fill('帮我理一下这个角色')
      await page.getByRole('button', { name: '发送' }).first().click()
      await settle(page, 2500)
    },
  },
  {
    // G3 助手请求失败
    id: 'G3c',
    name: 'assistant-error',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.assistantStatus = 500
      await clickButton('助手')(page)
      const input = page.getByPlaceholder('询问画布助手...').first()
      await input.click()
      await input.fill('帮我理一下这个角色')
      await page.getByRole('button', { name: '发送' }).first().click()
      await settle(page, 2500)
    },
  },
  {
    // G4 提案卡「已应用」态
    id: 'G4b',
    name: 'op-proposal-applied',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.assistantReply = ASSISTANT_REPLIES.proposal
      await clickButton('助手')(page)
      const input = page.getByPlaceholder('询问画布助手...').first()
      await input.click()
      await input.fill('铺骨架')
      await page.getByRole('button', { name: '发送' }).first().click()
      await settle(page, 3000)
      await page.getByRole('button', { name: /^应用 \d+ 项$/ }).first().click()
      await settle(page, 2500)
    },
  },
  {
    // E1 顶栏「保存中」—— 让项目写入接口慢下来，spinner 才停得住
    id: 'E1b',
    name: 'topbar-saving',
    scene: SCENES.imageReady,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: 56 },
    async prepare(page, mock) {
      mock.projectWriteDelayMs = 20_000
      await clickButton('保存')(page)
      await settle(page, 1500)
    },
  },
  {
    // B2 「替换」胶囊的 **hover-only** 那份 —— 之前拍到的都是选中态带出来的
    id: 'B2d',
    name: 'replace-pill-hover-only',
    scene: SCENES.imageReady,
    prepare: hoverSelector('[data-testid="loose-image-card"]'),
  },
  {
    // A8 成分 chip hover → 露出 × 解绑
    id: 'A8b',
    name: 'ingredient-chip-hover',
    scene: SCENES.ingredients,
    prepare: steps(clickNode('n-shot'), hoverSelector('.node-ingest-chip-pop')),
  },
  {
    id: 'A9b',
    name: 'port-hover',
    scene: SCENES.imageReady,
    prepare: hoverSelector('.canvas-port'),
  },
  {
    id: 'E4b',
    name: 'left-panel-no-results',
    scene: OVERVIEW,
    prepare: typeInPanelSearch('zzzz-不存在的节点'),
    locator: '[data-testid="canvas-left-panel"]',
  },

  // ── F1 扩大态补齐：`NODE_DETAIL_REGISTRY` 一共 10 个 body ─────────────
  {
    id: 'F1f',
    name: 'detail-panel-background',
    scene: SCENES.backgroundOnly,
    prepare: steps(clickNode('n-bg'), clickToolbarButton('展开')),
  },
  {
    id: 'F1g',
    name: 'detail-panel-frame',
    scene: SCENES.frameOnly,
    prepare: steps(clickNode('n-frame'), clickToolbarButton('展开')),
  },
  {
    id: 'F1h',
    name: 'detail-panel-video-merge',
    scene: SCENES.videoMergeOnly,
    prepare: steps(clickNode('n-merge'), clickToolbarButton('展开')),
  },
  {
    id: 'F1i',
    name: 'detail-panel-video-reference',
    scene: SCENES.videoRefOnly,
    prepare: steps(clickNode('n-videoref'), clickToolbarButton('展开')),
  },
  {
    /**
     * GenericDetailBody 的兜底。⚠ 预判可能拍不到：`GenericSelectionToolbar`
     * 在「既无能力区又无媒体」时整条不渲染，而 shotText / composer / agent
     * 正好都是这种 —— 那样就**没有「展开」按钮**，兜底 body 从画布上进不去。
     * 拍不到本身就是结论，别当成脚本坏了。
     */
    id: 'F1j',
    name: 'detail-panel-generic',
    scene: SCENES.shotTextOnly,
    prepare: steps(clickNode('n-shottext'), clickToolbarButton('展开')),
  },

  // ── 补齐剩余表面（2026-08-02 第四轮）─────────────────────────────────
  { id: 'B5', name: 'shot-card-with-media', scene: SCENES.shotWithMedia },
  { id: 'B11', name: 'legacy-composer-agent', scene: SCENES.legacy },
  {
    id: 'C3b',
    name: 'capability-seedance',
    scene: SCENES.seedanceOnly,
    prepare: clickNode('n-seedance'),
  },
  {
    id: 'C3c',
    name: 'capability-video-merge',
    scene: SCENES.videoMergeOnly,
    prepare: clickNode('n-merge'),
  },
  {
    id: 'C6',
    name: 'multi-select-compose-bar',
    scene: SCENES.twoVideos,
    async prepare(page) {
      await page.locator('.react-flow__node[data-id="n-v1"]').click()
      await page
        .locator('.react-flow__node[data-id="n-v2"]')
        .click({ modifiers: ['Shift'] })
      await settle(page, 1200)
    },
  },
  {
    // D2 视频编排框（选中视频卡时贴卡下方）
    id: 'D2',
    name: 'video-composer',
    scene: SCENES.seedanceOnly,
    prepare: clickNode('n-seedance'),
  },
  {
    // ⚠ 运镜语法 / 管理素材**不在**贴卡的紧凑视频框里 —— 紧凑态只有 tab /
    //   提示词 / 参数（见 D2）。它们住在「展开」出来的视频详情面板里。
    id: 'D6',
    name: 'camera-grammar',
    scene: SCENES.seedanceOnly,
    prepare: steps(
      clickNode('n-seedance'),
      clickToolbarButton('展开'),
      clickButton('运镜语法'),
    ),
  },
  {
    id: 'D4',
    name: 'reference-manager',
    scene: SCENES.seedanceOnly,
    prepare: steps(
      clickNode('n-seedance'),
      clickToolbarButton('展开'),
      clickButton('管理素材'),
    ),
  },
  {
    // D3 @提及下拉
    id: 'D3',
    name: 'mention-dropdown',
    scene: SCENES.ingredients,
    async prepare(page) {
      await clickNode('n-shot')(page)
      const input = page.locator('.canvas-composer-input').first()
      await input.click()
      await input.type('@')
      await settle(page, 1200)
    },
  },
  {
    id: 'E8',
    name: 'project-rename-dialog',
    scene: SCENES.imageReady,
    async prepare(page) {
      await page.locator('header button').first().click()
      await settle(page, 700)
      await clickMenuItem('重命名')(page)
    },
  },
  {
    // F4 VoiceSelector（住在音色卡的详情面板里，不是独立弹窗）
    id: 'F4b',
    name: 'voice-selector',
    scene: SCENES.voice,
    prepare: steps(clickNode('n-voice'), clickToolbarButton('展开')),
  },
  {
    // F6 素材选择器（身份卡工具条的「添加素材」）
    id: 'F6',
    name: 'asset-selector',
    scene: SCENES.characterOnly,
    // 不走 toolbar 作用域：这个触发器是 `CharacterImageReferenceControls` 的
    // PopoverTrigger，虽然渲染在工具条里，但按 role+name 直接找更稳。
    prepare: steps(clickNode('n-char'), clickButton('添加素材')),
  },
  {
    id: 'G6',
    name: 'assistant-route-selector',
    scene: SCENES.imageReady,
    prepare: steps(clickButton('助手'), clickButton('助手路由')),
  },
  {
    id: 'G7',
    name: 'assistant-reference-picker',
    scene: SCENES.imageReady,
    prepare: steps(clickButton('助手'), clickButton('添加图片或视频参考')),
  },
  {
    id: 'G8',
    name: 'assistant-history',
    scene: SCENES.imageReady,
    prepare: steps(clickButton('助手'), clickButton('历史对话')),
  },

  // ── 上传三态（拦预签名 PUT，见 main() 里的 upload 路由）──────────────
  {
    /**
     * ⚠ 走的是**「替换」**那条上传路径，不是空态卡。
     * 实读 `ImageSourceStarter`：它一个 `type="file"` 都没有，只有
     * `onDragOver` / `onDrop` —— 空态的「拖入即可上传」**只能拖，不能点选文件**
     * （这条本身已登记为发现）。真正有 file input 的是 `LooseImageCard` 的替换。
     */
    id: 'A10a',
    name: 'upload-in-progress',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.uploadDelayMs = 25_000
      await attachFileToStarter(page, 'n-ready')
      await settle(page, 2500)
    },
  },
  {
    id: 'A10b',
    name: 'upload-failed',
    scene: SCENES.imageReady,
    async prepare(page, mock) {
      mock.uploadFail = true
      await attachFileToStarter(page, 'n-ready')
      await settle(page, 3000)
    },
  },
  {
    // A5 / B1 拖入高亮 —— 合成一次 dragenter/dragover（Playwright 没有原生
    // 「悬停在拖拽中」的手势，只能派事件）
    id: 'A5',
    name: 'drag-over-highlight',
    scene: SCENES.imageStarter,
    async prepare(page) {
      await page.evaluate(() => {
        const zone = document.querySelector('.react-flow__node[data-id="n-empty"]')
        if (!zone) return
        const dt = new DataTransfer()
        dt.items.add(new File(['x'], 'x.png', { type: 'image/png' }))
        for (const type of ['dragenter', 'dragover']) {
          zone.dispatchEvent(
            new DragEvent(type, { bubbles: true, dataTransfer: dt }),
          )
        }
      })
      await settle(page, 800)
    },
  },
  {
    // A9 端口「连接中」—— 按住端口拖出去不松手
    id: 'A9c',
    name: 'port-connecting',
    scene: SCENES.ingredients,
    async prepare(page) {
      const port = page.locator('.canvas-port').first()
      const box = await port.boundingBox()
      if (!box) throw new Error('找不到端口')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 260, box.y + 160, { steps: 12 })
      await settle(page, 700)
    },
  },

  // ── 真实生成序列：一条流程连拍多张 ──────────────────────────────────
  {
    id: 'GEN',
    name: 'generation-sequence',
    scene: SCENES.shotOnly,
    /**
     * ⚠ 这一条会**真的发一次生成请求**（消耗测试账号的额度），owner 2026-08-02
     * 明确授权「可以生成图片试一下」。默认不在全量里跑，只有显式指定 `GEN`
     * 才执行 —— 见 main() 里的 `explicitOnly` 判断。
     *
     * 它是读码永远拿不到的三张：生成中的真实形态、出图瞬间、以及出图后卡边
     * 是否真的转成「待审」（包 6 ①-bis 说来源区分还没做，所有生成结果都会被
     * 标待审 —— 这一张能证实或推翻那条）。
     */
    explicitOnly: true,
    async sequence(page, shoot) {
      await clickNode('n-shot')(page)
      await shoot('01-before')

      const generate = page
        .locator('[role="toolbar"]')
        .getByRole('button', { name: /生成/ })
        .first()
      if ((await generate.count()) === 0) {
        throw new Error('近场工具条上没有「生成」按钮 —— 该节点不具备生成能力')
      }
      if (await generate.isDisabled()) {
        await shoot('02-generate-disabled')
        throw new Error('「生成」按钮是禁用态（多半是没选模型 / 缺 key）')
      }
      await generate.click()
      await settle(page, 2500)
      await shoot('02-generating')

      // 等出图或失败，最多 3 分钟。判据是卡上出现 <img> 或失败文案。
      const deadline = Date.now() + 180_000
      let outcome = 'timeout'
      while (Date.now() < deadline) {
        const hasImage = await page
          .locator('.react-flow__node[data-id="n-shot"] img')
          .count()
        if (hasImage > 0) {
          outcome = 'image'
          break
        }
        const failed = await page
          .locator('.react-flow__node[data-id="n-shot"] .canvas-image-failed')
          .count()
        if (failed > 0) {
          outcome = 'failed'
          break
        }
        await settle(page, 3000)
      }
      await settle(page, 1200)
      await shoot(`03-${outcome}`)
      console.log(`     生成结果：${outcome}`)
    },
  },
  {
    id: 'GEN2',
    name: 'generate-via-composer',
    scene: SCENES.emptyImageOnly,
    /**
     * 走生成框主路径：打提示词 → 换成有 key 的厂商 → 发送。
     *
     * ⚠ 同样**真的发请求**、消耗额度，`explicitOnly`。
     * 为什么要有第二条：GEN（近场工具条的「生成」）实测**根本没发出请求** ——
     * 服务端日志零 POST，卡面 3 分钟无变化。那条路被客户端守卫拦下、只弹了个
     * toast，所以拿不到真实的「生成中 / 出图」形态。
     */
    explicitOnly: true,
    async sequence(page, shoot) {
      await clickNode('n-empty')(page)

      const input = page.locator('.canvas-composer-input').first()
      await input.click()
      await input.fill('a quiet convenience store at night, cinematic')
      await settle(page, 500)

      // 默认模型是没配 key 的 OpenAI；换成账号里唯一有 key 的 Gemini。
      await page.locator('.canvas-composer-model-pill').first().click()
      await settle(page, 800)
      await page.getByText('Gemini', { exact: true }).first().click()
      await settle(page, 900)
      // 二级列表：取第一个可选模型。
      const firstModel = page
        .locator('[role="dialog"], [data-radix-popper-content-wrapper]')
        .getByRole('button')
        .filter({ hasNotText: /搜索|返回|Gemini/ })
        .first()
      if ((await firstModel.count()) > 0) await firstModel.click()
      await settle(page, 900)
      await shoot('01-ready-to-send')

      const send = page.getByRole('button', { name: '发送' }).first()
      if (await send.isDisabled()) {
        await shoot('02-send-disabled')
        throw new Error('发送键是禁用态 —— 提示词或模型没设上')
      }
      await send.click()
      await settle(page, 2500)
      await shoot('02-just-sent')

      const deadline = Date.now() + 180_000
      let outcome = 'timeout'
      while (Date.now() < deadline) {
        if (
          (await page
            .locator('.react-flow__node[data-id="n-empty"] img')
            .count()) > 0
        ) {
          outcome = 'image'
          break
        }
        if (
          (await page
            .locator('.react-flow__node[data-id="n-empty"] .canvas-image-failed')
            .count()) > 0
        ) {
          outcome = 'failed'
          break
        }
        await settle(page, 3000)
      }
      await settle(page, 1200)
      await shoot(`03-${outcome}`)
      console.log(`     生成结果：${outcome}`)

      // 出图后把审核态读出来 —— `LooseImageCard` 把它写进 `data-status`
      // （awaiting-review / rejected / 无）。这是判定包 6 ①-bis 那条
      // 「来源区分未做、所有生成结果都被无条件标待审」的**唯一确定性证据**：
      // 光看截图判不出来，因为蓝色选中环会盖住 warn 边。
      if (outcome === 'image') {
        const reviewState = await page.evaluate(() => {
          const card = document.querySelector(
            '.react-flow__node[data-id="n-empty"] [data-testid="loose-image-card"]',
          )
          return card ? (card.getAttribute('data-status') ?? '(无)') : '(找不到卡)'
        })
        console.log(`     出图后的 data-status：${reviewState}`)
      }
    },
  },
]

/**
 * 助手 mock 的载荷。`/api/studio/node-assistant` 返回的是**纯文本流**，op 提案
 * 用 `[[canvas-ops]]…[[/canvas-ops]]` 包在正文里（`lib/node-assistant-ops.ts`
 * 的 OPEN/CLOSE_MARKER_PATTERN），所以 mock 只要 fulfill 一段文本即可。
 *
 * 为什么 mock 而不真跑：真跑每次回复都不一样，截图无法复现；而且要花钱。
 */
const ASSISTANT_REPLIES = {
  /** G3：一段带标题/列表/加粗/链接的正文 —— 正好照出「markdown 不渲染」。 */
  markdown: [
    '### 1) 角色与穿搭概述 (Overview)',
    '',
    '**主体**：黑发单辫少女，冷白皮，夜色便利店常客。',
    '',
    '- 上装：露肩针织，米白',
    '- 下装：高腰皮短裙',
    '- 鞋履：细跟长靴',
    '',
    '参考风格见 [Nano Banana 2](https://example.com)。',
    '',
    '### 2) 镜头建议',
    '',
    '1. 中景，货架反光带出湿冷感',
    '2. 特写，手拿关东煮，热气入镜',
    '3. 全景，玻璃门外霓虹散焦',
  ].join('\n'),

  /** G4：正文 + 一段合法的 op 批 —— 触发提案卡。 */
  proposal: [
    '好的，我按「深夜便利店」这条线先把骨架铺出来：',
    '',
    '[[canvas-ops]]',
    JSON.stringify({
      ops: [
        { op: 'add_node', intent: 'organize.character', ref: 'c1', name: '小林' },
        { op: 'add_node', intent: 'organize.scene', ref: 's1', name: '深夜便利店' },
        { op: 'add_node', intent: 'image.shot', ref: 'sh1', name: '镜1 · 中景' },
        { op: 'connect', source: 'c1', target: 'sh1' },
        { op: 'connect', source: 's1', target: 'sh1' },
      ],
    }),
    '[[/canvas-ops]]',
    '',
    '确认后我就落到画布上。',
  ].join('\n'),
}

/** G5：`/api/studio/node-script-doc` 返回反问澄清题而不是大纲。 */
const SCRIPT_DOC_QUESTIONS = {
  success: true,
  data: {
    kind: 'questions',
    questions: [
      {
        id: 'q-tone',
        question: '这支片子的调子更偏哪边？',
        options: [
          { id: 'o-warm', label: '温暖治愈' },
          { id: 'o-cold', label: '冷冽疏离' },
          { id: 'o-humor', label: '轻喜剧' },
        ],
        multiSelect: false,
        allowCustom: true,
        allowSkip: true,
      },
      {
        id: 'q-length',
        question: '成片大概多长？',
        options: [
          { id: 'o-15', label: '15 秒' },
          { id: 'o-30', label: '30 秒' },
          { id: 'o-60', label: '1 分钟以上' },
        ],
        multiSelect: false,
        allowCustom: true,
        allowSkip: true,
      },
    ],
  },
}

async function main() {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  await mkdir(OUT_DIR, { recursive: true })

  let storage
  try {
    storage = JSON.parse(await readFile(STORAGE_STATE, 'utf8'))
  } catch {
    console.error(
      `✘ 找不到登录态 ${STORAGE_STATE}\n  先跑: npx playwright test --project="auth setup"`,
    )
    process.exitCode = 1
    return
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({
    storageState: storage,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    locale: 'zh-CN',
  })
  const page = await context.newPage()

  // 场景 / 助手回复都通过 holder 换，路由只注册一次。
  const holder = { record: buildProjectRecord(SCENES.imageReady) }
  const mock = { assistantReply: null, scriptDoc: null }

  // 壁纸夹具图：`CanvasAppearanceImageSchema.url` 只收 http(s)，所以用假域名
  // 再在这里兜成 SVG，不往仓库塞素材。
  await page.route('https://canvas-fixture.local/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: decodeURIComponent(
        svgMedia(1600, 900, '壁纸', 210).replace(
          'data:image/svg+xml;utf8,',
          '',
        ),
      ),
    })
  })

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * 上传三态。真实链路是三步：`/api/upload-image/direct`（prepare，拿预签名
   * uploadUrl）→ **PUT 那个 URL**（真正传字节）→ `/direct/complete`。
   * 这里把 prepare 的返回改指到假域名，再拦那个 PUT —— 延迟就停在「上传中」，
   * 返 500 就是「上传失败」。真 R2 一个字节都不碰。
   */
  await page.route('**/api/upload-image/direct', async (route) => {
    if (!mock.uploadDelayMs && !mock.uploadFail) return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          uploadUrl: 'https://canvas-fixture.local/upload-target',
          key: 'fixture/upload.png',
        },
      }),
    })
  })
  await page.route('https://canvas-fixture.local/upload-target', async (route) => {
    if (mock.uploadFail) {
      await route.fulfill({ status: 500, body: 'fixture upload failure' })
      return
    }
    if (mock.uploadDelayMs) await sleep(mock.uploadDelayMs)
    await route.fulfill({ status: 200, body: '' })
  })

  await page.route('**/api/studio/node-assistant', async (route) => {
    if (mock.assistantStatus) {
      // 失败态：服务端 500（`streamNodeAssistantAPI` 走 !response.ok 分支）
      await route.fulfill({
        status: mock.assistantStatus,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: '助手服务暂时不可用' }),
      })
      return
    }
    if (!mock.assistantReply) return route.continue()
    // 延迟返回 ⇒ 前端停在「思考中」，截得到那一帧
    if (mock.assistantDelayMs) await sleep(mock.assistantDelayMs)
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: mock.assistantReply,
    })
  })
  await page.route('**/api/studio/node-script-doc', async (route) => {
    if (!mock.scriptDoc) return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mock.scriptDoc),
    })
  })
  await page.route('**/api/node-workflow/projects**', async (route) => {
    const isRead = route.request().method() === 'GET'
    // 写入延迟 ⇒ 顶栏的 isSaving 停得住，截得到 spinner
    if (!isRead && mock.projectWriteDelayMs) {
      await sleep(mock.projectWriteDelayMs)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: isRead ? [holder.record] : holder.record,
      }),
    })
  })

  // 先落一个轻页面让 clerk-js 起来并刷新会话，再进画布。storageState 里的
  // `__session` 是短寿 JWT，直接打开受保护路由时它可能已过期、客户端还没来得及
  // 换新的，中间件就把这一跳重定向到 sign-in（实测：同一份 state 第一次成功、
  // 第二次被弹）。
  await page.goto(`${BASE_URL}/zh`, { waitUntil: 'load' })
  await page
    .waitForFunction(
      () => Boolean(window.Clerk?.loaded && window.Clerk?.user),
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => console.warn('  ⚠ Clerk 会话没在 20s 内就绪，继续试'))

  const loadScene = makeSceneLoader(page, holder)

  let taken = 0
  const failures = []
  for (const shot of SHOTS) {
    if (only.length && !only.includes(shot.id)) continue
    // `explicitOnly` 的条目会产生真实副作用（消耗额度），不进全量。
    if (shot.explicitOnly && !only.includes(shot.id)) continue
    const file = path.join(
      OUT_DIR,
      `${shot.id}-${shot.name}${FILE_SUFFIX}.png`,
    )
    try {
      // 每张开拍前把 mock 复位 —— 否则上一张设的延迟/失败会漏到下一张
      // （`mock` 是跨镜头共享的 holder，不复位就会串味）。
      mock.assistantReply = null
      mock.assistantStatus = null
      mock.assistantDelayMs = 0
      mock.scriptDoc = null
      mock.projectWriteDelayMs = 0
      mock.uploadDelayMs = 0
      mock.uploadFail = false

      await loadScene(shot.scene)
      if (page.url().includes('sign-in')) {
        throw new Error('被弹到登录页 —— storageState 过期，重跑 auth setup')
      }

      if (shot.sequence) {
        // 一条流程连拍多张（如真实生成：生成中 → 出图 / 失败）。
        const shoot = async (suffix) => {
          const seqFile = path.join(
            OUT_DIR,
            `${shot.id}-${shot.name}-${suffix}${FILE_SUFFIX}.png`,
          )
          await page.screenshot({ path: seqFile })
          taken += 1
          console.log(`  ✓ ${shot.id} → ${path.relative(REPO, seqFile)}`)
        }
        await shot.sequence(page, shoot, mock)
        continue
      }

      await shot.prepare?.(page, mock)
      await settle(page, 400)
      await withAnnotations(page, shot.marks, async () => {
        if (shot.locator) {
          await page.locator(shot.locator).first().screenshot({ path: file })
        } else {
          await page.screenshot({ path: file, clip: shot.clip })
        }
      })
      taken += 1
      console.log(`  ✓ ${shot.id} → ${path.relative(REPO, file)}`)
    } catch (error) {
      const reason = (
        error instanceof Error ? error.message : String(error)
      ).split('\n')[0]
      failures.push(`${shot.id}: ${reason}`)
      console.log(`  ✘ ${shot.id} 失败 —— ${reason}`)
    }
  }

  await browser.close()
  console.log(`\n完成：${taken} 张 → ${path.relative(REPO, OUT_DIR)}`)
  if (failures.length) {
    console.log(`失败 ${failures.length} 张：\n  ${failures.join('\n  ')}`)
    process.exitCode = 1
  }
}

await main()

/*
 * 已知缺口（逐步补）：
 *  - 视频「有片」态需要真实 mp4：data URI 视频在 <video> 里不稳，后续往 route
 *    里塞一个几 KB 的测试片段
 *  - 375 / 768 断点：另开 context 换 viewport 跑同一份清单
 *  - 助手相关（G2 dock / G4 提案卡 / G5 澄清卡）要 mock
 *    `/api/studio/node-assistant` 与 `/api/assistant/conversation`
 *    （后者目前对新测试账号 500：provisionVerifiedClerkUser 撞
 *    「Verified email relinking is only allowed in Production」+ clerkId 唯一约束）
 *  - 详情面板 / 重编辑工作区 / Inspector：给 SHOTS 补 prepare（点 ⤢ 展开）
 */
