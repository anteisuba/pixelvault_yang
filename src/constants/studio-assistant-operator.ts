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
import {
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  type AssistantOperatorDomain,
} from '@/constants/assistant-operator'

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
  /**
   * 当前模型**专属的那一行 chip**（进度表 11 的专属区 → 21 的 `set_capability`）。
   *
   * ⚠ 与 `specs` 分成两格：规格回答的是三模态同形的「下一版长什么样」，专属区
   * 回答的是「这个模型独有的那几颗旋钮」，换个模型整行换掉。合成一格的表现是
   * 「还原规格」把用户调好的 guidance 一起撤掉。
   * ⚠ 一整行共用这一格（与 `loras` 逐字同源）：逐条撤销仍然是逐条的，这一格管的
   * 是「还原这个字段」那颗按钮的粒度。
   */
  capabilities: 'capabilities',
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
  /**
   * 画布域的节点（进度表 22）—— **一整轮动过的节点共用这一格**。
   *
   * ⚠ 共用一格的理由与 `loras` 逐字同源：用户心里只有「助手动了我的画布」这
   * 一件事，而逐节点开一格会让登记簿的格数跟着画布长。逐条撤销仍然是逐条的
   * （日志条上那颗撤销钮走 `step.inverse`），这一格管的是「还原这个字段」的粒度。
   * ⚠ ✦ 归属标记在画布上**不画在参数栏**（那里没有参数栏），画在被动到的
   *   节点自己身上（D7 Q4 的 outline 闪一次）。
   */
  canvasNodes: 'canvasNodes',
} as const

export type StudioOperatorField =
  (typeof STUDIO_OPERATOR_FIELD_IDS)[keyof typeof STUDIO_OPERATOR_FIELD_IDS]

/**
 * **后果落在库里、表单一格没动**的那几条改动型工具，对应 checkpoint 薄卡上的
 * 一格（2026-09-12 实测第 9 步）。
 *
 * ⭐ 起因很具体：记一条项目规则之后，薄卡上写着「已改 1 项：」—— 冒号后面空着。
 * 数是 `countRoundChanges`（数**可撤的步**）给的，名字是 `roundFields`（读
 * **登记簿**）给的，而这几条工具按设计不进登记簿（`applyOperatorStep` 返回
 * `null`）—— 两个数据源对不上，冒号后面就什么都没有。
 * ⚠ 它们**不是**登记簿的一格：✦ 归属标记管的是「工作台上这颗旋钮被助手动过」，
 * 而这几条一颗旋钮都没动。⛔ 别为了让薄卡有话说就把它们塞进
 * `STUDIO_OPERATOR_FIELDS` —— 那会让参数栏上多出一颗点了没反应的 ✦。
 * ⚠ 同时是**「还原到这一步」那颗按钮的负名单**：还原读的是工作台快照，而这几步
 * 的后果不在快照里（见 `StudioOperatorPanel` 那一处）。
 */
export const STUDIO_OPERATOR_CHANGE_SUBJECT_BY_TOOL: Readonly<
  Record<string, string>
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]: 'rule',
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]: 'reviewState',
  [ASSISTANT_OPERATOR_TOOL_IDS.tagAsset]: 'assetTags',
  [ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset]: 'assetFavorite',
  [ASSISTANT_OPERATOR_TOOL_IDS.createFolder]: 'assetFolder',
  [ASSISTANT_OPERATOR_TOOL_IDS.moveAssets]: 'assetMove',
}

/** 这一步的后果在库里（表单没动）—— 还原按钮与薄卡标签共用这一条判据。 */
export function studioOperatorChangeSubject(tool: string): string | null {
  return STUDIO_OPERATOR_CHANGE_SUBJECT_BY_TOOL[tool] ?? null
}

export const STUDIO_OPERATOR_FIELDS = [
  STUDIO_OPERATOR_FIELD_IDS.prompt,
  STUDIO_OPERATOR_FIELD_IDS.negative,
  STUDIO_OPERATOR_FIELD_IDS.model,
  STUDIO_OPERATOR_FIELD_IDS.specs,
  STUDIO_OPERATOR_FIELD_IDS.count,
  STUDIO_OPERATOR_FIELD_IDS.capabilities,
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
   * 栈总权重超过当前底模那一档预算（§5.2）——**只提醒，不动手**。
   *
   * ⛔ 不自动归一、⛔ 不拒那一步：助手已经把权重设成用户要的那个值了，这一行说的
   * 是「设是设了，叠到这个数画面容易糊 / 串味」。收哪一把由用户说，⛔ 助手不替他挑。
   * ⚠ `subject` 存的是「总权重 / 阈值」这一对数（如 `2.3 / 1.5`）——两个数缺一个
   * 这句话就不成立：光说超了不给阈值，用户不知道该收到哪儿。
   */
  'loraWeightOverBudget',
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
   * ⚠ 「不用」那一支落的是 `contextCardDeclined`（2026-09-12 真机 bug 起）：
   *   那一下**也是用户的一次表态**，不落账的下场是模型每开一条流都重提同一张卡。
   */
  'contextCardSaved',
  /**
   * **回绝了助手提议的那张卡**（2026-09-12 真机 bug）——「没记这张上下文卡 X」。
   *
   * ⭐ 从前这一支什么都不落，理由是「什么都没发生」。真机推翻了它：这两行同时
   * 是一条自带题面的 user 消息（`userText`），少了它模型看到的是一条从未被回应
   * 的「记一下」，于是每一轮重新提议同一张卡，正事一件不办。
   */
  'contextCardDeclined',
  /** 存卡那一跳没成（网络 / 卡表满了）——⛔ 不静默：用户以为已经记下了。 */
  'contextCardSaveFailed',
  /**
   * **在 LoRA 推荐卡上勾了几把并点了「挂载所选」**（lora-assistant §10.1 落账
   * 三件套）——「已选要挂的 LoRA：清宵、overwatch_3d_anima」。
   *
   * ⭐ 判据与 `contextCardSaved` 逐字同源：卡就地收成「已挂 2 把 · 11:24」之后，
   * 时间线上只剩状态与时刻，说不出勾的是哪几把；而这一行同时是一条自带题面的
   * user 消息（`userText` + `answered`），少了它模型下一轮读到的是一张没人回应
   * 的推荐卡，于是重提同一张。
   * ⚠ `subject` 是**名字列表**（权重在 `userText` 里）：这一行要一眼读得出挂的是
   *   哪几把，⛔ 不写 candidateId（那串 id 用户核对不了）。
   */
  'loraPickMounted',
  /**
   * **把推荐卡关掉、一把都不挂**（lora-assistant §10.3.1「关掉不点」）。
   *
   * ⭐ 与 `contextCardDeclined` 同一条教训：不说出口，模型下一轮照旧提同一张卡。
   * ⚠ `subject` 是那张卡的**题面**：一次检索一张卡，题面是它在时间线上的身份。
   */
  'loraPickDismissed',
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
   * 顶部头部那一行的高（D7c ④ · 画板 `DesignD7cShell`「头部 · 改后」）。
   *
   * ⚠ 进度带整条删掉了（决策 14 / §3.6）：这个数现在量的是**头部**——头像槽 +
   * 会话标题▾ + ⋯ 那一行。⛔ 别把它读成「带高」：面板上不再有那条带子。
   * ⚠ 44 = 画板 D7c 的口径。56 那一档是给「头像 + 规格胶囊 + 标题」三样排一行的，
   *   而规格那一句已经下沉到输入框上方（D7c ②）—— 头部只剩身份，不再需要那么厚。
   *   ⛔ 别压回 40：那一档把 32px 的标题药丸挤到只剩 4px 呼吸。
   */
  headerHeightPx: 44,
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
   * **头像开关**收起档的边长（D7b ④ · owner 2026-09-20）。
   *
   * ⚠ 它替掉了 D7 那颗 44px 近黑圆按钮：收起态四处统一成**人设头像**，36 = 画板
   *   `DesignD7bToggle` 上「与『剪辑台』胶囊同高」那个口径
   *   （`CANVAS_SHELL_LAYOUT.pillHeightPx` 也是 36，⛔ 两个数必须一起改）。
   * ⚠ 触屏命中区靠按钮自己的 padding 撑到 44（`ui-defaults.md §5`），⛔ 不是把
   *   这颗圆画大。
   */
  avatarSizePx: 36,
  /**
   * 同一颗头像落进**面板头部左上槽**时的边长（画板：22px）。
   *
   * ⚠ 开关的缩放比就是 `avatarHeaderSizePx / avatarSizePx`（22/36 ≈ 0.61，
   *   画板 ② 写死的那个数）—— ⛔ 别在组件里另写一个 0.61：两个数分开调会让
   *   头像落位时错半个像素。
   */
  avatarHeaderSizePx: 22,
  /** 头像与它左边那颗胶囊之间的空隙（画布顶栏排布用）。 */
  avatarGapPx: 8,
  /** 头部左右内距（`px-3`）—— 头像落位的 x 由它算出来，⛔ 不量 DOM。 */
  headerPadXPx: 12,
  /**
   * 展开 / 收起那两段过渡的时长（画板 ②「动画怎么做」那一支写死）。
   *
   * ⚠ 240 / 200 不是 `--duration-*` 里的任何一档，但它们**是这颗外壳原本就在用
   *   的两个数**（`StudioOperatorDock.module.css` 的 shell 过渡与外壳卸载定时器），
   *   ⛔ 别为它们往 `globals.css` 的脊柱里新造 token：那是全站的东西，一颗面板的
   *   morph 不配进去。曲线仍走脊柱的 `--ease-standard`。
   * ⚠ 卸载靠**定时器**读这个数，⛔ 不靠 `animationend` / `transitionend`：后台标签页
   *   里 rAF 冻结，事件永远不来，留下的是一个吃着点击的幽灵面板（Dock 头注那条）。
   */
  openMs: 240,
  closeMs: 200,
  /**
   * 空态那排建议 chip **逐颗错开**多久（D7c ④ 画板动效表：入场 180ms 错开 30ms）。
   *
   * ⚠ 与 `constants/motion.ts` 的 `staggerDelay()`（50ms 步进）**不是**同一件事：
   *   那一支是给列表 / 网格用的，一屏十几项；这里最多 5 颗、总延迟要压在 120ms
   *   以内，50ms 步进会让最后一颗慢半拍出现。⛔ 也别为它往 `globals.css` 的脊柱
   *   里新造 token —— 判据与上面 240 / 200 那两个数逐字同源。
   * ⚠ 时长本身仍走既有档（`--duration-base`），⛔ 不为画板上的 180ms 开新档。
   */
  pillStaggerMs: 30,
} as const

/**
 * 头像与面板在视口上的**两个锚点**（D7b ④ · 头像开关）。
 *
 * ⭐ 为什么是宿主给而不是外壳自己判：画布有顶栏（面板顶边 = 顶栏底 + 6，头像排在
 * 「剪辑台」右侧），工作台 / LoRA 没有（头像与面板同贴右上留白）。⛔ 别在 Dock 里
 * 按 `domain === 'canvas'` 硬判 —— 第四个宿主该由它自己说了算，判据与
 * `collapseOnOutsidePointer` 逐字同源。
 *
 * ⚠ 四个数全是**距视口上缘 / 右缘**的 px。开关的位移由它们算得出来，所以 ⛔ 不量
 * DOM：量 DOM 的那一版会在面板还没布局完的第一帧算出一个错位的 transform。
 */
export interface StudioOperatorShellAnchor {
  readonly avatarTopPx: number
  readonly avatarRightPx: number
  readonly panelTopPx: number
  readonly panelRightPx: number
}

/** 没有顶栏的宿主（图片 / 视频工作台 · LoRA 装配台）：头像与面板同贴 24 留白。 */
export const STUDIO_OPERATOR_DEFAULT_ANCHOR: StudioOperatorShellAnchor = {
  avatarTopPx: STUDIO_OPERATOR_SHELL.insetPx,
  avatarRightPx: STUDIO_OPERATOR_SHELL.insetPx,
  panelTopPx: STUDIO_OPERATOR_SHELL.insetPx,
  panelRightPx: STUDIO_OPERATOR_SHELL.insetPx,
}

/**
 * **四张脸**各自那几颗起手药丸（D7b ③ · 画板 `DesignD7bFaces`，owner 2026-09-20）。
 *
 * ⭐ 「一个壳，四张脸」只换三样，这是其中之一：药丸就是「这个助手会干什么」的
 * 自我介绍，四处各写各的。另外两样是**头部域标记**与**空态那句话**，它们跟着
 * `face` 契约一起由宿主给（见 `contexts/studio-operator-host.tsx` 的 `face`）。
 *
 * ⚠ 值是 **i18n 键的后缀**不是文案：三语各自写自己的话，中文那句直译成日文会很怪。
 * ⚠ 写成 `Record<域, …>`：域加一个而药丸没跟上，编译期就红。
 * ⚠ 顺序就是画板上从左到右的顺序，⛔ 别在组件里重排。
 * ⛔ 这里**没有 `minChanges`**：D7b 的药丸是「自我介绍」不是「语境化建议」——
 *   一进来就要看得见四处各自是谁，而门会让空态在某些域上只画得出两颗。
 * ⛔ 旧那张 `STUDIO_OPERATOR_SUGGESTIONS`（带 `minChanges` 门）与
 *   `STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT` **整块已删**，连同三语的
 *   `StudioOperator.suggestion.*` 词条 —— 空态与输入区上方那一排现在读的都是这张表，
 *   ⛔ 不留兼容层。
 */
export const STUDIO_OPERATOR_FACE_PILLS: Record<
  AssistantOperatorDomain,
  readonly string[]
> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: [
    'writePrompt',
    'compareModels',
    'useReference',
    'fourVariants',
  ],
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: [
    'animateThis',
    'frameBridge',
    'pacing',
    'cameraMove',
  ],
  /**
   * LoRA 的脸是 owner 09-20 改口后的那一张：核心是**用 LoRA 出对图**，三件事都要
   * 助手辅助 —— 提示词写对 · LoRA 挂对 · 参数调对。⛔ 不是「找风格 / 查冲突」。
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: [
    'whichLoras',
    /**
     * ⚠ 与图片那颗 `writePrompt` **分成两个键**：画板上两句话不一样（图片是
     * 「把这句写成好提示词」，LoRA 是「帮我写这张的提示词」—— 后者的语境是
     * 触发词 / 顺序 / 权重语法）。⛔ 共用一个键等于让其中一处说错话。
     */
    'loraPrompt',
    'weightCheck',
    'trialShot',
  ],
  /** 画布是**全能导演**：剧本 → 资产 → 分镜 → 视频，外加「帮我连线」。五颗封顶。 */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: [
    'scriptToBoard',
    'refToCharacter',
    'assetsToBoard',
    'boardToVideo',
    'autoWire',
  ],
}

/**
 * 脸上那排药丸的**封顶**（画板：「最多 5 颗，两行以内」）。
 *
 * ⚠ 它是**封顶不是定额**：域里给几颗就画几颗，⛔ 不凑数、⛔ 不补占位。
 */
export const STUDIO_OPERATOR_FACE_PILL_LIMIT = 5

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
 * （宽度记忆 / 48px 图标轨 / inset 24），手机上一个都不成立 —— 手机是半屏
 * 可拖 Sheet + 一颗浮标，既不记宽也没有轨。混进同一个对象只会让「面板宽」
 * 这类在手机上根本没有意义的字段跟着到处传。
 */
export const STUDIO_OPERATOR_MOBILE_SHELL = {
  /**
   * Sheet 的高度 —— **接近满屏，顶上只留一条窄缝**（owner 2026-09-20 真机：
   * 「感觉半屏高度不够」「Sheet 打开就接近满屏，像 Claude / GPT 的手机版」）。
   *
   * ── ⛔ 半屏那一档已整块退场 ──────────────────────────────────────
   * 55% 那一档把 376px 分给「头部 55 + 会话区 100 + 建议 chip 70 + 规格行与输入
   * 区 130」—— 会话区是唯一的弹性格，于是它一个人吃掉所有挤压，空态那 153px
   * 连一句话都摆不下。**助手就是当前任务**，不该只占半屏。
   * ⚠ 顶上那条缝只够让人看出「后面还有东西、这是一层可关的」，⛔ 不留到能看
   *   结果缩略图 —— 那些高度归会话区。
   * ⚠ 跟着退场的是 `snapPoints` 整套（半屏 / 全屏两档、键盘升档、关掉复位）：
   *   只有一个高度就没有档可吸，vaul 回到它最常走的那条路 —— 一张固定高度、
   *   往下拖即关的抽屉。软键盘由 `maxHeight` 扣 `--keyboard-inset` 接住，⛔ 不再
   *   靠「升到全屏」绕。
   *
   * ⚠ `svh` 不是 `vh` 也不是 `dvh`（`ui-defaults.md §6` + `responsive-dialog.tsx`
   *   的 `max-h-[95svh]` 同一口径）：`vh` 在 iOS 上比可视区高出一截（输入区被顶
   *   出屏幕）；`dvh` 会随地址栏收放变高变矮，而这张 Sheet 现在几乎占满一屏 ——
   *   跟着抖的表现是滚动位置每次都跳。`svh` 取的是地址栏**展开**时的那一档，
   *   于是它在两种状态下都装得下。
   */
  sheetHeight: '95svh',
  /** 浮标的命中区 —— 触屏 44（`ui-defaults.md §5`）。 */
  fabHitPx: 44,
  /**
   * 头像距视口右 / 上缘的留白。
   *
   * ⚠ ⛔ `fabBottomPx`（96）**已删**：D7b 起收起态头像挂**右上角**，不再从底部那条
   * `StudioMobileComposer` 固定栏旁边绕路 —— 那个数存在的全部理由是「清过生成键」，
   * 而头像已经不在下面了。
   */
  fabInsetPx: 16,
  avatarTopPx: 64,
} as const

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

/**
 * **跳过 ≠ 失败**（2026-09-12 实测第 7 步）。
 *
 * 🔬 实测：同一轮里第二次 `set_prompt` 被原地打转护栏正确去重（日志写着「这一步
 * 刚才做过了，跳过」），而工具组那一行把它计成了「1 失败」—— 一轮明明全做成了
 * 的操作，折叠行上顶着一个红色的失败数。
 * ⚠ 名单只收**幂等/已经做过**这一档，⛔ 不收「被拒是因为条件不对」那些
 * （`malformedArgs` / `unknownModel` …）：那些是真的没做成，该算失败。
 */
export const STUDIO_OPERATOR_SKIPPED_REJECT_REASONS: readonly string[] = [
  ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
]
