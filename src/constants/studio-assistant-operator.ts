/**
 * 工作台助手「操作员化」的**面板侧词表**（P2）。
 *
 * 与 `constants/assistant-operator.ts` 的分工：那份是**协议**（工具名、事件名、
 * 载荷上限），客户端与服务端共用；这份是**面板**（尺寸、记忆键、动效时长、
 * 药丸口径），只有 UI 读它。混在一起的下场是服务端 bundle 里躺着一堆像素值。
 *
 * ⚠ 这里一个 zod 都没有，理由同 `constants/assistant-operator.ts` 的头注：
 * `src/constants/` 全仓零 import zod，schema 一律住 `src/types/`。
 */

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { USER_UPLOAD_ACCEPTED_MIME_TYPES } from '@/constants/uploads'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { NodeAssistantParamId } from '@/constants/node-assistant-ops'
import type { NodeWorkflowFieldId } from '@/constants/node-types'

/**
 * 覆盖层的宽度（拍板 9：默认 560，左缘拖拽 420–860，宽度记忆）。
 *
 * ⚠ **不复用 `STUDIO_ASSISTANT_DOCK_RESIZE`**：那份是旧 dock 的
 * （320/360/720），三个数一个都对不上，而且**记忆键必须分开** —— 共用一个键，
 * 用户在旧面板拖到 340 之后新面板会开在 420（被 min 夹上来），看起来像「我明明
 * 拖过它自己弹回去了」。两个面板并存期间（P4 之前视频/音频仍走旧 dock）这条是
 * 硬要求，不是洁癖。
 */
export const STUDIO_OPERATOR_PANEL_RESIZE = {
  defaultWidthPx: 560,
  minWidthPx: 420,
  maxWidthPx: 860,
  /** 键盘 ←/→ 一次挪多少 —— 拖拽之外还得有个键盘可达的路径。 */
  widthStepPx: 20,
  storageKey: 'pixelvault.studio.operatorPanel.width.v1',
} as const

/**
 * 「清掉助手的全部改动」二击确认的复原窗口（拍板 14）。
 *
 * 3 秒不点就自己变回去 —— 与切片 v4 逐字一致。⛔ 别做「反清掉」：撤销的撤销是
 * 第三种状态，而清掉本身已经是逐字段可还原的那些改动的合并操作。
 */
export const STUDIO_OPERATOR_CLEAR_CONFIRM_MS = 3000

/** 📎 附件面板里素材库就地预览摆几格（拍板 16：一屏 6 格，不做「按钮→弹窗」两跳）。 */
export const STUDIO_OPERATOR_ATTACH_TILE_COUNT = 6

/**
 * 归属票的保质期（P3-C，拍板 4）—— 领了票多久还没等到新的一批就作废。
 *
 * ⚠ 它是**兜底不是主判据**：主判据是按钮那边的三个前提（primed 态、没在跑、
 * 没被 `blockedReason` 挡）。留这道底是因为本仓的生成键是 Krea 式的「点了才
 * 告诉你缺什么」，还有 `singleImageInFlightRef` 这类内部提前返回 —— 那些路径
 * 会让一张票永远绑不上，而一张永不过期的票下一步就会认领**用户自己发的**那一枪
 * （正好是拍板 4 明令不许打扰的那种）。
 * ⚠ 30 秒是「提交那几百毫秒」的一百倍余量。往大了调等于放大误标的窗口。
 */
export const STUDIO_OPERATOR_CLAIM_TTL_MS = 30_000

/**
 * 上传三通道（拍板 16）的 `<input type="file">` accept 串。
 *
 * ⚠ **从 `constants/uploads.ts` 现算，不手抄一份**：手抄的那份会在后端加一种
 * 容器（比如 `audio/flac`）之后原地过期 —— 表现是「素材库能传的文件，助手这里
 * 选都选不中」，而选不中的文件不会报错，它只是灰着。
 * ⚠ accept 只是**选择器的筛子**，不是闸：用户仍可拖进来任意文件，真正的类型
 * 判定在上传通道里按 MIME 走（台账 BH：⛔ 别按扩展名判型）。
 */
export const STUDIO_OPERATOR_UPLOAD_ACCEPT =
  USER_UPLOAD_ACCEPTED_MIME_TYPES.join(',')

/**
 * 面板与「不该收起面板」的区域打的标记（拍板 7 · 注意力收放法则）。
 *
 * ⚠ 用 data 属性而不是 ref 名单：提示词框与面板分属两棵组件树，宿主拿不到彼此
 * 的 ref；而 `closest('[data-…]')` 对**将来新增的共同编辑区**自动生效 ——
 * 加一个新的「点它不该收」的地方，只要打这个标记，收放规则一行都不用改。
 * 切片 v4 里的 `data-keep` 就是它。
 */
export const STUDIO_OPERATOR_KEEP_OPEN_ATTR = 'data-operator-keep'

/**
 * 联网候选格子的**渲染像素**（P3-B，拍板 18「联网候选可换选」）。
 *
 * ⚠ 它不是 CSS 尺寸（那在类名里，`size-14` = 56px，切片 v4 的候选行就是这个数），
 * 是给 `<img width/height>` 的**位图尺寸** —— 2× 是为了高 DPI 屏上不糊。
 * ⛔ 别把它当布局值去用：改这个数只会换掉解码分辨率，格子还是 56px。
 */
export const STUDIO_OPERATOR_WEB_CANDIDATE_PIXELS = 112

/**
 * 参考图挂载弹入的 stagger 间隔（秒，拍板 17）。
 *
 * ⚠ 单位是**秒**不是毫秒：motion 的 `delay` 收秒。写 140 进去会得到一个两分钟
 * 后才出现的参考图 —— 而它在测试里看起来只是「没渲染」。
 */
export const STUDIO_OPERATOR_REFERENCE_STAGGER_SECONDS = 0.07

/**
 * 建议药丸（拍板 15：语境化、点即发送，替代旧的灰 chips）。
 *
 * ⚠ 值是 **i18n 键的后缀**不是文案：三语各自写自己的话，中文那句直译成日文
 * 会很怪。写成 `Record<域, …>` 而不是一张扁平表 —— 域加一个而药丸没跟上，
 * 编译期就红。
 * ⚠ `minChanges` 是「助手改过几处之后这颗才出现」：一处没改就问「这张为什么
 * 不够手办感」是无源之水（切片 v4 里那颗 `|4` 的门）。
 */
export const STUDIO_OPERATOR_SUGGESTIONS: Record<
  AssistantOperatorDomain,
  readonly { id: string; minChanges: number }[]
> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: [
    { id: 'setupShot', minChanges: 0 },
    { id: 'findReference', minChanges: 0 },
    { id: 'whyNotEnough', minChanges: 1 },
  ],
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: [
    { id: 'animateLast', minChanges: 0 },
    { id: 'addVoice', minChanges: 0 },
    { id: 'splitShots', minChanges: 1 },
  ],
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: [
    { id: 'findStyle', minChanges: 0 },
    { id: 'stackConflict', minChanges: 0 },
    { id: 'sweepWeights', minChanges: 1 },
  ],
  /** 画布（C0）：先读图、再搭结构、改过之后才问「哪一格还没齐」。 */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: [
    { id: 'layoutShots', minChanges: 0 },
    { id: 'wireReferences', minChanges: 0 },
    { id: 'whatIsMissing', minChanges: 1 },
  ],
}

/**
 * 面板能改的表单字段 —— **归属标记（✦）与撤销的粒度就是它**。
 *
 * ⚠ 与工具表不是一一对应：`set_specs` 一条工具同时管比例与清晰度（台账
 * AE/BG/BS 要求两个一起下），所以它们共用 `specs` 这一格 —— 撤销也必须一起撤，
 * 分开撤会撤出一个「4:3 配 2K」这种从没存在过的组合。视频的
 * `set_video_specs`（时长 · 画幅 · 分辨率）**共用同一格**，理由相同。
 *
 * ⚠ 这张表是**跨域并集**（P4-A）：`count` 只在图片档出现，`audioReferences` /
 * `sound` 只在视频档出现。⛔ 不按域拆成两张表 —— 登记簿本来就是按域分槽存的
 * （见 `use-studio-operator-store.ts`），用不上的格在那个域里根本不会被写进去，
 * 而拆表会让 `STUDIO_OPERATOR_FIELDS`（撤销的遍历顺序）变成两份要同步的东西。
 */
export const STUDIO_OPERATOR_FIELD_IDS = {
  prompt: 'prompt',
  negative: 'negative',
  model: 'model',
  specs: 'specs',
  count: 'count',
  references: 'references',
  /** 视频域的音频参考位（台账 A 的那条通道）。 */
  audioReferences: 'audioReferences',
  /** 视频域「出不出声」的三态开关。 */
  sound: 'sound',
  /**
   * LoRA 域的挂载栈（P4-C）—— **挂 / 摘 / 调权重共用这一格**。
   *
   * ⚠ 共用一格的理由与 `specs` 那条同源：它们回答的是同一个问题「这次由哪几把
   * LoRA 说了算」。分成三格的表现是参数栏上并排三颗 ✦，而用户心里只有一件事。
   * ⚠ 逐条撤销仍然是逐条的（日志条上那颗撤销钮走的是 `step.inverse`），这一格
   * 管的是「还原这个字段」那颗按钮的粒度。
   */
  loras: 'loras',
} as const

export type StudioOperatorField =
  (typeof STUDIO_OPERATOR_FIELD_IDS)[keyof typeof STUDIO_OPERATOR_FIELD_IDS]

export const STUDIO_OPERATOR_FIELDS = [
  STUDIO_OPERATOR_FIELD_IDS.prompt,
  STUDIO_OPERATOR_FIELD_IDS.negative,
  STUDIO_OPERATOR_FIELD_IDS.model,
  STUDIO_OPERATOR_FIELD_IDS.specs,
  STUDIO_OPERATOR_FIELD_IDS.count,
  STUDIO_OPERATOR_FIELD_IDS.references,
  STUDIO_OPERATOR_FIELD_IDS.audioReferences,
  STUDIO_OPERATOR_FIELD_IDS.sound,
  STUDIO_OPERATOR_FIELD_IDS.loras,
] as const

/**
 * 系统行的词表（线程里那些「你撤销了 ××」的灰条）。
 *
 * ⚠ 它**原本只是 `types/studio-assistant-operator.ts` 里的一个 TS 联合**。提到
 * 常量层是因为 P4-B 之后它有了第二个消费者：落库的历史条目要用 `z.enum()` 校验
 * 这个值域。写成两份的下场是加一条系统行时只改了一半 —— 界面上出现的那条，
 * 存进去再读回来会整条被判为非法而消失。
 */
export const STUDIO_OPERATOR_SYSTEM_CODES = [
  'undoStep',
  'revertField',
  'revertAll',
  'revertRound',
  'resultArrived',
  'stopped',
  'interrupted',
  'urlImportFailed',
  /**
   * 挂 LoRA 那一跳没成（P4-C）：作者关掉了下载、导入报错、或挂载栈拒了。
   *
   * ⛔ **不静默、也不只弹 toast**：既有的下载闸自己会 toast 一句，但助手做的事
   * 该在助手的线程里留下痕迹 —— 否则用户读日志时会看到「已挂载」而装配台上什么
   * 都没多出来（一条日志说谎比没日志坏）。⚠ 一个码盖三种成因是有意的：对用户
   * 而言下一步都一样（换一把），分成三条只会多两句他读不懂的话。
   */
  'loraMountFailed',
  /**
   * 这一步归**另一个宿主**落（C1-pre）：画布域的改动型工具送到了工作台宿主上，
   * `applyOperatorStep` 返回 `StudioOperatorStepNotApplicable`，表单一个字没动。
   *
   * ⛔ 不静默：日志条上写着「已建节点」而画布 / 表单纹丝不动，是本仓最难查的
   * 那一类。运行时到不了（域工具表 + 服务端硬闸），这一行是那条类型出口在线程
   * 里的落点 —— 真到了，用户看到的是一句话而不是一个谜。
   */
  'stepNotApplicable',
  /**
   * 画布宿主落不下去这一步（C1）：服务端放行了，图上却对不上 —— 节点被人手删了、
   * 别名没登记、目录里没这条渠道、节点还没有主媒体。⛔ 不静默：日志条写着「已做」而
   * 画布纹丝不动，是本仓最难查的那一类。
   */
  'canvasStepRefused',
  /** 这一步归下一片（`update_script_doc` → C3）：画布宿主认得它，但本片不落。 */
  'canvasStepDeferred',
] as const

export type StudioOperatorSystemCode =
  (typeof STUDIO_OPERATOR_SYSTEM_CODES)[number]

/**
 * 会话历史（P4-B）。
 *
 * ⚠ `saveDebounceMs` 是**唯一的写入节流**：线程条目每来一条就重排一次，流跑完
 * 之后这一拍才落地。所以「一轮结束 / 用户发言 / 切域」三个时机不需要各写一条
 * 触发 —— 它们全都以「entries 变了」的形式经过这里。
 * ⚠ 往小了调会把一次流式回合拆成十几次 POST（每一步都是一次写库）。
 */
export const STUDIO_OPERATOR_HISTORY = {
  saveDebounceMs: 1200,
  /** 会话菜单里列几条（两个域各取这么多，合并后再截这么多）。 */
  listLimit: 20,
  /**
   * 载回的历史里，有多少条**对白**会重新进请求上下文。
   *
   * ⚠ 与「显示多少条」是两件事：显示是全部（用户要读得到自己的历史），
   * 而进上下文的每一条都是账单。日志条 / 计划条 / 系统行本来就不进对白
   * （见 `use-assistant-operator.ts` 的 `buildMessages`），这里管的是剩下那些。
   */
  replayMessages: 12,
} as const

/**
 * 胶囊（收起态）说什么 —— 拍板 7 的收放法则要求胶囊**有状态文本**，
 * 不是一颗光秃秃的图标：面板让位之后，它是助手唯一还看得见的那一行。
 */
export const STUDIO_OPERATOR_PILL_TONES = {
  /** 干活中（n/m）。 */
  working: 'working',
  /** 已备好 · $x —— 生成键亮着，等用户点。 */
  primed: 'primed',
  /** 已看完 · 有建议（P3 的评价闭环回来时用）。 */
  alert: 'alert',
  /** 什么都没在跑。 */
  idle: 'idle',
} as const

export type StudioOperatorPillTone =
  (typeof STUDIO_OPERATOR_PILL_TONES)[keyof typeof STUDIO_OPERATOR_PILL_TONES]

/**
 * 画布宿主的**改动粒度**（C1，任务书 §三）：`${nodeId}:${field}`。
 *
 * ⚠ 不塞进 `STUDIO_OPERATOR_FIELD_IDS`：那张是这台表单的格，画布上每一格都是
 * 「某个节点的」。`field` 一半取节点自由文本字段名（`NODE_WORKFLOW_FIELDS`）与
 * 档位名（`NODE_ASSISTANT_PARAMS`），另一半是下面这几条画布专有的格。
 * `nodes` / `edges` 两格是**整批**的登记（`stage_nodes` / `connect_nodes`），
 * 它们的 nodeId 位写批次里第一个真实 id，撤销走「撤销这一批」那道门。
 */
export const CANVAS_OPERATOR_FIELD_IDS = {
  title: 'title',
  imageCategory: 'imageCategory',
  model: 'model',
  references: 'references',
  reviewState: 'reviewState',
  primed: 'primed',
  nodes: 'nodes',
  edges: 'edges',
} as const

export type CanvasOperatorField =
  | (typeof CANVAS_OPERATOR_FIELD_IDS)[keyof typeof CANVAS_OPERATOR_FIELD_IDS]
  | NodeWorkflowFieldId
  | NodeAssistantParamId

export const CANVAS_OPERATOR_CHANGE_KEY_SEPARATOR = ':'

export type CanvasOperatorChangeKey =
  `${string}${typeof CANVAS_OPERATOR_CHANGE_KEY_SEPARATOR}${CanvasOperatorField}`

export function buildCanvasOperatorChangeKey(
  nodeId: string,
  field: CanvasOperatorField,
): CanvasOperatorChangeKey {
  return `${nodeId}${CANVAS_OPERATOR_CHANGE_KEY_SEPARATOR}${field}`
}

/**
 * 「撤销这一批」为什么点不了（拍板 3：只在它仍是最近一步时可点，否则置灰给理由）。
 * 值是 i18n 键的后缀（C2 面板渲染），不是文案。
 */
export const CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS = {
  /** 这一步不是批（`set_*` 走字段级 inverse，不经这道门）。 */
  notBatch: 'notBatch',
  /** 宿主没有这一步的本钱：刷新后载回的历史、或从没在本宿主落过。 */
  unknownStep: 'unknownStep',
  /** 已经撤过了。 */
  alreadyUndone: 'alreadyUndone',
  /** 它之后画布又动过（另一批 / 人手 / 撤销重做），不再是最近一步。 */
  notLatest: 'notLatest',
} as const

export type CanvasOperatorBatchUndoReason =
  (typeof CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS)[keyof typeof CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS]
