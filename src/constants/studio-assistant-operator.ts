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

/**
 * 输入区「+」菜单的三项（v2 §4.4）。
 *
 * ⚠ **「附件」不在这张表里**：上传有自己那颗回形针按钮，塞进菜单等于把最常用的
 * 那一下藏到两跳之后。
 * ⚠ 顺序就是菜单从上到下的顺序（画板 BCards「+」展开态），⛔ 别在组件里再排一次。
 */
export const STUDIO_OPERATOR_PLUS_MENU_IDS = {
  /** 唤出 `@` 选择器 —— 插一个 `@` 并把焦点还给输入框。 */
  mention: 'mention',
  /** 挂一张角色 / 风格 / 品牌卡。 */
  contextCard: 'contextCard',
  /** 本轮限定检索来源（白 / 黑名单接在 v2 §9.3，commit #17）。 */
  source: 'source',
} as const

export const STUDIO_OPERATOR_PLUS_MENU_ITEMS = [
  STUDIO_OPERATOR_PLUS_MENU_IDS.mention,
  STUDIO_OPERATOR_PLUS_MENU_IDS.contextCard,
  STUDIO_OPERATOR_PLUS_MENU_IDS.source,
] as const

export type StudioOperatorPlusMenuId =
  (typeof STUDIO_OPERATOR_PLUS_MENU_ITEMS)[number]

/** 「+」菜单里那份上下文卡列表最多摆几张（再多就滚，⛔ 不做分页）。 */
export const STUDIO_OPERATOR_PLUS_CARD_LIMIT = 12

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
    /**
     * 空态那三颗的第三颗（v2 §4.2 / 画板 BEmpty）。
     *
     * ⚠ `minChanges: 0` 是它存在的**全部理由**：§4.2 要的三颗起手势必须在
     * 「一处都还没改」时同时在场，而 `whyNotEnough` 的门是 1 —— 只留那一颗的话
     * 空态永远只画得出两颗。⛔ 别为此另开一张「空态专用药丸表」：两张表会漂。
     */
    { id: 'checkStyle', minChanges: 0 },
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
  'checkpointRestored',
  'resultArrived',
  'stopped',
  'interrupted',
  /**
   * 排队的那句在**工具步边界**被接住了（§3.1 ㉓，本片）。
   *
   * ⚠ 与 `interrupted` 是**两件事**，⛔ 别合成一条：`interrupted` 说的是
   * 「你插话了，助手立刻转向」（本片之前 `send()` 的旧语义），而这一条说的是
   * 「在飞的那一步跑完了，你排的那句现在才进队」—— 用户等的就是这个交代，
   * 少了它排队条淡出之后什么都没发生过。
   */
  'queuePicked',
  /** 排队条上点了「撤回」（§3.1 ㉔）—— 那句话丢了，得说一声。 */
  'queueDropped',
  /**
   * **问题卡答完了**（v2 §3.4 落账规则 ①）—— 「问题 · 你选了 X」。
   *
   * ⭐ 它是问题卡离开钉住区之后**唯一的痕迹**：卡钉在输入框上方、答完就消失，
   * 而「我刚才选了什么」是下一轮里用户最常回头找的东西。⛔ 别把卡留在时间线里
   * 代替这一行 —— 那样它会随时间线滚走，而钉住区的整个意义就是不滚。
   */
  'questionAnswered',
  'urlImportFailed',
  /**
   * **这一批生成全挂了**（v2 §6，commit #10）——结果卡因此不出。
   *
   * ⭐ 失败进系统行而不是画一张「失败的结果卡」：结果卡说的是「这些已经入库了，
   * 拿它接着干」，而一批没出来的图既没有缩略图也没有两个轻操作可点 —— 那张卡上
   * 的每一格都是空的。⚠ 部分失败**不落这一行**：出来几张就是几张，卡照出。
   */
  'generationFailed',
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
   * 视频域评审的**抽帧那一跳**没成（第二期最后一环）。
   *
   * ⛔ **不静默**：抽不出帧 = 这一轮助手看不了这段片子，而服务端那一侧只会回一句
   * 「没有帧可看」（`videoFramesMissing`）—— 用户读到的是助手在推辞，却不知道
   * 真正发生的是他这台浏览器解码失败 / R2 跨域被挡。
   * ⚠ `subject` 存的是**机器可读的原因码**（`VideoFrameCaptureReason`），
   *   人话在渲染那一侧过词表（同 `revertField` 存字段 id 的那条）：六条原因的
   *   **修法完全不同**（跨域要配 CORS，超时是这台机器慢），压成一句「抽帧失败」
   *   会让用户去试那条唯一无效的（换个视频）。
   */
  'videoFramesFailed',
  /**
   * **存下了助手提议的那张上下文卡**（v2 §8.1，commit #14）——「已存上下文卡 X」。
   *
   * ⭐ 判据与 `questionAnswered` 逐字同源：确认卡就地换成「已确认 · 11:24」之后，
   * 「到底存下来没有」在时间线上要有一句话说得出来 —— 那张卡收成一行之后只剩
   * 状态与时刻，说不出卡名。
   * ⛔ 「不用」那一支**不落这一行**：什么都没发生，不必在时间线上记一笔。
   */
  'contextCardSaved',
  /** 存卡那一跳没成（网络 / 卡表满了）——⛔ 不静默：用户以为已经记下了。 */
  'contextCardSaveFailed',
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
  listFreshMs: 30_000,
  /** 会话菜单合并三个域后最多显示的条数。 */
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
 * 助手正文那一格里**还剩下的唯一一个时间常量**（v2 §13.1 / 拍板 13：逐字淡入
 * 改整段出现，`flushFloorMs` / `revealCharsPerSec` / `revealMaxMs` 随之删除）。
 */
export const STUDIO_OPERATOR_STREAMING = {
  /**
   * **一个工具步落定之后，等多久还没有下一步就挂占位行**（2026-09-07 真机）。
   *
   * 🔬 由来：最后一个工具步跑完到收尾正文第一个字之间实测可达数秒 —— 那段时间
   * 线程里一条活的助手行都没有，只有顶上的进度带在转，读起来像「它不打算说话了」。
   * ⚠ 它是**防闪的门槛**不是延迟动画：连着跑的工具步之间间隔常常只有几十毫秒，
   * 不设门槛的表现是每两步之间闪一行三点脉冲又被拆掉。⛔ 别往小了调到 0。
   * ⚠ 也别往大了调：超过一秒就等于这条占位行在最需要它的那一刻还没出现。
   */
  pendingAfterStepMs: 300,
} as const

/**
 * 面板外壳的几何（方向 C · `pages/assistant-shell.md` §11.1）。
 *
 * ⚠ 只放由面板统一管理的那几个数：48 = `w-12`、40 = `h-10`、24 = `p-6`
 * 都能用工具类写，但它们同时是**真机验证要读的值**（面板宽 / inset / 轨宽 / 带高），
 * 写在这里是为了测试与组件读同一个数，⛔ 不是为了让组件去算 style。
 */
export const STUDIO_OPERATOR_SHELL = {
  /**
   * 顶部头部那一行的高（v2 §4.1）。
   *
   * ⚠ 进度带整条删掉了（决策 14 / §3.6）：这个数现在量的是**头部**——会话标题▾ +
   * 设置 + 收起那一行。⛔ 别把它读成「带高」：面板上不再有那条带子。
   */
  headerHeightPx: 40,
  /** 面板 fixed 的 top/right/bottom（§11.1）。 */
  insetPx: 24,
  /**
   * 宽档的门槛（§11.1「≥700（`.wide`）时结果网格 2 列 → 4 列」）。
   *
   * ⚠ 它是**容器查询**的门槛不是视口断点：面板宽度是用户拖出来的（420–860），
   * 视口断点在这里说不了话。落地写成 `@container` + `@min-[700px]:`，这个常量
   * 是那串类名里那个数唯一的家 —— 组件与用例读同一个数（`StudioOperatorResultRow`
   * 的用例就按它断言类名），⛔ 不是让组件去算 style。
   */
  wideAtPx: 700,
  /**
   * **收起态那张微状态卡**的高（v2 §4.3 / 画板 BCollapsed）。
   *
   * ⚠ 它是外壳收起后的高，不是按钮的命中区：卡整张可点，40px 已经过
   * `ui-defaults.md §5` 的 fine 32/36 底线（这一档只有桌面 —— 手机走 44px 的
   * `STUDIO_OPERATOR_MOBILE_SHELL.fabHitPx`，触屏那条 44 在那边）。
   */
  collapsedHeightPx: 40,
} as const

/**
 * 空态最多摆几颗起手药丸（v2 §4.2 / 画板 BEmpty 的三行）。
 *
 * ⚠ 它是**封顶不是定额**：药丸表按域给，域里 `minChanges` 放行的可能不足三颗
 * （视频 / LoRA 在零改动时各只有两颗）—— 那就画两颗，⛔ 不凑数、⛔ 不补占位。
 */
export const STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT = 3

/**
 * 时间线沟（§11.3）。
 *
 * ⚠ `gutterPx` 与 `linePx` 由面板统一管理（24 / 18），所以走 style ——
 * ⛔ 不写 `grid-cols-[24px_1fr]`（Hard Rule 5：不用 arbitrary value），也不为它
 * 去改 `globals.css` 的 `@theme inline`（那是全站脊柱，一个面板的沟宽不配进去）。
 * ⚠ `linePx` 必须等于「流的左内距 + 节点半宽」：节点与贯穿竖线**同轴**是这条沟
 * 唯一的视觉承诺，两个数分开调就会看到线从节点旁边擦过去。
 */
export const STUDIO_OPERATOR_TIMELINE = {
  /** 沟宽（头像与形状节点）。 */
  gutterPx: 24,
  /** 贯穿竖线距流左缘多少 —— 同时是节点圆心的 x。 */
  linePx: 18,
  /**
   * 助手正文超过这么多**行**就自动折起来，留一颗「展开全文」（2026-09-06 面板轮）。
   *
   * ⚠ 数的是**换行数**不是渲染行数：渲染行数要量 DOM（面板宽度是用户拖出来的），
   * 而量 DOM 换来的是一个会在拖宽时抖动的折叠开关。段落数是内容自己的属性，
   * 拖宽拖窄它都不变 —— 折叠与否因此是稳定的。
   * ⚠ 6 是「一屏读得完」的那个数。往大了调等于这颗折叠永远不出现（模型的回答
   * 很少超过十来段），往小了调会把两句话的正常回答也折起来。
   */
  collapseAfterLines: 6,
  /**
   * 距底多少像素以内算「用户本来就在底部」—— 新条目落位时才跟着滚
   * （2026-09-07 真机，见 `shouldStickOperatorScroll`）。
   *
   * ⚠ 不是 0：一条正文长出来的过程中距离每帧都在变，取 0 等于「只有分毫不差地
   * 贴着底才跟滚」，而那几乎从不成立。
   * ⚠ 也别调大到一屏：那样用户翻上去读旧内容时照样会被拽回来 —— 等于没做这条判据。
   */
  stickToBottomPx: 96,
} as const

/**
 * ToolGroup 跑完之后**多久自动收起**（§3.1 ⑧：停留 1000ms，标题变「用时 Ns」）。
 *
 * ⚠ 不是 0：跑完那一瞬间立刻折起来，用户会觉得「刚才那几行是我看花眼了」。
 * ⚠ 也不做「永不自动收起」：结果优先是方向 C 的全部意义，过程默认该让位。
 */
export const STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS = 1000

/**
 * 载回来的历史里，**最近几轮摊开**，更早的折成一行（2026-09-06 面板轮，第 5 件）。
 *
 * ⭐ 由来：一条跑了几十轮的会话，刷新之后是几屏读不完的旧日志压在今天要做的事
 * 上面。而人回到一条会话时要接上的只有最后那一两轮。
 * ⚠ 2 是「上一轮 + 上上一轮」——1 会把「我刚才让它改的那件事」也折掉（那正是
 * 用户回来要看的），3 起就又变回一屏读不完了。
 */
export const STUDIO_OPERATOR_HISTORY_OPEN_ROUNDS = 2

/**
 * 反问卡里那一项「其他」的 option id（2026-09-06 面板轮）。
 *
 * ⭐ 它**不是服务端给的选项**，是每题末尾固定加的那一行 —— 所以它需要一个不会
 * 与真选项撞车的 id，而这个 id 同时是「答复里要不要带 `otherText`」的判据。
 * ⚠ 提交时它**不进 `optionIds`**：服务端那边没有这个选项，带上去只会得到一条
 * 查无此项的答复。用户写的那句话走 `otherText`。
 */
export const STUDIO_OPERATOR_QUESTION_OTHER_ID = '__other__'

/**
 * **确认卡那一格的四态**（v2 §3.2 状态表 / 画板 BCards「确认」那一节）。
 *
 * ⚠ 住在 store 不住在卡里：收放法则（拍板 7）随时会把面板卸载，卡自己记的下场是
 * 收一下再展开，那颗**会花钱**的按钮又变回可点的 —— 而这一枪已经发出去了。
 * ⚠ `submitting` 与 `confirmed` 分开：前者管的是同一帧里的连点（两次点击 = 两枪），
 * 后者是「这一轮已经受理」。
 */
export const STUDIO_OPERATOR_CONFIRM_STATUS_IDS = {
  /** 默认态 —— 两颗按钮都可点。 */
  idle: 'idle',
  /** 点下去了，还没落地。 */
  submitting: 'submitting',
  /** 已确认 · 时间（卡就地换态，⛔ 不离开时间线）。 */
  confirmed: 'confirmed',
  /** 已取消 · 时间。 */
  cancelled: 'cancelled',
} as const

export const STUDIO_OPERATOR_CONFIRM_STATUSES = [
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
] as const

export type StudioOperatorConfirmStatus =
  (typeof STUDIO_OPERATOR_CONFIRM_STATUSES)[number]

/**
 * **生成确认卡上那四颗旋钮**（v2 §5.1 / 画板 BCards「生成 · 默认态」那一张）。
 *
 * ⚠ 顺序就是卡上从左到右的摆法 —— 模型排第一，因为换它会让后面三颗的可选值
 * 整个变（§5.1 那条「换模型会让另外三项的可选值变」）。
 * ⚠ 这四个 id 同时是 `data-knob` 与 i18n 键的后缀（`StudioOperator.confirm.generate.*`）：
 * 卡、回落纯函数、测试三处认的是同一张表，⛔ 别在任何一处抄一份字面量。
 * ⚠ ⛔ 没有「时长」那一颗：视频的时长不在 §5.1 的四颗里，它留在工作台的规格弹层上。
 */
export const STUDIO_OPERATOR_GENERATE_KNOB_IDS = {
  model: 'model',
  aspect: 'aspect',
  count: 'count',
  resolution: 'resolution',
} as const

export const STUDIO_OPERATOR_GENERATE_KNOBS = [
  STUDIO_OPERATOR_GENERATE_KNOB_IDS.model,
  STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect,
  STUDIO_OPERATOR_GENERATE_KNOB_IDS.count,
  STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution,
] as const

export type StudioOperatorGenerateKnob =
  (typeof STUDIO_OPERATOR_GENERATE_KNOBS)[number]

/**
 * 图标轨上那颗**状态点**的四档语义（拍板 7 改口：胶囊没了，语义迁到状态点）。
 *
 * ⚠ 这里是**语义档**不是颜色：颜色在组件里按脊柱四 token 落地
 * （`ui-defaults.md §2.1` + `assistant-shell.md §11.2`），⛔ 常量层不存 hex。
 * ⚠ 值同时是 i18n 键的后缀（`StudioOperator.rail.*`）—— 收起之后这一行字是助手
 * 唯一还看得见的东西，光一颗点等于什么都没说。
 */
export const STUDIO_OPERATOR_RAIL_TONES = {
  /** 什么都没在跑。 */
  idle: 'idle',
  /** 干活中（进度环 + 脉冲）。 */
  working: 'working',
  /**
   * 停在**计划卡**上，一整轮还没开始跑（§4.1 `awaitingPlan` 那一列：
   * 图标轨「状态点闪烁 + 待你定」）。
   *
   * ⚠ 与 `awaiting` **分开**（切片 3a 加的第五档）：那一档是「有一件事等你拍板
   * 才能继续」（覆盖三选 / 花钱 / 歧义反问），这一档是「一整轮还没开始」。
   * 合成一档的表现是轨上永远只有一句「待确认」，而两者的下一步动作完全不同 ——
   * 一个是回答一个问题，一个是决定要不要让它开跑。
   */
  planning: 'planning',
  /** 停在就地确认 / 花钱确认 / 歧义反问上，等用户定。 */
  awaiting: 'awaiting',
  /** 这一轮失败了。 */
  error: 'error',
} as const

export type StudioOperatorRailTone =
  (typeof STUDIO_OPERATOR_RAIL_TONES)[keyof typeof STUDIO_OPERATOR_RAIL_TONES]

/**
 * `@` 提及选择器（§3.3 / §7 的四入口）。
 *
 * ⚠ `warnAboveCount` 是**提示线不是闸**（owner 2026-09-06 定「看图上限：不设硬
 * 上限」）：超过它只把计数转 warning 并加一句「超 8 张可能不准」，⛔ 不拦截、
 * ⛔ 不软截断。原型阶段那句「只细看前 8 张」已作废 —— 悄悄少看几张是本仓最
 * 讨厌的那种失败（界面说看了 12 张，实际看了 8 张）。
 * ⚠ `trigger` 单独列出来是因为解析（hook）与占位语（组件）读的必须是同一个字符。
 */
export const STUDIO_OPERATOR_MENTION = {
  trigger: '@',
  /** 超过这么多张就把 chip 区计数转 warning（见上：只提示，不拦）。 */
  warnAboveCount: 8,
} as const

/**
 * 素材库按钮打开的选择器**首屏取几条**（切片 #7c，owner「初次只加在 10 个左右」）。
 *
 * ⚠ 只是**首屏**不是上限：往下拉继续翻页（`AssetPickerBrowser` 的无限滚动照旧），
 * 点文件夹分类也照旧。⛔ 别把它读成「助手只能看 10 张素材」。
 * ⚠ 与 `/assets` 的 `ASSET_BROWSER_PAGE_SIZE`（24）分开：那是整页素材库，一屏本来
 * 就要铺满；助手这颗弹层是**顺手挑一张**，一屏 10 张就够，首屏还快。
 */
export const STUDIO_OPERATOR_LIBRARY_PAGE_SIZE = 10

/**
 * 结果行卡的入场 stagger（§11.5：30ms，最多前 12 项）。
 *
 * ⚠ 单位是**秒**（motion 的 `delay` 收秒），与 `STUDIO_OPERATOR_REFERENCE_STAGGER_SECONDS`
 * 同一条理由。⚠ 封顶 12 项：一批 20 张时第 20 张要等 600ms 才出现，而那时用户
 * 已经在看第一张了 —— `ui-defaults.md §4` 的那条封顶就是为这个。
 */
export const STUDIO_OPERATOR_RESULT_STAGGER = {
  stepSeconds: 0.03,
  maxItems: 12,
} as const

/**
 * 移动端外壳的几何（`ui-defaults.md §6` 移动端配方 · `assistant-shell.md` §11.1）。
 *
 * ⚠ 与 `STUDIO_OPERATOR_SHELL` **分开一份**：那份描述的是桌面那颗浮层
 * （宽度记忆 / 48px 图标轨 / inset 24），手机上一个都不成立 —— 手机是全屏
 * Sheet + 一颗浮标，既不记宽也没有轨。混进同一个对象只会让「面板宽」这类
 * 在手机上根本没有意义的字段跟着到处传。
 */
export const STUDIO_OPERATOR_MOBILE_SHELL = {
  /**
   * 全屏 Sheet 的高度。
   *
   * ⚠ `dvh` 不是 `vh`（`ui-defaults.md §6`）：iOS 上地址栏收放会让 `100vh` 比
   * 可视区高出一截，表现是输入区被顶到屏幕外面去。软键盘那一段由
   * `--keyboard-inset` 从 `maxHeight` 里再扣（`KeyboardInsetBridge` 供值）。
   */
  sheetHeight: '100dvh',
  /** 浮标的命中区 —— 触屏 44（`ui-defaults.md §5`）。 */
  fabHitPx: 44,
  /** 浮标距视口右缘的留白。 */
  fabInsetPx: 16,
  /**
   * 浮标距视口下缘的留白（safe-area 与软键盘之上再加这么多）。
   *
   * ⚠ 它比 `fabInsetPx` 大得多是**有原因的**：图片 / 视频档的手机形态底部钉着
   * `StudioMobileComposer` 那条固定栏（`fixed bottom-0 z-40`），浮标贴到 16px
   * 会正好压在生成键上。这个数是「清过那条栏」的净空，⛔ 不是随手挑的留白。
   * ⚠ 浮标同时用 `z-30`（低于 composer 的 `z-40`）兜底：净空万一不够，让位的
   * 是浮标不是生成键。
   */
  fabBottomPx: 96,
} as const

/**
 * 调查卡上**默认铺开几条证据**（2026-09-07）。
 *
 * 🔬 owner 打回：「图一这个过程直接跳过不显示吧」—— 一轮检索的 19 条证据连着
 * 整段简介全文铺开，一张卡吃掉整屏，而用户要的答案（查到了什么、有哪些图）在
 * 最上面一行。剩下的进「还有 M 条」。
 * ⚠ 数字放这里而不是写在组件里：它是**产品判断**（一屏里留给证据多少行），
 * 与那颗组件的排版无关。
 */
export const STUDIO_OPERATOR_RESEARCH_EVIDENCE_PREVIEW = 5

/**
 * **默认不进证据列表**的那几档（2026-09-07）。
 *
 * ⚠ 判据是证据的 `kind`，⛔ 不是去匹配摘要的字面：
 *  · `image` —— 摘要恒是「image on this page (1024×1024)」这类占位（见
 *    `toAssistantEvidence`：图片档有意不放地址），而那些图**本来就画在下面的
 *    候选网格里**，在证据列里再列一遍是同一件事说两遍；
 *  · `tags` —— 摘要是「danbooru: a, b, c, …」一整堆分类标签，它是给模型对齐用的
 *    底稿，不是讲给人听的结论。
 * ⛔ 不是删掉：展开之后照样看得见（可复核是这张卡的另一半）。
 */
export const STUDIO_OPERATOR_RESEARCH_LOW_SIGNAL_KINDS: readonly string[] = [
  'image',
  'tags',
]

/**
 * 三帧的入场 stagger（§11.5）。⚠ 单位是秒，与 `STUDIO_OPERATOR_RESULT_STAGGER`
 * 同一条理由；三帧不需要封顶，条数是契约里的常量 3
 * （`ASSISTANT_OPERATOR_LIMITS.videoCritiqueFrameCount`）。
 *
 * ⛔ **位置词表不在这里** —— 它是跨进程契约的一部分，住在
 * `constants/assistant-operator.ts` 的 `ASSISTANT_OPERATOR_CRITIQUE_FRAME_LABELS`。
 * 在这里再抄一份就是同一件事两个真相源。
 */
export const STUDIO_OPERATOR_CRITIQUE_FRAME_STAGGER_SECONDS = 0.03

/**
 * 视频工作台参考区的**三个具名槽**（第二期，owner 定）。
 *
 * ⭐ 具名而不是位置：首尾帧此前靠**下标**承载（`reference-image-capabilities.ts`
 * WAN_30 那段头注写得很明白，「[0] 首帧、[1] 尾帧」），于是「删掉第一张」会把
 * 尾帧悄悄变成首帧 —— 一次静默的语义漂移，用户看不见也撤不回。槽有名字之后，
 * 空首帧 + 有尾帧是一个**可表达**的状态。
 *
 * ⚠ `reference` 是普通图片参考槽（多图），`video` 是参考视频槽 —— 它们与首尾帧
 * 是并列关系，不是「其余的都归它」：模型能力表决定哪些槽出现（见
 * `getVideoWorkbenchSlots`），⛔ 不支持的槽**不渲染**，不摆禁用占位
 * （`ui-defaults.md` 状态配方）。
 */
export const STUDIO_VIDEO_SLOT_IDS = {
  first: 'first',
  last: 'last',
  reference: 'reference',
  video: 'video',
} as const

export type StudioVideoSlotId =
  (typeof STUDIO_VIDEO_SLOT_IDS)[keyof typeof STUDIO_VIDEO_SLOT_IDS]

/** 槽的渲染顺序 —— 首帧 → 尾帧 → 参考视频，图片参考槽由既有的参考轨承担。 */
export const STUDIO_VIDEO_FRAME_SLOT_ORDER = [
  STUDIO_VIDEO_SLOT_IDS.first,
  STUDIO_VIDEO_SLOT_IDS.last,
  STUDIO_VIDEO_SLOT_IDS.video,
] as const

/** 空槽虚线框的边长（px）—— 缩略图与空态同尺寸，切换时不跳版。 */
export const STUDIO_VIDEO_SLOT_SIZE_PX = 72

/**
 * **断点续跑**（第三期，owner 2026-09-07 定「失败断点续跑 / 只重跑下游」）。
 *
 * ── 为什么这几个数住面板侧而不是协议侧 ────────────────────────────────
 * 服务端只收 `resumeFrom`（`planId` + 已完成步），它一个 localStorage 键都不认识。
 * 「上次那份计划存在哪、存几步、按哪个项目分隔」全是客户端一侧的事 —— 服务端
 * 零会话态（§1）在续跑上没有任何例外，所以这块的家在这份面板词表里。
 *
 * ⚠ 步数与产物条数的上限**不在这里** —— 它们是 `resumeFrom` 载荷的形状，家在
 * `constants/assistant-operator.ts` 的 `ASSISTANT_OPERATOR_RESUME_LIMITS`。
 * ⚠ `keyPrefix` 后面**必须再拼一段 scope**（项目 id / 工作台 surface）：一个全局
 * 键的下场是在 A 项目里失败的那份计划，跑到 B 项目的面板上问「要继续吗」——
 * 而那份计划里的每一个产物 id 在 B 项目里都不存在。
 * ⚠ 键里带 `v1`：这份结构以后会变，而一份读不动的旧值应当被整条丢掉
 * （`readOperatorResume` 解不出来就返回 null），⛔ 不做迁移分支。
 */
export const STUDIO_OPERATOR_RESUME = {
  keyPrefix: 'pixelvault.studio.operatorResume.v1',
} as const

/**
 * 续跑记录的**保质期**：超过这个岁数的一份计划不再提示「有未完成计划」。
 *
 * ⭐ 24 小时的判据是「同一个创作时段」。一份三天前失败的计划，其中每一步引用的
 * 表单值、参考图、模型档位大概率都已经不是现在这一份了 —— 照着它续跑等于按一份
 * 过期的快照花钱。⛔ 别做成永不过期：那颗按钮会在某天突然出现，而用户完全想不
 * 起它说的是哪件事。
 */
export const STUDIO_OPERATOR_RESUME_TTL_MS = 24 * 60 * 60 * 1000
