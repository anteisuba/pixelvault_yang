import { z } from 'zod'

import {
  AUDIO_EMOTIONS,
  AUDIO_PACES,
  type AudioPace,
} from '@/constants/voice-cards'
import {
  AUDIO_EXPRESSIVENESS_VALUES,
  type AudioExpressiveness,
} from '@/constants/audio-options'
import {
  VOICE_LINE_SPEAKER_KINDS,
  VOICE_LINE_TEXT_MAX_LENGTH,
  VOICE_ROOM_NAME_MAX_LENGTH,
  VOICE_ROOM_SPEAKER_KINDS,
} from '@/constants/voiceroom'

/**
 * 配音间的域类型。
 *
 * 单独成文件而不是塞进 `src/types/index.ts`：那是 333 个文件依赖的枢纽，
 * 一个只有配音间用得上的形状没有理由挤进去（`research.ts` / `node-workflow.ts`
 * 都是这个先例）。
 */

/* ── 班底 ───────────────────────────────────────────────────────── */

/**
 * 班底成员。
 *
 * `id` 的含义按 `kind` 分：`voice` 档它**就是** voiceCardId，`sfx` / `bgm` 档
 * 是 `VOICE_ROOM_BUILTIN_SPEAKER` 里的固定串。不另设 `voiceCardId` 字段——
 * 两个字段存同一个事实，迟早会有一天它们对不上。
 *
 * `name` / `coverImage` 是**显示用的快照**，不是外键。音色卡改了名，房间里
 * 已经说过的话不该跟着改口。⚠ 生成时要用的 `voiceId`（provider 的
 * reference_id）**故意不存**在这里：那是功能字段，漂了会发错声音，必须实时
 * 拿 `id` 回查 VoiceCard。
 */
export const VoiceRoomCastMemberSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(VOICE_ROOM_SPEAKER_KINDS),
  name: z.string().min(1).max(120),
  coverImage: z.string().max(2_000).nullable().optional(),
})

export type VoiceRoomCastMember = z.infer<typeof VoiceRoomCastMemberSchema>

/**
 * 配乐底垫。房间级，不进聊天流。
 *
 * `gainDb` 是合成整场时垫在人声下面的增益，负值。默认 −14dB 是 mock 里印在
 * 界面上的那个数，来源是播客混音的常见人声/配乐差。
 */
export const VoiceRoomBedSchema = z.object({
  generationId: z.string().min(1),
  name: z.string().min(1).max(120),
  enabled: z.boolean(),
  gainDb: z.number().min(-60).max(0),
})

export type VoiceRoomBed = z.infer<typeof VoiceRoomBedSchema>

/* ── 台词 ───────────────────────────────────────────────────────── */

const AudioEmotionSchema = z.enum(AUDIO_EMOTIONS)

/**
 * 一条台词的声音**及其状态**。
 *
 * 不是「有声音 / 没声音」两态：气泡要分别画出「正在开口」「能播了」「失败可重试」
 * 三种样子，所以状态是这个对象的一等公民，不是靠 `url` 是不是 null 去猜。
 *
 * `status` 的四个值刻意与 Prisma 的 `GenerationJobStatus` **逐字对齐**——中间加
 * 一层大小写映射除了制造两套词汇表之外没有任何收益。
 */
export const VoiceLineAudioSchema = z.object({
  jobId: z.string(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
  /** COMPLETED 才有。 */
  url: z.string().nullable(),
  /** 秒。provider 不一定给，给不出就是 null。 */
  duration: z.number().nullable(),
  /** FAILED 才有。失败要说人话，不是静默变成一个空气泡。 */
  errorMessage: z.string().nullable(),
})

export type VoiceLineAudio = z.infer<typeof VoiceLineAudioSchema>

export const VoiceLineRecordSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  speakerId: z.string(),
  speakerKind: z.enum(VOICE_LINE_SPEAKER_KINDS),
  speakerName: z.string(),
  speakerCover: z.string().nullable(),
  /** 净台词——情感括号已剥离。 */
  text: z.string(),
  /** null = 自动（不注入情感提示词）。 */
  emotion: AudioEmotionSchema.nullable(),
  /** null = 这条台词还没派过任何生成任务（正常流程下不该出现，防御性保留）。 */
  audio: VoiceLineAudioSchema.nullable(),
  createdAt: z.string(),
})

export type VoiceLineRecord = z.infer<typeof VoiceLineRecordSchema>

/* ── 房间 ───────────────────────────────────────────────────────── */

export const VoiceRoomRecordSchema = z.object({
  id: z.string(),
  /** null = 未命名房间。左列灰字显示，不强制起名。 */
  name: z.string().nullable(),
  cast: z.array(VoiceRoomCastMemberSchema),
  bed: VoiceRoomBedSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type VoiceRoomRecord = z.infer<typeof VoiceRoomRecordSchema>

/** 房间 + 它的全部台词。打开一个房间时一次取回。 */
export const VoiceRoomDetailSchema = VoiceRoomRecordSchema.extend({
  lines: z.array(VoiceLineRecordSchema),
})

export type VoiceRoomDetail = z.infer<typeof VoiceRoomDetailSchema>

/* ── 念法参数 ───────────────────────────────────────────────────── */

/**
 * 「怎么念」——输入行那颗**参数**按钮管的东西。
 *
 * ⚠ 这里**没有「朗读风格」**，尽管样机上画过。原因是它和情感角标写的是同一个
 * provider 字段：`AUDIO_EMOTION` 本身就是 `AUDIO_STYLE` 的超集
 * （`{...AUDIO_STYLE, ANGRY, SAD, SURPRISED}`），而 `GenerateAudioRequest` 只有
 * 一个 `emotion`。两处 UI 改同一个值必然打架——情感归句内括号与气泡角标独占，
 * 这里只留真正正交的两项。
 *
 * ⚠ 这是**会话级设置**，不落库：它管的是「接下来生成的念法」，不是某一句的属性。
 * 单句纠错走气泡角标。重录时沿用当时的设置。
 */
export const VoiceLineDeliverySchema = z.object({
  pace: z.enum(AUDIO_PACES).optional(),
  expressiveness: z.enum(AUDIO_EXPRESSIVENESS_VALUES).optional(),
  /**
   * 用哪个语音模型。不传 = 服务端挑目录里第一个可用的（切片①的行为，
   * 也是顶栏还没选过时的状态）。
   *
   * ⚠ 只管人声。音效走的是 sfx 档，顶栏那个选择器不该也管不到它。
   */
  modelId: z.string().min(1).max(200).optional(),
})

export type VoiceLineDelivery = z.infer<typeof VoiceLineDeliverySchema>

/**
 * 念法在**会话里**的样子。
 *
 * 与请求用的 `VoiceLineDelivery` 分开写，是因为两者的「没有值」含义不同：
 * 语速与表现力在界面上永远有一个选中档（出厂是 `normal` / `auto`），而模型
 * **可以没选过**——那时要让服务端去挑目录里第一个可用的，不能塞一个假的默认值
 * 进去。用 `Required<VoiceLineDelivery>` 表达不了这个差别。
 */
export interface VoiceRoomDeliveryState {
  pace: AudioPace
  expressiveness: AudioExpressiveness
  /** null = 还没选过。 */
  modelId: string | null
}

/* ── API 请求 ───────────────────────────────────────────────────── */

export const CreateVoiceRoomRequestSchema = z.object({
  name: z.string().trim().min(1).max(VOICE_ROOM_NAME_MAX_LENGTH).optional(),
})

export type CreateVoiceRoomRequest = z.infer<
  typeof CreateVoiceRoomRequestSchema
>

/**
 * 改房间。三件事各自可选，一次可以只改一件。
 *
 * `name` 允许显式传 null——「把名字清掉，变回未命名」和「这次不改名字」是两回事。
 */
export const UpdateVoiceRoomBodySchema = z.object({
  name: z.string().trim().max(VOICE_ROOM_NAME_MAX_LENGTH).nullable().optional(),
  cast: z.array(VoiceRoomCastMemberSchema).optional(),
  bed: VoiceRoomBedSchema.nullable().optional(),
})

/** 路由层把 URL 上的 id 合进来——房间 id 不走 body，省得两处对不上。 */
export const UpdateVoiceRoomRequestSchema = UpdateVoiceRoomBodySchema.extend({
  roomId: z.string().min(1),
})

export type UpdateVoiceRoomRequest = z.infer<
  typeof UpdateVoiceRoomRequestSchema
>

/**
 * 说一句话。
 *
 * ⚠ `text` 收的是**用户原样输入**（可能带情感括号），剥离在服务端做——
 * 客户端剥一遍、服务端再剥一遍，两处规则迟早会漂。
 *
 * `emotion` 显式传时**压过**括号解析：那是气泡角标「换情感重录」走的路，
 * 用户已经明确点了档位，不该再被句子里的旧括号覆盖。
 */
export const CreateVoiceLineRequestSchema = VoiceLineDeliverySchema.extend({
  roomId: z.string().min(1),
  speakerId: z.string().min(1),
  text: z.string().trim().min(1).max(VOICE_LINE_TEXT_MAX_LENGTH),
  emotion: AudioEmotionSchema.nullable().optional(),
})

export type CreateVoiceLineRequest = z.infer<
  typeof CreateVoiceLineRequestSchema
>

/**
 * 重录一条台词——换情感，或改词。
 *
 * 重录是**覆盖** `generationId`（owner 2026-08-29 拍板：剧本视图不做，
 * 多版本取舍没有消费者）。被换下来的 Generation 不删，留在素材库里。
 */
export const RetakeVoiceLineBodySchema = VoiceLineDeliverySchema.extend({
  emotion: AudioEmotionSchema.nullable().optional(),
  text: z.string().trim().min(1).max(VOICE_LINE_TEXT_MAX_LENGTH).optional(),
})

/** 同 `UpdateVoiceRoomRequestSchema`：id 从 URL 来，不走 body。 */
export const RetakeVoiceLineRequestSchema = RetakeVoiceLineBodySchema.extend({
  lineId: z.string().min(1),
})

export type RetakeVoiceLineRequest = z.infer<
  typeof RetakeVoiceLineRequestSchema
>
