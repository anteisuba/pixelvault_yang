/**
 * 计划卡待定项的**图示词表**（`docs/references/pages/assistant-shell.md` §9）。
 *
 * ── 为什么是一张封闭表，而不是「让模型给个图标名」 ──────────────────
 * 模型对图标库的记忆是编出来的：给它自由，它会写 `Camera3Alt`、`sunset-outline`、
 * 「一个女孩的剪影」。任何一条都画不出来，而卡上就会出现一个空图位或者一个
 * 「看起来差不多」的错图标 —— 后者更糟，因为它是**能被误读的**信息。
 * 所以这一侧是枚举：模型只能从下面 32 个 id 里挑，挑不中就留空，前端退化成纯文字。
 *
 * ── 三种画法，判据是「这东西画得出线描吗」 ─────────────────────────
 *  · `lucide`  —— 图标库里**真的有**（逐个在 `node_modules` 里确认过），直接用；
 *  · `paths` / `ratio` —— 图标库里没有「方向」这一套（构图 / 比例 / 摇镜 / 光位），
 *    自绘 24×24 线描，`currentColor` 描边，选中态跟着 `text-primary` 走；
 *  · `swatch` —— 风格是气质，线描画不出来，用两个**脊柱 token** 混出来的渐变块。
 *    ⛔ 这里一个 hex 都不许出现：色块也得跟着明暗主题走。
 *
 * ── 校验纪律 ───────────────────────────────────────────────────────
 * 非法 `visual` **剥成 `undefined` 并 `logger.warn`**（服务端做），⛔ 不让整张计划卡
 * 因为模型写错一个 id 就解析失败 —— 与 `ruleHits` 里那条逐字同源。
 *
 * ⚠ 这个文件**不 import zod**（全仓 `src/constants/` 零个 import zod）：`visual`
 * 的 schema 住 `src/types/assistant-operator.ts`，用这里的 `ASSISTANT_PLAN_VISUAL_IDS`
 * 建枚举。
 */

/** 一格图示的画法族。`icon` = 线描（lucide 或自绘），`swatch` = 渐变色块。 */
export const ASSISTANT_PLAN_VISUAL_KINDS = {
  icon: 'icon',
  swatch: 'swatch',
} as const

export type AssistantPlanVisualKind =
  (typeof ASSISTANT_PLAN_VISUAL_KINDS)[keyof typeof ASSISTANT_PLAN_VISUAL_KINDS]

/**
 * 一项图示。
 *
 * ⚠ `lucide` / `paths` / `ratio` / `swatch` **恰好在场一个** —— 由下面那张表逐条
 * 写死，并由 `assistant-plan-visuals.test` 那条穷举用例锁住。写成四个可选字段
 * 而不是可辨识联合，是因为渲染那一侧本来就要按「有没有」分支；多一层 tag
 * 只是让 34px 一格的画法多一次转译。
 */
export interface AssistantPlanVisual {
  id: string
  /** i18n 键后缀（`StudioOperator.planVisual.*`）—— 图示的**无障碍名**，⛔ 不是文案。 */
  labelKey: string
  kind: AssistantPlanVisualKind
  /** `@/components/icons` 里的组件名。⚠ 存名字不存组件：constants 不该把图标库拖进包体。 */
  lucide?: string
  /** 自绘线描：24×24 viewBox 里的一组 `d`，统一 `currentColor` 1.5px 描边、无填充。 */
  paths?: readonly string[]
  /** 比例：画一个居中的线框矩形，长宽比就是这一对数。 */
  ratio?: readonly [number, number]
  /** 渐变两端的**token 名**（⛔ 不是 hex）—— 渲染时各自 `color-mix` 到卡底上。 */
  swatch?: readonly [string, string]
}

/**
 * 渐变两端各自混到卡底上的比例。
 *
 * 🔬 26/26 那一版实测过（contrast-check 2026-09-06）：起点对卡底只有 1.4–1.9，
 * 四格几乎看不出区别 —— 一个看不见的图示比没有图示还糟。55/22 起点落在 2.2–6.1，
 * 尾端仍然是一层薄雾（1.0–1.6），色块因此有方向感而不抢标签。
 */
export const ASSISTANT_PLAN_SWATCH_MIX = { from: 55, to: 22 } as const

/** 取景框 —— 构图那一组每格都套着它，所以只写一遍。 */
const FRAME_PATH = 'M4 3h16v18H4z'
/** 被打光的那个主体（光线组共用）。 */
const SUBJECT_PATH = 'M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0'

/**
 * **7 组 32 项**（§9 的词表原样落地）。
 *
 * ⚠ 顺序即分组顺序：系统提示里那段逐项列全的清单直接由它生成
 * （`buildPlanVisualSection`），⛔ 别在提示词里手抄一份 —— 抄的那份一定会先过期。
 */
export const ASSISTANT_PLAN_VISUALS = [
  // ── 构图 6 · 图标库没有「取多少身」这一套，自绘 ───────────────────
  {
    id: 'comp.fullBody',
    labelKey: 'comp.fullBody',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      FRAME_PATH,
      'M10 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
      'M12 9v6',
      'M8.5 11.5h7',
      'M12 15l-2.5 4M12 15l2.5 4',
    ],
  },
  {
    id: 'comp.halfBody',
    labelKey: 'comp.halfBody',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      FRAME_PATH,
      'M9.5 7a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
      'M12 9.5v11.5',
      'M7 13.5h10',
      'M4 17h3M17 17h3',
    ],
  },
  {
    id: 'comp.closeUp',
    labelKey: 'comp.closeUp',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      FRAME_PATH,
      'M7 11a5 5 0 1 0 10 0a5 5 0 1 0 -10 0',
      'M12 16v5',
      'M4 8h3M17 8h3',
    ],
  },
  {
    id: 'comp.birdsEye',
    labelKey: 'comp.birdsEye',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      FRAME_PATH,
      'M8.5 15a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0',
      'M12 5v5',
      'M9.5 7.5L12 10l2.5-2.5',
    ],
  },
  {
    id: 'comp.wormsEye',
    labelKey: 'comp.wormsEye',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      FRAME_PATH,
      'M8.5 9a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0',
      'M12 19v-5',
      'M9.5 16.5L12 14l2.5 2.5',
    ],
  },
  {
    id: 'comp.fromBehind',
    labelKey: 'comp.fromBehind',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      FRAME_PATH,
      'M9.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
      'M6.5 21v-3a5.5 5.5 0 0 1 11 0v3',
      'M12 10.5v2',
    ],
  },

  // ── 比例 5 · 同一支画法，只换那一对数 ────────────────────────────
  {
    id: 'ratio.1x1',
    labelKey: 'ratio.1x1',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    ratio: [1, 1],
  },
  {
    id: 'ratio.3x4',
    labelKey: 'ratio.3x4',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    ratio: [3, 4],
  },
  {
    id: 'ratio.4x3',
    labelKey: 'ratio.4x3',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    ratio: [4, 3],
  },
  {
    id: 'ratio.16x9',
    labelKey: 'ratio.16x9',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    ratio: [16, 9],
  },
  {
    id: 'ratio.9x16',
    labelKey: 'ratio.9x16',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    ratio: [9, 16],
  },

  // ── 时段 4 · lucide 直接有 ────────────────────────────────────────
  {
    id: 'time.day',
    labelKey: 'time.day',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'Sun',
  },
  {
    id: 'time.dusk',
    labelKey: 'time.dusk',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'Sunset',
  },
  {
    id: 'time.night',
    labelKey: 'time.night',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'Moon',
  },
  {
    id: 'time.dawn',
    labelKey: 'time.dawn',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'Sunrise',
  },

  // ── 天气 4 · lucide 直接有 ────────────────────────────────────────
  {
    id: 'weather.clear',
    labelKey: 'weather.clear',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'CloudSun',
  },
  {
    id: 'weather.rain',
    labelKey: 'weather.rain',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'CloudRain',
  },
  {
    id: 'weather.snow',
    labelKey: 'weather.snow',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'CloudSnow',
  },
  {
    id: 'weather.fog',
    labelKey: 'weather.fog',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'CloudFog',
  },

  // ── 镜头 5 · 四条借 lucide，「摇」自绘（图标库里没有绕轴那一支）───
  {
    id: 'cam.push',
    labelKey: 'cam.push',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'ZoomIn',
  },
  {
    id: 'cam.pull',
    labelKey: 'cam.pull',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'ZoomOut',
  },
  {
    id: 'cam.pan',
    labelKey: 'cam.pan',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      'M5 10h14v9H5z',
      'M3 7c3-3 15-3 18 0',
      'M3 7l1-2.4M3 7l2.4-1',
      'M21 7l-1-2.4M21 7l-2.4-1',
    ],
  },
  {
    id: 'cam.track',
    labelKey: 'cam.track',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'MoveHorizontal',
  },
  {
    id: 'cam.static',
    labelKey: 'cam.static',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    lucide: 'Frame',
  },

  // ── 光线 4 · 主体 + 光源方向；柔光多一圈打散的光晕 ────────────────
  {
    id: 'light.front',
    labelKey: 'light.front',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [SUBJECT_PATH, 'M6 21l2-2.5', 'M12 22v-3', 'M18 21l-2-2.5'],
  },
  {
    id: 'light.back',
    labelKey: 'light.back',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [SUBJECT_PATH, 'M6 3l2 2.5', 'M12 2v3', 'M18 3l-2 2.5'],
  },
  {
    id: 'light.side',
    labelKey: 'light.side',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [SUBJECT_PATH, 'M2 8l2.5 1.5', 'M2 12h3', 'M2 16l2.5-1.5'],
  },
  {
    id: 'light.soft',
    labelKey: 'light.soft',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.icon,
    paths: [
      SUBJECT_PATH,
      'M17.8 10.45A6 6 0 0 0 13.55 6.2',
      'M10.45 6.2A6 6 0 0 0 6.2 10.45',
      'M6.2 13.55A6 6 0 0 0 10.45 17.8',
      'M13.55 17.8A6 6 0 0 0 17.8 13.55',
    ],
  },

  /**
   * ── 风格 4 · 渐变色块，只用脊柱 token ──────────────────────────────
   *
   * ⚠ 四对**必须彼此认得出来**：脊柱里唯一带色相的就是 `--status-*`（§9 明确允许
   * 色块用它们），别的全是无彩灰。全部用灰的下场很具体 —— 四格长得一模一样，
   * 图示反而比纯文字更难认。
   * ⚠ 它们在这里是**材质取样**不是状态标记：色块上没有一个字，也不表示成败。
   * 🔬 contrast-check（2026-09-06，`ASSISTANT_PLAN_SWATCH_MIX` 那对混合比下）：
   *    浅色起点对卡底 4.74 / 2.24 / 2.42 / 4.42，深色 6.14 / 2.98 / 3.72 / 5.91 ——
   *    全部是**装饰性色块**（无文字压在上面），门槛只有「看得出来」，
   *    而可读的那一半由格子里的标签文字承担（`text-2xs` 走 foreground / primary）。
   */
  {
    id: 'style.anime',
    labelKey: 'style.anime',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.swatch,
    swatch: ['--primary', '--status-applied'],
  },
  {
    id: 'style.realistic',
    labelKey: 'style.realistic',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.swatch,
    swatch: ['--muted-foreground', '--muted'],
  },
  {
    id: 'style.painterly',
    labelKey: 'style.painterly',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.swatch,
    swatch: ['--status-warning', '--status-risk'],
  },
  {
    id: 'style.lineart',
    labelKey: 'style.lineart',
    kind: ASSISTANT_PLAN_VISUAL_KINDS.swatch,
    swatch: ['--foreground', '--background'],
  },
] as const satisfies readonly AssistantPlanVisual[]

export type AssistantPlanVisualId =
  (typeof ASSISTANT_PLAN_VISUALS)[number]['id']

/** Zod 枚举与系统提示两处都吃它。⚠ 断言成非空元组：`z.enum` 要的是这个形状。 */
export const ASSISTANT_PLAN_VISUAL_IDS = ASSISTANT_PLAN_VISUALS.map(
  (visual) => visual.id,
) as unknown as readonly [AssistantPlanVisualId, ...AssistantPlanVisualId[]]

/**
 * 查出来的那一项 —— 与 `AssistantPlanVisual` 只差 `id` 收窄成字面量联合。
 *
 * ⚠ 分成两个类型是因为**表自己要先过 `satisfies`**：`AssistantPlanVisual.id` 写成
 * 字面量联合会绕回表本身（循环引用）。所以基类型收 `string`，查询出口收窄。
 * 收窄的意义很具体：服务端把它写进 `ask` 帧选项的 `visual`，而那一格是 `z.enum`。
 */
export type AssistantPlanVisualEntry = Omit<AssistantPlanVisual, 'id'> & {
  id: AssistantPlanVisualId
}

const VISUAL_BY_ID = new Map<string, AssistantPlanVisualEntry>(
  ASSISTANT_PLAN_VISUALS.map((visual) => [visual.id, visual]),
)

export function getAssistantPlanVisual(
  id: string | undefined,
): AssistantPlanVisualEntry | null {
  if (!id) return null
  return VISUAL_BY_ID.get(id) ?? null
}

/**
 * 系统提示里那段**逐项列全**的清单（§9 原话：「只写『从预置词表里选』= 模型必然自造」）。
 *
 * ⚠ 分组名就是 id 的前缀 —— 词表加一项、改一组，这段自己跟着变，⛔ 不必手抄。
 */
export function buildAssistantPlanVisualCatalog(): string {
  const groups = new Map<string, string[]>()
  for (const visual of ASSISTANT_PLAN_VISUALS) {
    const [group] = visual.id.split('.')
    const bucket = groups.get(group)
    if (bucket) bucket.push(visual.id)
    else groups.set(group, [visual.id])
  }
  return [...groups.entries()]
    .map(([group, ids]) => `  ${group}: ${ids.join(' ')}`)
    .join('\n')
}
