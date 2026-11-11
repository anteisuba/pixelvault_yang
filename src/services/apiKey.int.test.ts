/**
 * L2a 真库：用户 API key（apiKey.service）。key 真加密入库、真解密；只假 provider 网络（fetch）。
 * 核库里那一行、列表不露 key、验证时发给各家的请求与结果。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { API_KEY_MASK } from '@/constants/api-keys'
import {
  ADAPTER_CUSTOM_MODEL_EXAMPLES,
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { decryptApiKey, encryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'
import {
  createApiKey,
  listUserApiKeys,
  updateApiKey,
  verifyApiKey,
} from '@/services/apiKey.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

const net = vi.hoisted(() => ({
  respond: (): Response | Promise<Response> => new Response(null),
  calls: [] as Array<{ url: string; init: RequestInit }>,
}))

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  net.calls = []
  net.respond = () => new Response(null, { status: 200 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      net.calls.push({
        url: String(input instanceof Request ? input.url : input),
        init: init ?? {},
      })
      return net.respond()
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

let day = 0
function seedKey(
  plain: string,
  extra: Partial<{
    userId: string
    adapterType: string
    modelId: string
    providerConfig: Record<string, string>
    encryptedKey: string
  }> = {},
) {
  day += 1
  return db.userApiKey.create({
    data: {
      userId: me.id,
      adapterType: AI_ADAPTER_TYPES.FAL,
      modelId: `fal-model-${day}`,
      providerConfig: { label: 'fal.ai', baseUrl: 'https://queue.fal.run' },
      label: 'Key',
      encryptedKey: encryptApiKey(plain),
      maskedKey: 'fal_****test',
      createdAt: new Date(Date.UTC(2026, 0, 1 + day)),
      ...extra,
    },
  })
}

const FISH_CONFIG = { label: 'Fish Audio', baseUrl: 'https://api.fish.audio' }

describe('createApiKey（真库）', () => {
  it('同一模型再存一次：更新那一行而不是撞唯一约束；库里是密文', async () => {
    const save = (key: string) =>
      createApiKey(
        me.id,
        'fish-audio-s2-pro',
        AI_ADAPTER_TYPES.FISH_AUDIO,
        FISH_CONFIG,
        'Fish Audio',
        key,
      )
    const first = await save('fish-api-key-1234')
    const second = await save('fish-api-key-5678')

    expect(second).toEqual({
      id: first.id,
      modelId: 'fish-audio-s2-pro',
      adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
      providerConfig: FISH_CONFIG,
      label: 'Fish Audio',
      maskedKey: API_KEY_MASK,
      isActive: true,
      isDefault: false,
      createdAt: first.createdAt,
    })
    const rows = await db.userApiKey.findMany({ where: { userId: me.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].encryptedKey).not.toContain('fish-api-key')
    expect(decryptApiKey(rows[0].encryptedKey)).toBe('fish-api-key-5678')
  })
})

describe('字节 key：保存时认站（真库，假网络）', () => {
  const saveArk = () =>
    createApiKey(
      me.id,
      ADAPTER_CUSTOM_MODEL_EXAMPLES[AI_ADAPTER_TYPES.VOLCENGINE],
      AI_ADAPTER_TYPES.VOLCENGINE,
      getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
      '字节',
      'ark-test-key-1234',
    )

  it('国内站通：存成火山', async () => {
    const saved = await saveArk()
    expect(saved.adapterType).toBe(AI_ADAPTER_TYPES.VOLCENGINE)
    expect(net.calls.map((call) => call.url)).toEqual([
      `${getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE).baseUrl}/models`,
    ])
  })

  it('国内站不认、海外站通：存成 BytePlus，地址与样例型号跟着换', async () => {
    net.respond = () => {
      const last = net.calls.at(-1)?.url ?? ''
      return new Response(null, {
        status: last.includes('volces.com') ? 401 : 200,
      })
    }
    const saved = await saveArk()
    expect(saved).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
      modelId: ADAPTER_CUSTOM_MODEL_EXAMPLES[AI_ADAPTER_TYPES.BYTEPLUS],
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    })
  })

  it('两站都不通：照提交的那站存，留给验证报失败', async () => {
    net.respond = () => new Response(null, { status: 401 })
    const saved = await saveArk()
    expect(saved.adapterType).toBe(AI_ADAPTER_TYPES.VOLCENGINE)
  })
})

describe('updateApiKey：设为默认（真库）', () => {
  it('字节两站算一组：设一把为默认，另一站的旧默认清掉；别家的默认不动', async () => {
    const cn = await seedKey('ark-cn-key-1234', {
      adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    })
    const intl = await seedKey('ark-intl-key-1234', {
      adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    })
    const fal = await seedKey('fal-key-1234')
    await db.userApiKey.updateMany({
      where: { id: { in: [cn.id, fal.id] } },
      data: { isDefault: true },
    })

    const updated = await updateApiKey(intl.id, me.id, { isDefault: true })

    expect(updated.isDefault).toBe(true)
    const rows = await db.userApiKey.findMany({
      where: { userId: me.id },
      select: { id: true, isDefault: true },
    })
    expect(Object.fromEntries(rows.map((r) => [r.id, r.isDefault]))).toEqual({
      [cn.id]: false,
      [intl.id]: true,
      [fal.id]: true,
    })
  })

  it('别人的 key：拒绝，不改任何标记', async () => {
    const mine = await seedKey('ark-cn-key-1234', {
      adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    })
    await expect(
      updateApiKey(mine.id, other.id, { isDefault: true }),
    ).rejects.toThrow()
    const row = await db.userApiKey.findUnique({ where: { id: mine.id } })
    expect(row?.isDefault).toBe(false)
  })
})

describe('verifyApiKey（真库，假网络）', () => {
  const headersOf = (i = 0) =>
    Object.fromEntries(new Headers(net.calls[i].init.headers).entries())

  it.each([200, 401, 403, 404, 429])(
    'Ideogram：走不计费的 dry run，HTTP %s 只有 200 算可用',
    async (status) => {
      const key = await seedKey('test-ideogram-key', {
        modelId: 'ideogram-4.5',
        adapterType: AI_ADAPTER_TYPES.IDEOGRAM,
        providerConfig: {
          label: 'Ideogram',
          baseUrl: 'https://api.ideogram.ai',
        },
      })
      net.respond = () => new Response(null, { status })
      expect((await verifyApiKey(key.id, me.id)).status).toBe(
        status === 200 ? 'available' : 'failed',
      )
      expect(net.calls).toHaveLength(1)
      expect(net.calls[0].url).toBe(
        'https://api.ideogram.ai/v2/image/generate/ideogram-4-5?dry_run=true',
      )
      expect(net.calls[0].init.method).toBe('POST')
      expect(headersOf()['api-key']).toBe('test-ideogram-key')
    },
  )

  it('FAL：队列根 404 也算 key 可用；请求带解密后的 key', async () => {
    const key = await seedKey('plain-fal-key')
    net.respond = () => new Response(null, { status: 404 })
    expect(await verifyApiKey(key.id, me.id)).toMatchObject({
      id: key.id,
      status: 'available',
    })
    expect(net.calls[0]).toMatchObject({
      url: 'https://queue.fal.run',
      init: { method: 'GET' },
    })
    expect(headersOf().authorization).toBe('Key plain-fal-key')
  })

  it('FAL：网络抛错算失败，带上错误', async () => {
    const key = await seedKey('plain-fal-key')
    net.respond = () => {
      throw new TypeError('fetch failed')
    }
    expect(await verifyApiKey(key.id, me.id)).toMatchObject({
      id: key.id,
      status: 'failed',
      error: 'fetch failed',
    })
  })

  it('Runway：查一个不存在的任务，带当前 API 版本', async () => {
    const key = await seedKey('plain-runway-key', {
      modelId: 'runway-gen4.5',
      adapterType: AI_ADAPTER_TYPES.RUNWAY,
      providerConfig: {
        label: 'Runway',
        baseUrl: 'https://api.dev.runwayml.com/v1',
      },
    })
    net.respond = () =>
      Response.json({ error: 'The task does not exist' }, { status: 404 })
    expect((await verifyApiKey(key.id, me.id)).status).toBe('available')
    expect(net.calls[0].url).toBe(
      'https://api.dev.runwayml.com/v1/tasks/00000000-0000-4000-8000-000000000000',
    )
    expect(headersOf()).toMatchObject({
      authorization: 'Bearer plain-runway-key',
      'x-runway-version': '2024-11-06',
    })
  })

  it('DeepSeek：查模型列表，不跟跳转', async () => {
    const key = await seedKey('plain-deepseek-key', {
      modelId: 'deepseek-v4-pro',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
    })
    net.respond = () =>
      Response.json({
        object: 'list',
        data: [{ id: 'deepseek-v4-pro', object: 'model' }],
      })
    expect((await verifyApiKey(key.id, me.id)).status).toBe('available')
    expect(net.calls[0]).toMatchObject({
      url: 'https://api.deepseek.com/models',
      init: { method: 'GET', redirect: 'manual' },
    })
    expect(headersOf().authorization).toBe('Bearer plain-deepseek-key')
  })

  it('Anthropic：查模型列表，带版本 / workspace / key 头', async () => {
    const key = await seedKey('plain-anthropic-key', {
      modelId: 'claude-opus-5-5',
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      providerConfig: {
        label: 'Claude',
        baseUrl: 'https://api.anthropic.com/v1',
        anthropicWorkspaceId: 'wrkspc_test',
      },
    })
    net.respond = () =>
      Response.json({
        data: [{ id: 'claude-opus-5-5', type: 'model' }],
        has_more: false,
      })
    expect((await verifyApiKey(key.id, me.id)).status).toBe('available')
    expect(net.calls[0].url).toBe('https://api.anthropic.com/v1/models')
    expect(headersOf()).toMatchObject({
      'anthropic-version': '2023-06-01',
      'anthropic-workspace-id': 'wrkspc_test',
      'x-api-key': 'plain-anthropic-key',
    })
  })

  it('别人的 key：不验证、不发请求', async () => {
    const theirs = await seedKey('their-key', { userId: other.id })
    await expect(verifyApiKey(theirs.id, me.id)).rejects.toThrow()
    expect(net.calls).toHaveLength(0)
  })
})

describe('listUserApiKeys（真库）', () => {
  it('同一把 key、同一个地址的归成一组；不露 key、不丢路线；只列我的', async () => {
    await seedKey('secret-one')
    const second = await seedKey('secret-one') // 同一把 key，换个模型（密文不同）
    const different = await seedKey('secret-two')
    const endpoint = await seedKey('secret-one', {
      providerConfig: { label: 'fal.ai', baseUrl: 'https://other.example' },
    })
    await seedKey('secret-one', { userId: other.id })

    const result = await listUserApiKeys(me.id)
    // 新的在前；一组用组里最新那把的 id
    expect(result.map((r) => r.credentialGroupId)).toEqual([
      endpoint.id,
      different.id,
      second.id,
      second.id,
    ])
    expect(result.every((r) => r.maskedKey === API_KEY_MASK)).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(
      /secret-one|secret-two|encryptedKey|fal_\*\*\*\*test/,
    )
  })

  it('解不开的 key 各自一组', async () => {
    const good = await seedKey('secret-one')
    const broken = await seedKey('x', { encryptedKey: 'not-a-ciphertext' })
    expect(
      (await listUserApiKeys(me.id)).map((r) => r.credentialGroupId),
    ).toEqual([broken.id, good.id])
  })
})
