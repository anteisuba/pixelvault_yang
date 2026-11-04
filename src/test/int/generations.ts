import { randomUUID } from 'node:crypto'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * 真库测试（L2a）里建一张出好的图：必填列给默认值，其余按用例覆盖。
 * ⚠ url 默认带随机串，同一个人建几张也不会撞。
 */
export async function createTestGeneration(
  userId: string,
  overrides: Partial<Prisma.GenerationUncheckedCreateInput> = {},
) {
  const tag = randomUUID().slice(0, 8)
  return db.generation.create({
    data: {
      userId,
      url: `https://cdn.test/${tag}.png`,
      storageKey: `${tag}.png`,
      prompt: 'a test picture',
      model: 'flux',
      provider: 'fal',
      ...overrides,
    },
  })
}

/** 建一个素材库文件夹，可选把几张图放进去。 */
export async function createTestFolder(
  userId: string,
  name: string,
  options: { parentId?: string; generationIds?: string[] } = {},
) {
  const folder = await db.project.create({
    data: { userId, name, parentId: options.parentId ?? null },
  })
  if (options.generationIds?.length) {
    await db.projectItem.createMany({
      data: options.generationIds.map((generationId) => ({
        projectId: folder.id,
        generationId,
      })),
    })
  }
  return folder
}
