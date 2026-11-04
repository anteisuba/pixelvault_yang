/**
 * L2a 真库：「用这张」重放参数（generation-replay.service）。作品、LoRA 资产、看的人全走真库；
 * 不假任何自有模块。核：谁看得到、提示词藏不藏、LoRA 能露出几个风格码。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { getReplayPayload } from '@/services/generation-replay.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

const URL_A = 'https://r2.test/a.safetensors'
const URL_B = 'https://r2.test/b.safetensors'

let owner: Awaited<ReturnType<typeof createTestUser>>
let stranger: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  owner = await createTestUser()
  stranger = await createTestUser()
})

const seed = (
  snapshot: object,
  extra: { isPublic?: boolean; isPromptPublic?: boolean } = {},
) =>
  seedGeneration(owner.id, {
    isPublic: true,
    isPromptPublic: true,
    snapshot,
    ...extra,
  })

let code = 0
function seedLora(
  userId: string,
  loraUrl: string,
  extra: { isPublic?: boolean } = {},
) {
  code += 1
  return db.loraAsset.create({
    data: {
      userId,
      loraUrl,
      name: `lora ${code}`,
      styleCode: `pv-c-test-${code}`,
      triggerWord: '',
      ...extra,
    },
  })
}

const withLoraA = { advancedParams: { loras: [{ url: URL_A, scale: 0.9 }] } }

describe('getReplayPayload（真库）', () => {
  it('没有的、私密的（游客 / 别人）回 null；主人自己看得到', async () => {
    expect(await getReplayPayload('missing', null)).toBeNull()

    const lora = await seedLora(owner.id, URL_A)
    const gen = await seed(withLoraA, { isPublic: false })
    expect(await getReplayPayload(gen.id, null)).toBeNull()
    expect(await getReplayPayload(gen.id, stranger.clerkId)).toBeNull()
    expect((await getReplayPayload(gen.id, owner.clerkId))?.styleCodes).toEqual(
      [lora.styleCode],
    )
  })

  it('没有 LoRA 的快照：空风格码，其余都空', async () => {
    const gen = await seed({})
    expect(await getReplayPayload(gen.id, null)).toEqual({
      generationId: gen.id,
      styleCodes: [],
      hasHiddenLoras: false,
      prompt: null,
      seed: null,
      negativePrompt: null,
      aspectRatio: null,
    })
  })

  it('完整快照：用户原话优先、seed、负面词、比例都读出', async () => {
    await seedLora(owner.id, URL_A, { isPublic: true })
    const gen = await seed({
      freePrompt: 'denia, c1, white dress',
      compiledPrompt: 'denia, c1, white dress, masterpiece',
      seed: 12345,
      aspectRatio: '9:16',
      advancedParams: {
        loras: [{ url: URL_A, scale: 0.9 }],
        seed: 12345,
        negativePrompt: 'worst quality, lowres',
      },
    })
    expect(await getReplayPayload(gen.id, null)).toMatchObject({
      prompt: 'denia, c1, white dress',
      seed: 12345,
      negativePrompt: 'worst quality, lowres',
      aspectRatio: '9:16',
    })
  })

  it('公开图但提示词不公开：别人和游客看不到提示词、负面词、角色排布；主人看得到', async () => {
    const gen = await seed(
      {
        freePrompt: 'secret prompt',
        advancedParams: {
          negativePrompt: 'secret negative',
          novelAiLayout: { characters: [] },
        },
      },
      { isPromptPublic: false },
    )
    const theirs = await getReplayPayload(gen.id, stranger.clerkId)
    expect(theirs).toMatchObject({ prompt: null, negativePrompt: null })
    expect(theirs).not.toHaveProperty('novelAiLayout')
    expect((await getReplayPayload(gen.id, null))?.prompt).toBeNull()

    expect(await getReplayPayload(gen.id, owner.clerkId)).toMatchObject({
      prompt: 'secret prompt',
      negativePrompt: 'secret negative',
    })
  })

  it('seed=-1 当随机（null）；旧快照退回 compiledPrompt；不认的比例给 null', async () => {
    const random = await seed({ freePrompt: 'p', seed: -1 })
    expect((await getReplayPayload(random.id, null))?.seed).toBeNull()

    const old = await seed({ compiledPrompt: 'only-the-compiled-one' })
    expect((await getReplayPayload(old.id, null))?.prompt).toBe(
      'only-the-compiled-one',
    )

    const odd = await seed({ aspectRatio: '21:9' })
    expect((await getReplayPayload(odd.id, null))?.aspectRatio).toBeNull()
  })

  it('LoRA：只露看的人能看到的（公开的或自己的），其余算「有藏着的」', async () => {
    const publicA = await seedLora(stranger.id, URL_A, { isPublic: true })
    const privateB = await seedLora(owner.id, URL_B)
    const gen = await seed({
      advancedParams: {
        loras: [
          { url: URL_A, scale: 0.9 },
          { url: URL_B, scale: 1 },
        ],
      },
    })

    expect(await getReplayPayload(gen.id, null)).toMatchObject({
      styleCodes: [publicA.styleCode],
      hasHiddenLoras: true,
    })
    expect(await getReplayPayload(gen.id, owner.clerkId)).toMatchObject({
      styleCodes: [publicA.styleCode, privateB.styleCode],
      hasHiddenLoras: false,
    })
  })

  it('快照形状不对：不抛，空风格码', async () => {
    const gen = await seed({ advancedParams: 'not-an-object' })
    expect(await getReplayPayload(gen.id, null)).toMatchObject({
      styleCodes: [],
      hasHiddenLoras: false,
    })
  })
})
