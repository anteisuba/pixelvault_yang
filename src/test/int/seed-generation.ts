import { randomUUID } from 'node:crypto'

import type { Prisma } from '@/lib/generated/prisma/client'
import { db } from '@/lib/db'

/**
 * 真库测试（L2a）里落一行作品：只填必填格，其余按 `overrides` 给。
 * 地址与对象键按 id 片段生成，互不撞。
 */
export async function seedGeneration(
  userId: string | null,
  overrides: Partial<Prisma.GenerationUncheckedCreateInput> = {},
) {
  const tag = randomUUID().slice(0, 8)
  return db.generation.create({
    data: {
      userId,
      url: `https://cdn.test/generations/${tag}.png`,
      storageKey: `generations/${tag}.png`,
      prompt: `prompt ${tag}`,
      model: 'test-model',
      provider: 'test-provider',
      ...overrides,
    },
  })
}
