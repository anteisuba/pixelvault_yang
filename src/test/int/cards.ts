import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'

/** 真库测试（L2a）里建一张角色卡。默认名「小雪」，其余字段按需覆盖。 */
export function createTestCard(
  userId: string,
  data: Partial<Omit<Prisma.CharacterCardUncheckedCreateInput, 'userId'>> = {},
) {
  return db.characterCard.create({
    data: { userId, name: '小雪', ...data },
  })
}

/** 真库测试里建一张图（只填必填列）。 */
export function createTestGeneration(
  userId: string | null,
  data: Partial<Omit<Prisma.GenerationUncheckedCreateInput, 'userId'>> = {},
) {
  return db.generation.create({
    data: {
      userId,
      url: 'https://cdn.test/image.png',
      storageKey: 'image.png',
      prompt: 'p',
      model: 'm',
      provider: 'p',
      ...data,
    },
  })
}
