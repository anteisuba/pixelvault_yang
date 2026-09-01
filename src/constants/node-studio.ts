import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import type { NodeImageRole } from '@/constants/node-types'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'

/** Default on-canvas size for role-less pure images (px). NodeResizer grows from here. */
export const NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE = 320

/**
 * S4（2026-07-27）图片卡宽钳制 —— canvas-image-card.md §2：「宽度按媒体真实
 * 比例计算，钳制在 min 180 / max 480，高度由比例导出，不提供拖拽把手」。
 * `referenceHeight` 是基准原文没写出来的中间值：按基准给的三组参考尺寸
 * （9:16→180×320 触下限 / 16:9→400×225 自然宽 / 21:9→480×206 触上限）反推——
 * 三组数字都能用「目标高度 225，宽度按比例导出后再夹进 [180,480]」精确还原
 * （16:9 时 225×16/9=400 不触限，验证成立）。这不是基准写明的公式，是本次
 * 实现按例子反推所得，如与设计意图不符请回来只改这一个数字。
 */
export const NODE_STUDIO_IMAGE_CARD_SIZE = {
  minWidth: 180,
  maxWidth: 480,
  referenceHeight: 225,
} as const

/**
 * 卡外名字条（S1「卡名移出卡框」）占的高度，近场工具条要让开它。
 *
 * ⚠ 两个数**单位不同**，别加在一起当常量用：`height` 是**画布像素**（名字长
 * 在卡里，跟着缩放变大），`toolbarGap` 是**屏幕像素**（NodeToolbar 的 offset
 * 故意不随缩放变）。所以正确的让位量是 `height × zoom + toolbarGap`，写死一
 * 个 36 只在 100% 缩放对 —— 200% 时名字实际占 48 屏幕像素，工具条会压上去。
 *
 * height 与 canvas.css `.canvas-card-label` 的 `--canvas-text-name-lh`（24px）
 * + `margin-bottom: 4px` 同源，改那边记得改这里。
 */
export const NODE_STUDIO_CARD_LABEL_LANE = {
  height: 28,
  toolbarGap: 8,
} as const

export const NODE_STUDIO_CANVAS = {
  // A3（canvas-relationship-v3 §7b）：owner 手动缩到 200% 实测拍板为舒适基准，
  // 提为默认视图。项目状态目前不持久化 viewport（见 use-node-workflow.ts），
  // 所以这只是 ReactFlow 挂载时的初始值——同一会话内切换项目不会重置视口
  // （ReactFlow 实例不重挂载），新开页面/新项目都落在这个基准上。
  defaultViewport: {
    x: 0,
    y: 0,
    zoom: 2,
  },
  background: {
    // S1（2026-07-26）：44 → 48，对齐画布域皮肤 v0.2 §1（实测参考站
    // background-size 33.74px @ 70% 缩放 → 基准 ≈48px）。
    gap: 48,
    // 点直径 2px（半径 1px），同规格。
    size: 2,
    // 点色不再写死：`CanvasSurface` 按当前底色的亮度算 `--canvas-grid-dot`，
    // 这里只留一个底色解析失败时的兜底值。
    color: '#403a2f',
  },
  defaultZoomPercent: 200,
  // A3: 手动缩放边界（滚轮/±按钮），显式收进常量避免依赖库默认值（之前未传
  // minZoom/maxZoom 给 <ReactFlow>，隐式吃 @xyflow/react 的 0.5/2 默认档）。
  // 下限放宽到 30% 方便看全局；上限放到 200% 基准之上留手动继续放大的余量。
  minZoom: 0.3,
  maxZoom: 4,
  // A3: 「适应画布」按钮/自动 fit 的独立放大上限——与上面手动滚轮上限
  // (maxZoom) 分开，让 fitView 稳定停在 200% 舒适档，不因为 maxZoom 提到 4
  // 而在节点很少时把画布怼到 400%。
  fitViewMaxZoom: 2,
  // Separate a stationary click from an intentional node move. React Flow's
  // zero default fires drag-start on pointer-down, which makes "click opens
  // contextual UI, drag only repositions" impossible to distinguish.
  nodeDragThreshold: 6,
  // D3 Figma 级平移：中键(1)+右键(2) 拖拽平移画板；左键留给选择/框选。
  panOnDragButtons: [1, 2],
  // 空格 + 左键拖 = 临时平移（对齐 Figma）。
  panActivationKeyCode: 'Space',
} as const

export const NODE_STUDIO_CANVAS_APPEARANCE_FITS = ['cover', 'contain'] as const

/**
 * Project-level canvas wallpaper defaults. The hook intentionally leaves the
 * persisted `canvasAppearance` field undefined for untouched projects; UI
 * consumers resolve that absence against this constant instead.
 */
export const NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT = {
  /**
   * S1（2026-07-26）：从旧皮暖炭 `#14120F` 改为画布域皮肤 v0.2 的底色。
   * 白卡靠「比底亮一档」浮起（卡对底 1.13:1，规格 §1/§2），底若是纯白或纯黑
   * 这个层次就塌了——所以域默认底必须和 `--canvas-bg` 同值。
   * ⚠ 只改**默认**：项目显式设过 `canvasAppearance` 的仍然照用户的来，
   * 由 `getCanvasCardLineColor` 在底色与卡背过近时加重卡边兜底。
   */
  backgroundColor: '#F1F1F1',
  image: undefined,
} as const

/**
 * Canvas surface presets. S10（2026-07-27，owner 拍板 token-inversion §4.5）：
 * 域级令牌反转后画布面板全变白，原 9 档里 6 档深色（含 #000000）会让用户选中
 * 深底时变成「黑底白盒」——v0.2 是浅色域，那些深档是旧皮时代的遗产，直接精简
 * 掉而不是接线 `.domain-canvas[data-scheme='dark']`（那块 CSS 保留但本轮没有
 * 激活路径，见 canvas.css 该处注释）。补 #F1F1F1：它是
 * `NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT` 的值，原先却没进这份预设列表。
 * 已持久化的 `canvasAppearance.backgroundColor` 不受影响——这里只改预设菜单
 * 展示哪些色板，不改已存的值；自定义取色器（下方 <input type="color">）仍
 * 保留，用户仍能选任意颜色包括深色，不在这次限制范围内。
 */
export const NODE_STUDIO_CANVAS_APPEARANCE_PRESETS = [
  '#FFFFFF',
  '#F4F4F3',
  '#F1F1F1',
] as const

export const NODE_STUDIO_REACT_FLOW_PRO_OPTIONS = {
  hideAttribution: true,
} as const

export const NODE_STUDIO_PLACEHOLDER_TOAST = {
  durationMs: 1600,
  position: 'bottom-right',
} as const

export const NODE_STUDIO_ADD_MENU = {
  viewportPaddingPx: 16,
  minAvailableHeightPx: 240,
  /** 《画布修法》A1：outside-pointerdown 关菜单后，武装「下一次 click 要
   *  吞掉」的有效期上限——超过这个窗口还没等到 click（比如手势中途被打断），
   *  就不再吞，避免误伤很久之后一次不相关的点击。见 CanvasAddMenu.tsx。 */
  outsideClickSuppressWindowMs: 2000,
  /** P1 误触修复：菜单锚在左栏面板右外缘时留的这道缝。和面板自己的 `left-4`
   *  同级的小间距——只是让菜单不贴着面板边，不是布局参数。 */
  panelGapPx: 8,
} as const

export const NODE_STUDIO_BOTTOM_DOCK = {
  canvasInsetPx: 16,
} as const

export const NODE_STUDIO_TOOL_MODE_IDS = {
  pointer: 'pointer',
  hand: 'hand',
  connect: 'connect',
  cut: 'cut',
} as const

export const NODE_STUDIO_TOOL_MODES = [
  NODE_STUDIO_TOOL_MODE_IDS.pointer,
  NODE_STUDIO_TOOL_MODE_IDS.hand,
] as const

/**
 * `connect` and `cut` remain valid migration values for persisted sessions,
 * but are intentionally absent from the visible toolbar while relationships
 * are expressed through ingest and ingredient chips instead of drawn edges.
 */
export type NodeStudioToolMode =
  (typeof NODE_STUDIO_TOOL_MODE_IDS)[keyof typeof NODE_STUDIO_TOOL_MODE_IDS]

export const NODE_STUDIO_WORKFLOW_STORAGE = {
  keyPrefix: 'pixelvault.nodeStudio.v3',
  // Old key with no per-user scoping. Wiped once on hook mount so a
  // previous account's local state can't leak into a new sign-in on the
  // same browser. See [[fix-node-workflow-account-isolation]] in commit msg.
  legacyGlobalKey: 'pixelvault.nodeStudio.v3',
  debounceMs: 400,
  version: 3,
  legacyVersion: 1,
  legacyVersionV2: 2,
  /**
   * The two names browsers use for "localStorage is full". Chromium/WebKit
   * throw a `DOMException` named `QuotaExceededError`; Firefox still uses the
   * legacy `NS_ERROR_DOM_QUOTA_REACHED` spelling. Matched by name because
   * `DOMException.code` is 0 in Firefox's legacy path and there is no shared
   * error class to `instanceof` against.
   *
   * ⚠ The quota is not counted in the bytes you can measure with
   * `Buffer.byteLength` — Chromium bills localStorage in UTF-16 code units
   * (2 bytes per char), so an ASCII snapshot burns roughly twice its byte
   * size against the ~5 MB ceiling.
   */
  quotaExceededErrorNames: ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'],
} as const

export const NODE_STUDIO_IMAGE_EDIT_HANDOFF = {
  toolId: 'image-edit',
  queryKeys: {
    tool: 'canvasTool',
    sourceUrl: 'sourceUrl',
    generationId: 'generationId',
    width: 'width',
    height: 'height',
    editTask: 'editTask',
  },
  maxSourceUrlLength: 4000,
  maxEditTaskLength: 80,
} as const

export function getNodeStudioWorkflowStorageKey(clerkId: string): string {
  return `${NODE_STUDIO_WORKFLOW_STORAGE.keyPrefix}.${clerkId}`
}

export const NODE_STUDIO_PROJECTS = {
  idMaxLength: 160,
  nameMaxLength: 80,
  timestampMaxLength: 80,
  fallbackName: 'Node Studio Project',
} as const

export const NODE_STUDIO_AGENT_MODE_IDS = {
  storyBreakdown: 'storyBreakdown',
  seedancePrompt: 'seedancePrompt',
} as const

export const NODE_STUDIO_AGENT_MODES = [
  NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
  NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt,
] as const

export const NODE_STUDIO_ASSISTANT_MESSAGE_ROLES = [
  'user',
  'assistant',
] as const

export const NODE_STUDIO_ASSISTANT_LIMITS = {
  // Conversation has no product UX cap — these are DoS / payload guards only.
  // Keep high enough that multi-turn canvas chats never 400 on stored history.
  // The first model request receives the full sanitized transcript. This is
  // only the retry target after a provider explicitly rejects its context.
  maxMessages: 500,
  maxMessageLength: 100_000,
  maxNodes: 32,
  maxNodeLabelLength: 160,
  maxNodeSummaryLength: 900,
  maxSelectedNodes: 12,
  /**
   * 一个节点的参考图现值最多列几条（切片 5 第二批）。数据层的实际上限是
   * `resolveReferenceAssetLimit`（收集器卡 3），这里比它宽一点只是为了让存量
   * 超额的卡也说得出实情，而不是被截断成看起来没满。
   */
  maxNodeReferences: 6,
  /**
   * 「能换成哪些模型」这段目录**每个模态**最多列几个 id（`set_model` 的取值范围）。
   * 与 studio 的 `maxCatalogModels` 同性质：不给列表模型就会自己编一个 id，
   * 给全量则是每一轮都付一次目录的 token。
   *
   * ⚠ 32 是量出来的不是拍的：今天三组共 45 个可用模型、整段约 1000 字符
   * （~300 token），视频那组 26 个最多。取 24 会把 **Seedance 2.5 整族切掉**
   * （目录按推荐序排，2.5 在末尾），表现就是「助手只会用老模型」。真超了按
   * `…and N more not listed` 如实说，不假装列全了。
   */
  maxCatalogModels: 32,
  maxReferences: ASSISTANT_MEDIA_LIMITS.maxReferences,
  contextCompactionTargetLength: 32_000,
} as const

export const NODE_STUDIO_ASSISTANT = {
  gatewayModelId: 'openai/gpt-5.6-sol',
  fallbackModelLabel: 'Workspace BYOK route',
} as const

export const NODE_STUDIO_ASSISTANT_MESSAGE_PREVIEW = {
  collapseThresholdChars: 360,
  maxPreviewChars: 220,
} as const

export const NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS = {
  auto: 'node-studio-assistant:auto',
  keyPrefix: 'node-studio-assistant:key',
  setupPrefix: 'node-studio-assistant:setup',
} as const

// Multiple tiers per adapter since 2026-08-23 (owner decree: expose GPT-5.6's
// three price tiers and let the user pick). The FIRST entry for an adapter is
// its default tier — resolveAssistantModelId below relies on this ordering.
export const NODE_STUDIO_ASSISTANT_ROUTE_MODELS = [
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_SOL,
    label: 'OpenAI GPT-5.6 Sol',
  },
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_TERRA,
    label: 'OpenAI GPT-5.6 Terra',
  },
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_6_LUNA,
    label: 'OpenAI GPT-5.6 Luna',
  },
  {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_7_FLASH,
    label: 'Gemini 3.7 Flash',
  },
  {
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    label: 'DeepSeek V4 Pro',
  },
  {
    // DeepSeek's image contract belongs to this experimental model only.
    // V4 Pro remains the first/default DeepSeek tier and stays text-only.
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_FLASH_VISION_EXP,
    label: 'DeepSeek V4 Flash Vision Exp',
  },
  {
    // 2026-07-26: Qwen3 Max exits the assistant route (owner decree) — Claude
    // Sonnet 5 takes its slot as the structural-reasoning route (multi-scene
    // continuity, character arcs, shot planning). Text-only, same as the
    // other three — no image/video input on this route yet.
    adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5,
    label: 'Claude Sonnet 5',
  },
  {
    // 2026-08-23: xAI joins as the fifth assistant route. 500k context with
    // vision at $2/$6 — the cheapest flagship on this route.
    adapterType: AI_ADAPTER_TYPES.XAI,
    modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_6,
    label: 'Grok 4.6',
  },
] as const

/**
 * Resolve the assistant modelId for an adapter, honoring an explicit tier the
 * client picked. An unknown (adapterType, modelId) pair falls back to the
 * adapter's default (first) entry instead of trusting the wire value — the
 * route table stays the only source of callable assistant models.
 */
export function resolveAssistantModelId(
  adapterType: AI_ADAPTER_TYPES,
  requestedModelId?: string,
): string | undefined {
  const entries = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.filter(
    (m) => m.adapterType === adapterType,
  )
  if (entries.length === 0) return undefined
  if (requestedModelId) {
    const match = entries.find((m) => m.modelId === requestedModelId)
    if (match) return match.modelId
  }
  return entries[0].modelId
}

export const NODE_STUDIO_DOCK = {
  focusZoom: 0.95,
  focusDurationMs: 420,
} as const

/**
 * Cast 卡匣（references/pages/node-canvas.md §6.2）：mirrors the identity
 * nodes (character/background/voice/videoReference) already on the ReactFlow
 * canvas as a second, dock-level presentation. Horizontal inset/avoidance
 * reuses `NODE_STUDIO_BOTTOM_DOCK` (same "clear the assistant dock" math as
 * the toolbar); this only holds the dock's own layout constants.
 *
 * S5d ①「卡匣回横匣」: reverted from the S5b/S5c popover-flyout form back to
 * S5a's always-visible horizontal strip (owner-flagged regression — the
 * flyout hid the dock behind an extra click). The flyout-era fields
 * (`flyoutGridColumns` / `flyoutMaxHeightPx`) are retired; the strip fields
 * below replace them.
 */
export const NODE_STUDIO_CAST_DOCK = {
  /** Card grid columns worth of horizontal breathing room before a section's
   *  row scrolls — used only as a doc-comment budget check, not read at
   *  runtime (§6.2 "一屏可见 6-8 张"). */
  targetVisibleCards: 8,
  /** Deterministic "static tilt" (§6.2 静置微倾): a card's rotation is picked
   *  from this list by hashing its (stable) node id — same card always gets
   *  the same angle across re-renders, never `Math.random()`. */
  tiltClasses: ['-rotate-2', '-rotate-1', 'rotate-1', 'rotate-2'] as const,
  /** Left inset reserving the minimap's horizontal footprint so the strip
   *  never covers it (chrome 实测 2026-07-10：不留位时整块盖住 minimap)。
   *  = minimap md:!left-6 (24px) + !w-48 (192px) + 16px gap. The minimap and
   *  the dock share the same render condition (nodes.length > 0), so the
   *  clearance is unconditional. */
  minimapClearancePx: 232,
  /** S5d ①: fixed card width (Tailwind standard scale, not an arbitrary
   *  value — Hard Rule 5) for a card inside the strip's horizontal-scroll
   *  flex row. `CastCard` itself renders `w-full` (S5c's grid-column-driven
   *  sizing, task packet says "CastCard 组件与徽章不动"), so the strip wraps
   *  every card in a fixed-width flex item instead of touching CastCard. */
  barCardWidthClass: 'w-24',
  /** Fixed width for a section's leading label tile (icon + name + count),
   *  same scale family as `barCardWidthClass` so the label reads as its own
   *  "card" in the horizontal flow. */
  barSectionLabelWidthClass: 'w-16',
  /** Bottom offset (px) clearing the toolbar row (`bottom-3` + ~44px tall
   *  pill + gap) so the expanded strip floats just above it instead of
   *  overlapping (§6.2 "工具条上方"). */
  barBottomOffsetPx: 68,
  /** 【紧急修复】折叠把手定位 (owner 2026-07-10 实测反馈②): the COLLAPSED
   *  pill anchors at the SAME bottom offset as the toolbar row (Tailwind
   *  `bottom-3` = 12px, mirrored here as a number since the pill is
   *  positioned via inline style, not a static class) instead of
   *  `barBottomOffsetPx` — sitting that much higher put it over arbitrary
   *  canvas node content instead of reading as "part of the bottom chrome."
   */
  collapsedBottomOffsetPx: 12,
} as const

/**
 * 吞噬拒绝原因（B1-5 原因气泡）。类型不合走连线合法性矩阵；已含该卡 = 目标已有
 * 同源边；参考位已满 = 契约上限命中（可得上限才带 n/m，见 use-cast-ingest.ts）。
 */
export const NODE_STUDIO_INGEST_REJECT_REASON_IDS = {
  typeMismatch: 'typeMismatch',
  duplicate: 'duplicate',
  capacityFull: 'capacityFull',
} as const

export type NodeStudioIngestRejectReason =
  (typeof NODE_STUDIO_INGEST_REJECT_REASON_IDS)[keyof typeof NODE_STUDIO_INGEST_REJECT_REASON_IDS]

/** B2 快投模式（§6.3 增强三件套②）。 */
export const NODE_STUDIO_INGEST_QUICK_THROW = {
  /** 触屏长按等效阈值 — 桌面用 hover 浮出投放钮，不用此值。 */
  longPressMs: 420,
} as const

/**
 * S5f B 磁吸（§6.3 增强三件套①）+ 折叠把手热区（B4）。§6.3 只说"指针阈值
 * 半径内最近目标张口满档"，未给数值——两档都按 44px 触达纪律的整数邻域取
 * （96 ≈ 两指宽，64 ≈ 一次触达半径），owner 手感不合适可只调这里。
 */
export const NODE_STUDIO_INGEST_MAGNET = {
  /** 指针到目标卡矩形边缘的吸附距离（px）：半径内最近合法目标张口满档，
   *  松手视同落在该目标上（磁吸不只是视觉，也放宽落点精度）。 */
  snapRadiusPx: 96,
  /** 折叠把手热区（B4）：拖拽中的实体距折叠把手矩形此距离内 → 横匣临时
   *  展开；松手/取消后回折叠态。 */
  handleHotZonePx: 64,
} as const

/**
 * 分类清单（§6.0 业务模型 v3.1，S5d 修正③）：预设 + 自定义。第一批 5 个
 * （identity/pose/style/composition/background）是 pre-S5d 的既有枚举值，向后
 * 兼容保留原样；后 5 个 + `custom` 是本片新增（enum 扩值，旧存档 parse 不炸）。
 * `custom` 与 `NodeWorkflowReferenceAssetSchema.customLabel` /
 * `NodeWorkflowNodeDataSchema.imageCategoryLabel` 配对使用——role/imageCategory
 * 存 `'custom'`，实际展示文本存在对应的 *Label 字段里。
 */
export const NODE_STUDIO_REFERENCE_ROLES = [
  'identity',
  'pose',
  'style',
  'composition',
  'background',
  'faceCloseup',
  'costume',
  'prop',
  'frameStart',
  'frameEnd',
  'custom',
] as const

export const NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID = 'custom' as const

export type NodeStudioReferenceRole =
  (typeof NODE_STUDIO_REFERENCE_ROLES)[number]

/**
 * 一个字符串是不是这 11 个分类之一。
 *
 * 存在的理由是**助手写进来的分类值**（`set_image_category`，切片 5 第一批）：
 * 那条 op 的 schema 有意收成自由字符串（收进 `z.enum` 会让一条写错分类的 op 把
 * 整批提案带崩，见 `NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownCategory`），
 * 所以收窄发生在规划器里，判据必须是**这张表本身**，⛔ 不许模糊匹配 / 大小写
 * 归一 / 同义词映射 —— 猜错一个分类，用户看到的是关键帧首尾接反。
 */
export function isNodeStudioReferenceRole(
  value: string,
): value is NodeStudioReferenceRole {
  return (NODE_STUDIO_REFERENCE_ROLES as readonly string[]).includes(value)
}

/**
 * 「未分类」在 Select 里的哨兵值（台账 F1，2026-08-02）。
 *
 * 数据层的「未分类」是 `imageCategory: undefined`，但 Radix SelectItem
 * **禁止 `value=""`**（空串是它内部表示「无选中」的保留值），原生 `<select>`
 * 时代直接用空串的写法换不过去。落库前映射回 `undefined`，不进数据。
 *
 * ⚠ 第二个消费者（切片 5 第一批）：**助手 payload 里的节点分类现值**
 * （`NodeAssistantNodeContextSchema.imageCategory`）。同一个问题的同一个答案 ——
 * 「字段在、值为空」需要一个说得出口的值，而 undefined 在那里表示的是另一件事
 * （这个节点根本没有分类字段）。同样不进数据。
 *
 * ⚠ 第三个消费者（切片 5 第二批）：**节点的模型现值**
 * （`NodeAssistantNodeContextSchema.model`）。名字里的 IMAGE_CATEGORY 是它的
 * 历史出处，值本身早已是助手 payload 通用的「字段在、值为空」哨兵 —— 再造一个
 * 拼法相同的 `..._MODEL_UNSET_ID` 只会让同一个词有两个家。
 */
export const NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID = 'unset' as const

/**
 * 「未绑定角色卡」在 Select 里的哨兵值（台账 #10，2026-08-02）。
 * 同上：数据层的「未绑定」是 `cardId: undefined`，但 Radix SelectItem 禁止
 * `value=""`。落库前映射回 `undefined`，哨兵不进数据。
 */
export const NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID = 'unbound' as const

/**
 * 关键帧分类（原 frame role 退役后的替代信号，§6.1 食物链注释 + frame 兼容迁移）
 * — `isKeyframeNode`（node-workflow-graph.ts）在旧 `role==='frame'` 之外，额外
 * 认这两个分类值为"这张图是关键帧"，不发明新字段名、不改连线矩阵。
 */
export const NODE_STUDIO_KEYFRAME_REFERENCE_ROLES = [
  'frameStart',
  'frameEnd',
] as const

/**
 * 分类 → 模型可读中文标签（buildShotReferenceLegend 图例注入，§6.0"让视频 API
 * 理解素材用途"）。与 `NODE_STUDIO_SHOT_REFERENCE_LEGEND.kindLabel` /
 * `NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel` 同惯例：model-facing 固定中文
 * 文案，不走 i18n（i18n 版標籤在 `characterImage.reference.roles.*`，给 UI 选
 * 择器用，两套字符串服务不同读者）。`custom` 没有固定文案——调用方改用
 * asset.customLabel / node.data.imageCategoryLabel 本身。
 */
export const NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS: Record<
  Exclude<
    (typeof NODE_STUDIO_REFERENCE_ROLES)[number],
    typeof NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
  >,
  string
> = {
  identity: '角色参考',
  pose: '姿势',
  style: '风格',
  composition: '构图',
  background: '背景场景',
  faceCloseup: '面部特写',
  costume: '服装造型',
  prop: '道具',
  frameStart: '首帧',
  frameEnd: '尾帧',
}

export const NODE_STUDIO_REFERENCE_SOURCE_IDS = {
  upload: 'upload',
  asset: 'asset',
  paste: 'paste',
  /** S5c 三.5: the reference was fused in from a loose canvas image node
   *  (§三.3 散图→角色卡). `sourceId` on this entry carries that node's id
   *  (reusing the existing "id within the source's own namespace" contract —
   *  no separate sourceNodeId field needed) so 拆出 can un-hide it exactly. */
  canvas: 'canvas',
} as const

export const NODE_STUDIO_REFERENCE_SOURCES = [
  NODE_STUDIO_REFERENCE_SOURCE_IDS.upload,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.paste,
  NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas,
] as const

export const NODE_STUDIO_IMAGE_INPUT = {
  accept: 'image/*',
  mimePrefix: 'image/',
  pastedFileName: 'pasted-image.png',
} as const

/** 参考视频上传口。台账 #28（2026-08-02）之前这串 accept 在
 *  `VideoReferenceNode` / `VideoReferenceInspector` 各写了一份字面量，加
 *  近场工具条的能力钮就要写第三份 —— 按 Hard Rule 1 收敛到这里。 */
export const NODE_STUDIO_VIDEO_INPUT = {
  accept: 'video/mp4,video/quicktime,video/webm',
  mimePrefix: 'video/',
} as const

export const NODE_STUDIO_AUDIO_INPUT = {
  accept: 'audio/*,.mp3,.wav,.webm,.ogg,.mp4,.m4a,.flac',
  mimePrefix: 'audio/',
  fileExtensions: ['.mp3', '.wav', '.webm', '.ogg', '.mp4', '.m4a', '.flac'],
  /** MIME assumed for a generated audio clip picked from the asset library. */
  assetMimeType: 'audio/mpeg',
} as const

export const NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS = {
  manual: 'manual',
  fishAudio: 'fishAudio',
  referenceAudio: 'referenceAudio',
} as const

export const NODE_STUDIO_VOICE_PROFILE_SOURCES = [
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
] as const

/**
 * 那段参考语音是怎么来的。域定义见 `docs/references/pages/canvas-voice-card.md` §0.5。
 *
 * ⚠ 与上面的 `NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS` 不是一回事，别混：那个混了
 * 「身份从哪来」与「音频从哪来」两件事（`fishAudio` 说的是身份、`referenceAudio`
 * 说的是音频），正是 2026-08-10 那轮错位的来源之一。这个 enum 只回答一件事 ——
 * **手上这段音频是怎么得到的**。
 *
 * `library` 是常态：公开库抽查 300 个音色只有 ~2% 没有自带试听，所以 `synthesized`
 * 是那 2% 的兜底，不是主路径。
 */
export const NODE_STUDIO_VOICE_CLIP_SOURCE_IDS = {
  library: 'library',
  synthesized: 'synthesized',
  uploaded: 'uploaded',
} as const

export const NODE_STUDIO_VOICE_CLIP_SOURCES = [
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library,
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.synthesized,
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded,
] as const

export type NodeStudioVoiceClipSource =
  (typeof NODE_STUDIO_VOICE_CLIP_SOURCES)[number]

export const NODE_STUDIO_VOICE_PROFILE = {
  providerDefault: 'Fish Audio',
  idPreviewLength: 48,
  maxAudioNameLength: 160,
  /**
   * Sample text used by the Voice Inspector's "Generate reference audio"
   * button. Length aims at ~12-15s when spoken at natural pace — within fal
   * Seedance reference-to-video's 15s audio cap.
   */
  referenceSampleText:
    '你好，这是一段用于声音克隆的参考音频。我们正在测试音色的克隆效果，请保持自然的语调和清晰的发音。',
  referenceSampleName: 'voice-clone-sample.mp3',
} as const

/**
 * Voice-node emotion presets for the detail panel's 情绪 chip row (b3 draft).
 * The selected id is stored as a code on `voiceEmotion`; `none` clears it.
 * Metadata only for now — the voice TTS path speaks the dialogue line and does
 * not yet consume emotion as a structured parameter.
 */
export const NODE_STUDIO_VOICE_EMOTION_IDS = {
  none: 'none',
  calm: 'calm',
  angry: 'angry',
  sad: 'sad',
  surprised: 'surprised',
} as const

export const NODE_STUDIO_VOICE_EMOTIONS = [
  NODE_STUDIO_VOICE_EMOTION_IDS.none,
  NODE_STUDIO_VOICE_EMOTION_IDS.calm,
  NODE_STUDIO_VOICE_EMOTION_IDS.angry,
  NODE_STUDIO_VOICE_EMOTION_IDS.sad,
  NODE_STUDIO_VOICE_EMOTION_IDS.surprised,
] as const

export type NodeStudioVoiceEmotion = (typeof NODE_STUDIO_VOICE_EMOTIONS)[number]

export const NODE_STUDIO_VIDEO_PROMPT = {
  maxItemLength: 220,
  maxPromptLength: 4000,
  maxVisualReferences: 4,
  sections: {
    visualReferences: 'Visual references',
    keyframes: 'Keyframes',
    shotText: 'Shot text',
    voiceProfiles: 'Voice profiles',
  },
} as const

export const NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS = {
  generated: 'generated',
  existing: 'existing',
} as const

/**
 * Per-clip duration cap enforced client-side before uploading a reference
 * video. fal Seedance reference-to-video accepts up to 3 clips with a
 * combined duration of ≤15s; we cap a single clip at 15s so one upload can
 * fill the full budget. Combined-duration validation happens server-side
 * once we know all connected video URLs.
 */
export const REFERENCE_VIDEO_MAX_DURATION_SECONDS = 15

/**
 * Default poster aspect ratio for the R3-5 参考视频「视频模板卡」省略态
 * (canvas-relationship-v3 §3.0/§7 R3-5) before a real clip has loaded its own
 * dimensions — portrait, matching the owner's 即梦-style reference screenshot.
 * Once a clip is playing, `onLoadedMetadata` measures its real aspect ratio
 * and this fallback stops applying.
 */
export const NODE_STUDIO_VIDEO_REFERENCE_TEMPLATE_ASPECT_RATIO = 9 / 16

export const NODE_STUDIO_IMAGE_OUTPUT_SOURCES = [
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
] as const

export const NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS = {
  choice: 'choice',
  ai: 'ai',
  existing: 'existing',
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_MODES = [
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
] as const

export const NODE_STUDIO_CHARACTER_IMAGE_REFERENCES = {
  maxItems: 3,
  defaultRole: 'identity',
  defaultWeight: 0.72,
  minWeight: 0,
  maxWeight: 1,
  weightStep: 0.05,
  uploadNote: 'Node Studio character reference',
} as const

/**
 * 一个节点的 `referenceAssets` 还能放几条 —— **这个数的唯一出处**。
 *
 * ⚠ 它此前被手抄了三份（`CharacterDetailBody` / `CanvasImageSelectionToolbar` /
 * `StudioNodeWorkbench` 的名册落卡），三处写的都是同一条链：
 * 「选了模型就问模型的上限，没选就回落到收集器卡的默认 3」。抄第四份的场合恰好
 * 出现了（助手的 `attach_asset` 也要问同一个数），所以就地收成一处 ——
 * 「多入口的闸只写一处」，这条在本仓翻过车。
 *
 * 收集器卡实际上从来没有自己的生成模型（它不产图，`generate` 也拒它），所以对卡
 * 而言这个函数恒等于默认 3；分支留着是因为**镜头图 / 散图**确实带模型，而它们同
 * 样有 `referenceAssets`。
 */
export function resolveReferenceAssetLimit(
  model: { adapterType: AI_ADAPTER_TYPES; modelId: string } | undefined,
): number {
  return model
    ? getMaxReferenceImages(model.adapterType, model.modelId)
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
}

/**
 * 显示名字段的长度上限 —— **`types/node-workflow.ts` 里那批 `.max(160)` 的唯一
 * 出处**（`characterName` / `backgroundName` / `shotName` / `mediaLabel` /
 * `sourceLabel` / `referenceAssets[].name`）。
 *
 * ⚠ 这个数此前被手抄成两份 `maxSourceLabelLength: 160`，而**只有两个写入口在用
 * 它** —— 另外七个把 `generation.prompt` 原样写进同一批字段（台账 V，2026-08-29：
 * 服务端 Zod 拒收整个 project state，画布从那一刻起不再落库，UI 却报成「网络连不
 * 上」）。收成一处 + 一个共享的截断函数（`lib/node-display-name.ts` 的
 * `toNodeDisplayLabel`）之后，写入口不再各自决定截不截。
 *
 * ⚠ 改这个数要连着改 schema 那批 `.max(...)` —— 它们必须是同一个数，写侧截到
 * 161 而 schema 收 160 就等于什么都没修。
 */
export const NODE_STUDIO_DISPLAY_NAME = {
  maxLength: 160,
} as const

export const NODE_STUDIO_CHARACTER_IMAGE_OUTPUT = {
  uploadNote: 'Node Studio character output',
} as const

export const NODE_STUDIO_MEDIA_IMAGE_OUTPUT = {
  uploadNote: 'Node Studio image node output',
} as const

/**
 * Prompt legend prepended to a shot generation when upstream character /
 * background nodes are wired in. It maps each named reference image to its
 * subject so the image model binds the name used in the prompt ("让 yangyang…")
 * to the right reference picture. Model-facing text — kept in the project's
 * primary language (zh); names are user content injected at build time.
 */
export const NODE_STUDIO_SHOT_REFERENCE_LEGEND = {
  title: '参考图说明：',
  kindLabel: {
    character: '角色',
    background: '背景',
  },
} as const

/**
 * Prompt legend prepended to a VIDEO (Seedance) generation, mapping every SENT
 * reference slot — image_urls (角色 / 场景 / 镜头 / 特写), video_urls (视频), and
 * audio_urls (角色音色 / 旁白) — to its subject, so the model binds the `@名字`
 * tokens the composer inserted to the right slot (cast-redesign §7.2⑦ + §9 D,
 * incl. the closeup `@特写N` mapping). Structural + kind words are Chinese
 * (model-facing, like the shot legend); the per-slot NAME is either the user's
 * name or the SAME auto-name the composer's token uses (passed in from i18n so
 * `@特写1` in the prompt matches `特写1` in the legend byte-for-byte).
 *
 * V-1 (docs/references/pages/canvas-video-card.md): `imagePrefix` is
 * literal `@Image` — Seedance only resolves the positional `@Image1`/`@Image2`
 * token, not a Chinese label, and `node-video-prompt-translation.ts` now
 * rewrites the SAME `@ImageN` into the prompt body inline. This legend line
 * ("@Image1：角色「弗洛洛」") reinforces that binding with the kind, which the
 * inline body rewrite alone doesn't carry. `videoPrefix`/`audioPrefix` stay
 * Chinese — video_urls/audio_urls already resolve their own `@VideoN`/`@AudioN`
 * positional tokens via the fal builder's auto-inject fallback, untouched here.
 */
export const NODE_STUDIO_VIDEO_REFERENCE_LEGEND = {
  title: '参考素材说明（按名字对应到下列素材）：',
  imagePrefix: '@Image',
  videoPrefix: '视',
  audioPrefix: '音',
  kindLabel: {
    character: '角色',
    background: '场景',
    shot: '镜头',
    closeup: '特写',
    video: '视频',
  },
  characterVoiceSuffix: '的音色',
  narration: '旁白',
} as const

/**
 * SF-2b（canvas-shot-frame-fold-2026-07 §-1，owner 2026-07-19 拍板的核心目的）:
 * model-facing category label for a directly-referenced shot/frame IMAGE-ROLE
 * node (`NODE_IMAGE_ROLE_IDS.shot`/`.frame` — the node's own connection/
 * harvest role, NOT `NODE_STUDIO_REFERENCE_ROLES`, a referenceAsset's own
 * classification enum). Feeds `harvestUpstreamVideoImageReferences`'s
 * `category` field so a directly-referenced shot/frame node's
 * `buildVideoReferenceLegend` line goes through the SAME "名字（分类）" pipeline
 * `resolveReferenceAssetCategory` already gives imageCategory-tagged
 * referenceAssets / R3-6 出场组 extras, instead of the older kind「名字」bracket
 * wording — owner: "写 prompt 的时候直接引用这个 token 后，Seedance 那边可以
 * 直接知道这个图片的名字以及分类".
 *
 * `frame` is the net-new case: a keyframe/首帧 node was previously OMITTED
 * from this legend entirely (see `isKeyframeNode`'s / `harvestUpstreamVideoImageReferences`'s
 * old docstring — "no name/token"). It still carries no `@token` mention (that
 * stays projection-only per cast-redesign §3/§4 — an unrelated system, the
 * composer's `referenceTokens`), but it now gets a category-only legend line.
 * A role-less loose image classified via `data.imageCategory` (S5d ③
 * 关键帧首/尾) resolves its OWN more specific label instead — this constant is
 * only the fallback for the plain role=frame / legacy frameImage case.
 */
export const NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY: Record<
  Extract<NodeImageRole, 'shot' | 'frame'>,
  string
> = {
  shot: '镜头',
  frame: '首帧',
}

/**
 * 无分类关键帧**从第二张起**的图例分类（2026-08-09 修「图例说谎」）。
 *
 * 上面那个 `.frame = '首帧'` 是 role=frame 这条老轨的兜底文案。两张都没标分类时
 * （菜单建的关键帧就是这个形状），两条图例会**双双自称「首帧」**，且 `name` 也
 * 跟着叫「首帧2」—— 名字与分类两处都说首帧，模型完全分不出首尾。
 *
 * 第二张起改用这个中性文案：**只说它是关键帧，不谎报是首帧，也不猜它是尾帧**。
 * 不猜尾帧是有理由的 —— 本函数拿不到 modelId，而首/尾只在火山关键帧端点上成立
 * （那边由 `role: first_frame / last_frame` 结构承载，图例本来就不负责传首尾）；
 * 多模态参考端点压根没有首尾概念，标成「尾帧」就是换个方向说谎。
 *
 * 真要首尾语义，载体只有一个：`imageCategory`（frameStart / frameEnd）。
 */
export const NODE_STUDIO_KEYFRAME_LEGEND_UNCLASSIFIED_CATEGORY = '关键帧'

// ⚠ 这里**没有** maxItems，也不该再加回来（owner 2026-08-07）。
// 原先的 `maxItems: 5` 是零注释裸数字，唯一读者是 `CharacterImageLoraControls`
// 的加号闸；而那个组件自 `04f8f6be`（2026-08-05 详情面板七槽改造）起就没有任何
// 地方渲染，owner 拍板「角色图不要 LoRA 能力」后连组件一并删除了。
//
// 于是本常量现在**只剩 scale 取值域还在用**（`NodeWorkflowLoraSelectionSchema`
// 的 min/max/default）。那四个数是 provider 的真实取值域，不是拍的数，留着。
// 若日后把 LoRA 编辑入口接回七槽面板：**别顺手补一个 maxItems** —— 三个后端
// （fal「any number of LoRAs」· Replicate 不限长度列表 · 自家 ComfyUI）都不限
// 数量，没有真上限可对齐。同批退役的还有 H（eb295d23 / 6c3add69）与 J4
// （f9522e44）的四处写死上限。
export const NODE_STUDIO_CHARACTER_IMAGE_LORAS = {
  defaultScale: 1,
  minScale: 0.1,
  maxScale: 2,
  scaleStep: 0.05,
  customBaseFamily: 'custom',
} as const

export const NODE_STUDIO_NODE_PLACEMENT = {
  // ⚠《画布修法》02 节刀 1 task A（2026-08-26）之后，`topbarAddPosition` 只剩
  // 两个**旧**兜底调用方在用（图片编辑 handoff 建节点 / handleSpawnReference
  // 找不到宿主节点时的锚点，均在 StudioNodeWorkbench.tsx）——这两条不在本刀
  // 范围内，故意留着没改。顶栏 ＋ 添加菜单本身的落点已经改用
  // `resolveTopbarAddSpawnPosition`（本文件下方），不再读这个常量：写死的画布
  // 坐标角在用户平移过画布后会落到看不见的地方，且连点添加菜单 N 次会让 N 张
  // 卡精确重叠（同一个坐标）。
  topbarAddPosition: {
    x: 96,
    y: 96,
  },
  menuOffset: {
    x: 16,
    y: 16,
  },
  /**
   * 顶栏 ＋ 添加菜单——连续新建节点之间的错位步进（`resolveTopbarAddSpawnPosition`
   * 消费）。量级参考：比 `menuOffset`（16，屏幕像素，管菜单自己贴哪）大一档才
   * 看得出"这是第二张/第三张"；比 `referenceSpawn`（-420/200，管的是"新节点相对
   * 宿主"完全不重叠）小一档——这里的目标不是数学上零像素重叠（同一菜单能建出
   * 400 宽的纯图片卡到 320 宽的镜头/视频卡不等，零重叠在 200% 默认缩放下会把
   * 卡顶出视口），而是让人一眼看出这是三张不同的卡，不是叠在一起的一张。
   */
  topbarAddStep: {
    x: 64,
    y: 64,
  },
  /** 错位步进按取模回卷的上限：连点超过这个次数后从头开始叠错位，避免几十次
   *  连点后越飘越远、飘出可见范围（"落点在视口内"是这条路径的另一条硬指标）。 */
  topbarAddCascadeLimit: 6,
  // projectScriptDocToGraph anchors a recognisable left→right pipeline:
  // characters | shotText | shotStill | voice | seedance | videoMerge.
  // ScriptDoc has no on-canvas node to anchor on, so positions are absolute
  // from `origin`; re-projection reuses existing node positions and never
  // moves them — so widening this ladder only affects NEWLY spawned nodes,
  // every already-projected project keeps the layout it has.
  scriptDocSpawn: {
    origin: { x: 80, y: 120 },
    characterOffsetX: 0,
    shotTextOffsetX: 480,
    // 分镜静帧（包 3）sits between the shot's text and its video so the main
    // chain 文本 → 静帧 → 视频 reads left→right without a detour.
    shotStillOffsetX: 940,
    voiceOffsetX: 1400,
    seedanceOffsetX: 1860,
    videoMergeOffsetX: 2320,
    shotRowOffsetY: 360,
    characterRowOffsetY: 260,
    voiceRowOffsetY: 150,
  },
  // §7.1 部门条 ＋添加位 autospawn: place the new reference node to the LEFT of
  // its target video node, stacked downward by how many upstream nodes the
  // target already has, so successive adds don't overlap.
  referenceSpawn: {
    offsetX: -420,
    rowOffsetY: 200,
  },
  // R3-7 一键成盒 (canvas-relationship-v3 §3.0b/§7): the auto-created
  // videoMerge node lands to the RIGHT of the multi-selection's bounding box
  // — same "results land to the source's right" convention as
  // `derivedImage.offsetX` below (same value, not a coincidence: both clear
  // one `--width-node-card` (25rem/400px) plus a comfortable gap).
  videoMergeCompose: {
    offsetX: 460,
  },
  // 包 5 助手建节点：与 ＋添加位 不同，助手的一批新节点**没有可锚定的宿主**，
  // 落在固定点会直接压在现有图上。所以整批排在现有节点包围盒的右侧，再按网格
  // 铺开；画布为空时退回通用落点。应用后由调用方聚焦到新节点，不指望用户自己找。
  assistantSpawn: {
    anchorGapX: 460,
    columnOffsetX: 440,
    rowOffsetY: 440,
    columns: 3,
  },
  // 右键菜单「从素材库选择」一次可落一批（owner 2026-08-11）。⚠ **必须成批
  // 落位**：按序号算格子，而不是每次去读「已有上游数」——`workflow.nodes` 是
  // 本次渲染的快照，同一批里连着建 N 个时它一直是旧值，N 个节点会算出**完全
  // 相同的坐标、精确重叠**（用户看到的是「我明明选了 3 张，怎么只多了 1 个」）。
  // 与助手批量/图像派生同一套网格尺度；上限 = 一整屏 3×3。
  libraryPick: {
    columnOffsetX: 440,
    rowOffsetY: 440,
    columns: 3,
    maxSelection: 9,
  },
  // Image edits never replace their source. A single result lands to the
  // source's right; multi-output edits fan out into a
  // compact grid so the entire batch remains one spatial/undo operation.
  derivedImage: {
    offsetX: 460,
    columnOffsetX: 440,
    rowOffsetY: 440,
    columns: 3,
  },
} as const

/**
 * 顶栏 ＋ 添加菜单的新建落点（《画布修法》02 节刀 1 task A）：当前视口中心 +
 * 按连续新建次数取模的错位步进。抽成纯函数是为了不依赖 ReactFlow 实例就能单
 * 测——真正的「屏幕坐标 → 画布坐标」换算（`screenToFlowPosition`）留给调用方
 * （`StudioNodeWorkbench.handleTopbarAddClick`），这里只管「视口中心算出来之
 * 后，第 N 次新建该落在哪」这一步纯算术。
 *
 * `sequence` 是调用方自己维护的「这是第几次从这条路径新建」计数（0 起，每次
 * 成功打开菜单自增），不是 `workflow.nodes.length`——画布已有几十个节点时，
 * 用总数当步数会让第一次新建就飞出老远；这条路径只关心「连续点了几次」。
 */
export function resolveTopbarAddSpawnPosition(
  viewportCenter: { x: number; y: number },
  sequence: number,
  /**
   * 画布上**已经有的**节点位置（左上角坐标）。传了就做碰撞避让：从 `sequence`
   * 那一格开始往下找第一个没被占的落点。
   *
   * ⚠ 台账 S（owner 2026-08-29 真机）：错位步进按的是**这一会话点了几次**，
   * 与「那个位置上有没有东西」无关 —— 于是第 0 次（`cascadeIndex = 0`）永远
   * 精确落在视口正中，而刚生成完的那张卡恰好就被居中过（生成后自动选中 +
   * 聚焦）。owner 两次「+ → 镜头图」都正好盖住刚出的图，每次都得手动拖开。
   *
   * 省略时行为与改动前逐字相同 —— 没有位置清单的调用方不受影响。
   */
  occupied?: readonly { x: number; y: number }[],
): { x: number; y: number } {
  const { topbarAddStep, topbarAddCascadeLimit } = NODE_STUDIO_NODE_PLACEMENT
  const at = (index: number) => ({
    x: viewportCenter.x + index * topbarAddStep.x,
    y: viewportCenter.y + index * topbarAddStep.y,
  })

  const fallback = at(sequence % topbarAddCascadeLimit)
  if (!occupied || occupied.length === 0) return fallback

  /**
   * 「占住了」的判据是**两轴都落在一个步进之内**。用步进本身当阈值而不是去量
   * 卡的真实尺寸：卡宽从 320 到 420 不等且随内容变，工作台这条路径手里没有可靠
   * 的尺寸；而错位步进（64）本来就是「让人一眼看出这是两张卡」的那个数，
   * 挪一格之后卡角必然错开，这正是要的结果。
   */
  const isFree = (candidate: { x: number; y: number }) =>
    !occupied.some(
      (node) =>
        Math.abs(node.x - candidate.x) < topbarAddStep.x &&
        Math.abs(node.y - candidate.y) < topbarAddStep.y,
    )

  for (let offset = 0; offset < topbarAddCascadeLimit; offset += 1) {
    const candidate = at((sequence + offset) % topbarAddCascadeLimit)
    if (isFree(candidate)) return candidate
  }
  // 整条错位链都被占满 —— 与其飘到视野外，不如退回原来的落点（「落点在视口内」
  // 是这条路径的另一条硬指标，见 `topbarAddCascadeLimit` 的注释）。
  return fallback
}

/**
 * 节点右侧侧车（`NodeToolbar` `Position.Right` `align="start"`）的贴靠距离
 * ——《画布修法》02 节刀 1「一把总钥匙」：画布上凡是挂在宿主卡右侧的浮层都
 * 用这一份数字，不许各写各的。
 *
 * 取值即 `SeedanceNode`（视频侧车）此前手写的 24 / 20——owner 多轮真机验证
 * 过它不会盖住宿主卡自己的出端口/出边起点，是新落点（图片/音频生成框）唯一
 * 要对齐的达标线，不是重新拍的数。
 */
export const NODE_STUDIO_NODE_SIDECAR_OFFSET = {
  desktop: 24,
  mobile: 20,
} as const

/**
 * 生成提示词框（docs/references/pages/canvas-generate-composer.md）——画布级
 * 共享组件，不属于任何单一节点族。这里只收「没别处可放」的具名数值，避免裸
 * 字面量散在组件里（Hard Rule 1）。
 */
export const NODE_STUDIO_GENERATE_COMPOSER = {
  // §5 清晰度三档 —— 与 AdvancedParams.resolution（types/index.ts）同一枚举，
  // 这里给 node.data.imageResolution 一个具名常量，不裸写字面量。
  imageResolutionTiers: ['auto', '1K', '2K', '4K'] as const,
  // §5「张数」—— 本轮没有批量生成 API，客户端顺序触发 N 次 §7 结果落点流程。
  batchCounts: [1, 2, 4] as const,
  defaultBatchCount: 1,
  // §4 参考图槽：宿主图占第一格后，额外槽位在「未选模型」时的兜底上限——
  // 复用既有角色卡参考图上限常量；选了模型后改用
  // getMaxReferenceImages(adapterType, modelId) 的真实值，不第二次兜底。
  extraReferenceFallbackCap: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems,
  // §6 扩大态「提示词历史 / 最近用过」—— 本地 ring buffer 的容量。
  historyMaxEntries: 8,
} as const

/**
 * §5.5「用模板」浮层的轻筛选 tab —— 对应 Recipe.lastUsedAt / usageCount 两个
 * 既有字段（不新造字段）。id/数组拆两个导出，跟随本文件 NODE_STUDIO_TOOL_MODE_IDS
 * / NODE_STUDIO_TOOL_MODES 同一惯例（ids 供 switch/查 label，数组供渲染顺序
 * ——顺序即文档 §5.5 原文列出的「最近用 / 全部 / 用得最多」）。
 */
export const NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS = {
  recent: 'recent',
  all: 'all',
  mostUsed: 'mostUsed',
} as const

export const NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTERS = [
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS.recent,
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS.all,
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS.mostUsed,
] as const

export type GenerateComposerTemplateFilter =
  (typeof NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTERS)[number]

/** §5.5「全部」是无筛选默认档 —— 同 PromptTemplateList 的 typeFilter 默认
 *  'ALL' 同一惯例（避免打开就落在一个可能长期为空的 tab，见 lastUsedAt 的
 *  实读注记，types/index.ts RecipeRecord 定义处）。 */
export const NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_DEFAULT_FILTER: GenerateComposerTemplateFilter =
  NODE_STUDIO_GENERATE_COMPOSER_TEMPLATE_FILTER_IDS.all

export const NODE_STUDIO_ID_PREFIXES = {
  node: 'node',
  edge: 'edge',
  project: 'project',
  message: 'message',
} as const

// §2.3 去黄：连线中性灰（--node-edge），preview/选中靠明度提亮（--node-edge-active）；
// glow 去霓虹（anti-slop），改 foreground 基的极淡中性光晕。
//
// R3-1 两级墨线（canvas-relationship-v3 §2.3）：骨干默认降为常显后的克制宽度
// （2，非"仅预览时代"的 3）；显现（成分边因选中而现身）用石绿 80% 混墨线的细线；
// 边自身被选中用纯石绿、hover 用中性提亮——running 复用 previewColor 的脉冲。
// `glowFilter` / `markerEndType` 等仍留给 edge-creation 调用点（use-node-workflow
// 的 onConnect、node-workflow-script-doc 的 createWorkflowEdge）写进持久化的
// edge.style/markerEnd——那两处未改，只是渲染层的 NodeWorkflowStatusEdge 不再
// 读它们（无 glow、端标改墨点不用箭头），保持数据层不动。
export const NODE_STUDIO_EDGE_VISUALS = {
  type: 'smoothstep',
  color: 'var(--node-edge)',
  previewColor: 'var(--node-edge-active)',
  // 显现（成分边被选中节点带出）：石绿 80% 混中性墨线——node-canvas.md §5 落点③
  // 「选中态」覆盖，不新增颜料落点。
  revealedColor: 'color-mix(in oklab, var(--node-paint) 80%, var(--node-edge))',
  // 边自身被选中（点选一条边，Del 可解绑）：纯石绿。
  selectedColor: 'var(--node-paint)',
  glowFilter:
    'drop-shadow(0 0 4px color-mix(in oklab, var(--node-edge-active) 28%, transparent))',
  // S3（2026-07-26）连线语言：三个维度编码三件事（规格 §7.1）——
  // 粗细 = 建立与否，虚实 = 就绪与否，流光 = 当前焦点。颜色只有两档，
  // 且选中/生成中靠**明度**变化不换色相（域内 --node-edge* 已被 .domain-canvas
  // 重映射成 v0.2 的中性值，石绿不再进入连线）。
  // ⚠ 阶段 6-A（2026-08-10 真机验出来的）：**连线的粗细与热区在这里，不在
  // canvas.css**。当时我改的是 `--canvas-edge-w` / `--canvas-edge-hit-w`，
  // 真机实测渲染出来仍是旧值 —— 因为那两个 token **零消费者**（边的 style 由
  // `StudioNodeWorkbench` 从本表内联写死）。两个 token 已随本次删除。
  // 度量表 §4 规则 9：可见 2px + 20px 透明热区，视觉更轻、可点性反而更高。
  strokeWidth: 2,
  hoverStrokeWidth: 2,
  selectedStrokeWidth: 2,
  revealedStrokeWidth: 2,
  /** 未就绪 / 占位关系：细虚线 + 降透明，是弱信息，允许弱。 */
  pendingStrokeWidth: 1.5,
  pendingDashArray: '6 5',
  pendingOpacity: 0.6,
  /** 已建立边用圆头端点（实测参考站同款，收口更干净）。 */
  lineCap: 'round',
  previewStrokeWidth: 2.5,
  // S3：命中区曾收到 16px（连线粗到 3px 时不需要更宽，反而抢节点的点击）。
  // 阶段 6-A 把线改回 2px，热区随之回到 20 —— 这两个数是一对，只改粗细会让
  // 线更难点中。20 是度量表实测值（55 path / 29 edge ≈ 2:1）。
  interactionWidth: 20,
  // 端标墨点半径（替代箭头 markerEnd）。
  endDotRadius: 3.5,
  markerSize: 20,
  markerStrokeWidth: 1.8,
  previewDash: '9 7',
  markerEndType: 'arrowclosed',
} as const
