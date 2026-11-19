import { Prisma } from '@/lib/generated/prisma/client'
import {
  SPEAK_SOURCE,
  SPEAK_SOURCE_SNAPSHOT_KEY,
} from '@/constants/studio-operator-voice'

/**
 * 素材库「默认不含助手朗读」的唯一判据（11-19）：对话里 🔊 念她的回复落成的 AUDIO 行
 * （`snapshot.speakSource = 'assistant_reply'`）。列表、总数、侧栏 / 文件夹计数、助手找素材、
 * 工作台历史都从这里取，⛔ 各处另写一份。
 *
 * ⚠ 只认**带标记**的行：标记 11-19 才开始写，之前的朗读没标记、不回填、不猜 —— 照旧显示。
 * ⚠ 三值逻辑：`snapshot` 为 NULL / 没有这个键时 JSON 路径比较得 NULL，`NOT (NULL)` 仍是 NULL，
 *   整行会被**误挡掉**（真库实测：`NOT: ASSISTANT_REPLY_SPEECH_WHERE` 把所有旧音频全挡了）。
 *   所以排除写成正向的三选一：不是音频 / 没有这个键（路径 `equals: DbNull` = 路径取值 IS NULL，
 *   快照整列为 NULL 也算）/ 有这个键但不等于它。由 `speak-source-where.int.test.ts` 在真 Postgres 上锁住。
 */
export const ASSISTANT_REPLY_SPEECH_WHERE: Prisma.GenerationWhereInput = {
  outputType: 'AUDIO',
  snapshot: {
    path: [SPEAK_SOURCE_SNAPSHOT_KEY],
    equals: SPEAK_SOURCE.ASSISTANT_REPLY,
  },
}

export const EXCLUDE_ASSISTANT_REPLY_SPEECH_WHERE: Prisma.GenerationWhereInput =
  {
    OR: [
      { outputType: { not: 'AUDIO' } },
      {
        snapshot: { path: [SPEAK_SOURCE_SNAPSHOT_KEY], equals: Prisma.DbNull },
      },
      {
        snapshot: {
          path: [SPEAK_SOURCE_SNAPSHOT_KEY],
          not: SPEAK_SOURCE.ASSISTANT_REPLY,
        },
      },
    ],
  }

/** 同一判据的原生 SQL 版（`countFolderItems` 那条递归计数用）；`alias` = Generation 表别名。 */
export function excludeAssistantReplySpeechSql(alias: string): Prisma.Sql {
  const table = Prisma.raw(`"${alias}"`)
  return Prisma.sql`AND NOT (${table}."outputType" = 'AUDIO'::"OutputType" AND COALESCE(${table}."snapshot" ->> ${SPEAK_SOURCE_SNAPSHOT_KEY}, '') = ${SPEAK_SOURCE.ASSISTANT_REPLY})`
}
