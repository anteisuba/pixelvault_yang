import { AUDIO_SPEAKER_VOICE_IDS_MAX } from '@/constants/audio-options'
import { AUDIO_EMOTION, type AudioEmotion } from '@/constants/voice-cards'

/**
 * 配音间（`/studio/audio`）—— 域常量。
 *
 * 这一页的核心循环只有四步：**选角 → 选中谁 → 打字 → 生成**。
 * owner 2026-08-29 拍板把范围收到这个最小闭环，AI 人格 / 自由接话 / 剧本视图
 * 全部不做，所以这里没有它们的常量——需要时再加，不预留。
 */

/* ── 说话人 ─────────────────────────────────────────────────────── */

/**
 * 班底成员的种类。
 *
 * `bgm` 不会成为台词（配乐是房间级底垫，不进聊天流），但它**是**班底的一员：
 * 输入行里有它的头像，点它是去挑配乐。
 */
export const VOICE_ROOM_SPEAKER_KIND = {
  VOICE: 'voice',
  SFX: 'sfx',
  BGM: 'bgm',
} as const

export const VOICE_ROOM_SPEAKER_KINDS = [
  VOICE_ROOM_SPEAKER_KIND.VOICE,
  VOICE_ROOM_SPEAKER_KIND.SFX,
  VOICE_ROOM_SPEAKER_KIND.BGM,
] as const

export type VoiceRoomSpeakerKind = (typeof VOICE_ROOM_SPEAKER_KINDS)[number]

/** 能成为台词的种类——`bgm` 不在其中。 */
export const VOICE_LINE_SPEAKER_KINDS = [
  VOICE_ROOM_SPEAKER_KIND.VOICE,
  VOICE_ROOM_SPEAKER_KIND.SFX,
] as const

export type VoiceLineSpeakerKind = (typeof VOICE_LINE_SPEAKER_KINDS)[number]

/**
 * 音效师与配乐是**内建**班底成员，不对应任何 VoiceCard，所以 id 用固定前缀占位。
 * 前缀让它们和 cuid 形态的 voiceCardId 一眼可分，也保证不会撞。
 */
export const VOICE_ROOM_BUILTIN_SPEAKER = {
  SFX: 'builtin:sfx',
  BGM: 'builtin:bgm',
} as const

/**
 * 班底上限。取 `AUDIO_SPEAKER_VOICE_IDS_MAX`（Fish 多说话人的上限）而不是另拍
 * 一个数：一个房间的人声全部可能出现在同一次多说话人请求里，上限对不齐就会
 * 出现「加得进班底、生成时被静默丢掉」。
 *
 * ⚠ 这个上限只约束 `voice` 档；音效师和配乐是内建的，不占名额。
 */
export const VOICE_ROOM_VOICE_CAST_MAX = AUDIO_SPEAKER_VOICE_IDS_MAX

/**
 * 头像色板的档数（实际颜色定义在 `voiceroom.css` 的 `[data-tone='N']`）。
 * 组件按班底顺序取 `index % VOICE_ROOM_AVATAR_TONE_COUNT`。
 *
 * ⚠ 改这个数就要同步改 CSS 里的档数，否则超出的说话人拿不到背景色（透明头像）。
 */
export const VOICE_ROOM_AVATAR_TONE_COUNT = 8

/* ── 房间与台词 ─────────────────────────────────────────────────── */

export const VOICE_ROOM_NAME_MAX_LENGTH = 60

/** 一次拉取的房间数。左列是个短列表，不做无限滚动。 */
export const VOICE_ROOM_LIST_LIMIT = 50

/**
 * 单条台词的字数上限。
 *
 * ⚠ 不要和 provider 的 `maxPromptChars` 混为一谈：那是各家自己的限制，由
 * generate-audio 链路按模型校验。这里管的是「一个气泡能有多长」——聊天形态下
 * 一条台词就该是一句话，几千字应该拆成几条而不是塞进一个气泡。
 */
export const VOICE_LINE_TEXT_MAX_LENGTH = 2_000

/** 一个房间最多几条台词。到顶提示新开房间，而不是静默截断。 */
export const VOICE_ROOM_LINES_MAX = 500

/**
 * 有台词还在生成时，隔多久重新拉一次房间。
 *
 * 只在**确实有 QUEUED / RUNNING 的台词时**才转（见 `use-voiceroom`），所以这
 * 是个短间隔而不是心跳——安静的房间一个请求都不发。
 */
export const VOICE_ROOM_POLL_MS = 2_000

/* ── 动效时长 ───────────────────────────────────────────────────── */

/**
 * 需要 **JS 参与编排**的那几个时长。
 *
 * ⚠ 只有「等一段时间再做下一件事」的才放在这里——纯 CSS 能表达的（气泡入场、
 * 波形逐条长出、面板开合）一律留在 `voiceroom.css`，搬到 TS 里只会制造两处
 * 需要对齐的数字。**两处合起来就是配音间的完整动效字典**，没有第三份。
 */

/** 切房间：旧聊天流退场，退完才换成新的。 */
export const VOICE_ROOM_SWITCH_OUT_MS = 150

/** 切房间后，新聊天流逐条接力的间隔。 */
export const VOICE_ROOM_LINE_STAGGER_MS = 40

/** 「正在开口」→ 语音条的交接：讲话丸先缩掉，再让语音条进来。 */
export const VOICE_ROOM_HANDOFF_MS = 180

/**
 * 失败时抖一次的时长。
 *
 * ⚠ 与 `voiceroom.css` 的 `@keyframes vr-shake` 时长同源——收尾靠定时器而不是
 * `animationend`（那个事件会从子元素冒泡上来，把 shake 提前清掉）。
 */
export const VOICE_ROOM_SHAKE_MS = 260

/**
 * 试听进度环的半径（SVG 用 `viewBox="0 0 100 100"` 的坐标，不是像素）。
 *
 * ⚠ 组件按它算周长填 `stroke-dasharray`，`voiceroom.css` 里环的**画布尺寸**是另
 * 一个数（100px）——这里改了不用动 CSS，viewBox 会自己缩放。
 */
export const VOICE_ROOM_PREVIEW_RING_RADIUS = 48

/** 头像从卡片飞进班底托盘的时长（峰值节拍）。 */
export const VOICE_ROOM_FLY_MS = 420

/**
 * 飞行落地的兜底余量。
 *
 * 后台标签页里 WAAPI 会被暂停，`onfinish` 可能永远不来——没有这道兜底，用户点的
 * 「请进房间」就凭空消失了。宁可动效没看到，不能让动作丢掉。
 */
export const VOICE_ROOM_FLY_FALLBACK_GRACE_MS = 400

/** 换分栏时，旧内容退场、新内容接力入场之间的交接。 */
export const VOICE_ROOM_TAB_SWAP_MS = 120

/** 触底扩载的触发余量：离底还有这么多像素就开始要下一页。 */
export const VOICE_ROOM_LOAD_MORE_THRESHOLD_PX = 40

/* ── 情感：写在句子里 ───────────────────────────────────────────── */

/**
 * 句首情感括号。
 *
 * owner 2026-08-29 拍板：**情感融进提示词**，不设独立选择器——
 * 「（耳语）别回头」里的「耳语」是情感，「别回头」才是台词。
 *
 * 三种括号都收：中文全角 `（）`、英文半角 `()`、方头括号 `【】`。
 * 内容限 1–12 字是**防误伤**：真正的情感词都很短，放宽了会把
 * 「（他压低声音说）今晚八点」这种叙述整段吃掉。
 */
export const VOICE_LINE_EMOTION_PATTERN =
  /^\s*[（(【]\s*([^）)】]{1,12})\s*[）)】]\s*/

/**
 * 括号里的词 → `AUDIO_EMOTION` 档位。
 *
 * 为什么要词表而不是把括号内容直接当提示词：`AUDIO_EMOTION_PROMPTS` 已经把每档
 * 映射到了 provider 认得的**规范英文词**（`whispers` / `angry`），而它那条注释
 * 写得很清楚——强规范词比描述性短语落地硬得多。中文原词直接丢给 Fish 效果不稳。
 *
 * ⚠ 匹配前会 `trim().toLowerCase()`，所以这里的键**必须全小写**。
 * ⚠ 认不出的词**不剥离**：那多半是台词自己的一部分，宁可原样念出来，也不要
 * 悄悄吞掉用户写的字。
 */
export const VOICE_LINE_EMOTION_ALIASES: Record<string, AudioEmotion> = {
  // 平静
  平静: AUDIO_EMOTION.CALM,
  冷静: AUDIO_EMOTION.CALM,
  平淡: AUDIO_EMOTION.CALM,
  calm: AUDIO_EMOTION.CALM,
  // 兴奋
  兴奋: AUDIO_EMOTION.EXCITED,
  激动: AUDIO_EMOTION.EXCITED,
  热情: AUDIO_EMOTION.EXCITED,
  excited: AUDIO_EMOTION.EXCITED,
  // 耳语
  耳语: AUDIO_EMOTION.WHISPER,
  低语: AUDIO_EMOTION.WHISPER,
  轻声: AUDIO_EMOTION.WHISPER,
  悄悄: AUDIO_EMOTION.WHISPER,
  whisper: AUDIO_EMOTION.WHISPER,
  whispers: AUDIO_EMOTION.WHISPER,
  // 旁白
  旁白: AUDIO_EMOTION.NARRATION,
  叙述: AUDIO_EMOTION.NARRATION,
  narration: AUDIO_EMOTION.NARRATION,
  // 对话
  对话: AUDIO_EMOTION.DIALOGUE,
  交谈: AUDIO_EMOTION.DIALOGUE,
  口语: AUDIO_EMOTION.DIALOGUE,
  dialogue: AUDIO_EMOTION.DIALOGUE,
  // 愤怒
  愤怒: AUDIO_EMOTION.ANGRY,
  生气: AUDIO_EMOTION.ANGRY,
  发怒: AUDIO_EMOTION.ANGRY,
  angry: AUDIO_EMOTION.ANGRY,
  // 悲伤
  悲伤: AUDIO_EMOTION.SAD,
  难过: AUDIO_EMOTION.SAD,
  伤心: AUDIO_EMOTION.SAD,
  sad: AUDIO_EMOTION.SAD,
  // 惊讶
  惊讶: AUDIO_EMOTION.SURPRISED,
  吃惊: AUDIO_EMOTION.SURPRISED,
  震惊: AUDIO_EMOTION.SURPRISED,
  surprised: AUDIO_EMOTION.SURPRISED,
}

/**
 * 气泡角标弹层里列出的档位，顺序即显示顺序。
 *
 * `null` 是「自动」——不注入任何括号提示词，让模型自己按文本判断。它排第一，
 * 因为它是不写括号时的默认状态，用户要的是「撤销我刚才选的情感」时点它。
 */
export const VOICE_LINE_EMOTION_CHOICES = [
  null,
  AUDIO_EMOTION.CALM,
  AUDIO_EMOTION.EXCITED,
  AUDIO_EMOTION.WHISPER,
  AUDIO_EMOTION.NARRATION,
  AUDIO_EMOTION.DIALOGUE,
  AUDIO_EMOTION.ANGRY,
  AUDIO_EMOTION.SAD,
  AUDIO_EMOTION.SURPRISED,
] as const
