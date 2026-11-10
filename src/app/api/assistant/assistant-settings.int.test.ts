/**
 * L2a 真库：助手设置里的人设（/api/assistant/persona）与来源名单（/api/assistant/rules）。
 * 只假 Clerk 登录；服务与库全真。核库里的行与读回来的值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createDELETE,
  createGET,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_ROUTE_MODEL_AUTO,
} from '@/constants/assistant-persona'
import { ASSISTANT_PROJECT_RULE_LIMITS } from '@/constants/assistant-operator'
import {
  GET as GET_PERSONA,
  PUT as PUT_PERSONA,
} from '@/app/api/assistant/persona/route'
import {
  GET as LIST_RULES,
  POST as ADD_RULE,
} from '@/app/api/assistant/rules/route'
import { DELETE as DELETE_RULE } from '@/app/api/assistant/rules/[id]/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = {
  success: boolean
  data?: T
  errorCode?: string
  i18nKey?: string
}
type Rule = {
  id: string
  text: string
  kind: string
  scope: string | null
  source: string
}

const PERSONA_PATH = '/api/assistant/persona'
const RULES_PATH = '/api/assistant/rules'

/** `PUT` 收的是完整形状，少递一列就是 400。 */
const VALID_PERSONA = {
  name: 'Mika',
  avatarPreset: ASSISTANT_AVATAR_PRESET_IDS[0],
  avatarChoice: ASSISTANT_AVATAR_PRESET_IDS[0],
  characterCardId: null,
  nameFromCharacter: false,
  toneFromCharacter: false,
  tone: ASSISTANT_PERSONA_TONE_IDS.professional,
  toneCustom: null,
  verbosity: 'standard',
  language: 'ui',
  routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
  nextStepHint: false,
  useMyWords: true,
  memoryCapture: true,
  addressUserAs: null,
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

describe('/api/assistant/persona（真库）', () => {
  it('未登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await GET_PERSONA(createGET(PERSONA_PATH))).status).toBe(401)
    expect(
      (await PUT_PERSONA(createPUT(PERSONA_PATH, VALID_PERSONA))).status,
    ).toBe(401)
    expect(await db.assistantPersona.count()).toBe(0)
  })

  it('库里没有那一行：200 + 默认人设，也不自动建行', async () => {
    const res = await GET_PERSONA(createGET(PERSONA_PATH))
    expect(res.status).toBe(200)
    expect(await parseJSON(res)).toMatchObject({
      success: true,
      data: ASSISTANT_PERSONA_DEFAULTS,
    })
    expect(await db.assistantPersona.count()).toBe(0)
  })

  it('合法载荷落库、GET 读回；递进来的 avatarUrl 不落库', async () => {
    const res = await PUT_PERSONA(
      createPUT(PERSONA_PATH, {
        ...VALID_PERSONA,
        avatarUrl: 'https://evil.example/pic.png',
      }),
    )
    expect(res.status).toBe(200)
    expect(
      await db.assistantPersona.findUniqueOrThrow({ where: { userId: me.id } }),
    ).toMatchObject({
      name: 'Mika',
      tone: ASSISTANT_PERSONA_TONE_IDS.professional,
      routeModel: null,
      avatarUrl: null,
    })

    const read = await parseJSON<Envelope<{ name: string; tone: string }>>(
      await GET_PERSONA(createGET(PERSONA_PATH)),
    )
    expect(read.data).toMatchObject({
      name: 'Mika',
      tone: ASSISTANT_PERSONA_TONE_IDS.professional,
    })
  })

  it('词表外的语气 / custom 却没写那句话：400 不落库', async () => {
    for (const body of [
      { ...VALID_PERSONA, tone: 'sarcastic' },
      {
        ...VALID_PERSONA,
        tone: ASSISTANT_PERSONA_TONE_IDS.custom,
        toneCustom: null,
      },
    ]) {
      expect((await PUT_PERSONA(createPUT(PERSONA_PATH, body))).status).toBe(
        400,
      )
    }
    expect(await db.assistantPersona.count()).toBe(0)
  })
})

describe('/api/assistant/rules（真库）', () => {
  async function add(body: Record<string, unknown>) {
    const res = await ADD_RULE(createPOST(RULES_PATH, body))
    return { status: res.status, body: await parseJSON<Envelope<Rule>>(res) }
  }

  it('未登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await LIST_RULES(createGET(RULES_PATH))).status).toBe(401)
    expect((await add({ text: 'web', kind: 'sourceAllow' })).status).toBe(401)
    expect(await db.projectRule.count()).toBe(0)
  })

  it('来源规则：地址收成域名、记成用户自己写的；一句话 / 空 / 普通规则一律 400', async () => {
    const ok = await add({
      text: 'https://WWW.Danbooru.donmai.us/posts',
      kind: 'sourceAllow',
    })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({
      text: 'danbooru.donmai.us',
      kind: 'sourceAllow',
      source: 'creator',
    })
    expect(
      await db.projectRule.findMany({
        select: { userId: true, text: true, kind: true, source: true },
      }),
    ).toEqual([
      {
        userId: me.id,
        text: 'danbooru.donmai.us',
        kind: 'SOURCE_ALLOW',
        source: 'CREATOR',
      },
    ])

    for (const body of [
      { text: '只信官方设定集', kind: 'sourceDeny' },
      { text: '   ', kind: 'sourceDeny' },
      { text: 'Never put text inside the picture.' },
      { text: 'Never put text inside the picture.', kind: 'note' },
    ]) {
      expect((await add(body)).status).toBe(400)
    }
    expect(await db.projectRule.count()).toBe(1)
  })

  it('列表只列我的；带 scope 回该域 + 全域；词表外 scope 400', async () => {
    await db.projectRule.createMany({
      data: [
        {
          userId: me.id,
          text: 'pixiv.net',
          kind: 'SOURCE_DENY',
          source: 'CREATOR',
        },
        {
          userId: me.id,
          text: 'danbooru.donmai.us',
          kind: 'SOURCE_ALLOW',
          source: 'CREATOR',
          scope: 'image',
        },
        {
          userId: me.id,
          text: 'civitai.com',
          kind: 'SOURCE_ALLOW',
          source: 'CREATOR',
          scope: 'canvas',
        },
        {
          userId: other.id,
          text: 'other.example',
          kind: 'SOURCE_DENY',
          source: 'CREATOR',
        },
      ],
    })
    const texts = async (query?: Record<string, string>) =>
      (
        await parseJSON<Envelope<Rule[]>>(
          await LIST_RULES(createGET(RULES_PATH, query)),
        )
      )
        .data!.map((r) => r.text)
        .sort()

    expect(await texts()).toEqual([
      'civitai.com',
      'danbooru.donmai.us',
      'pixiv.net',
    ])
    expect(await texts({ scope: 'image' })).toEqual([
      'danbooru.donmai.us',
      'pixiv.net',
    ])
    expect(await texts({ scope: 'canvas' })).toEqual([
      'civitai.com',
      'pixiv.net',
    ])
    expect(
      (await LIST_RULES(createGET(RULES_PATH, { scope: 'audio' }))).status,
    ).toBe(400)
  })

  it('撞上限 409 带 i18n 键，不多建', async () => {
    await db.projectRule.createMany({
      data: Array.from(
        { length: ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser },
        (_, i) => ({
          userId: me.id,
          text: `site${i}.example`,
          kind: 'SOURCE_DENY' as const,
          source: 'CREATOR' as const,
        }),
      ),
    })
    const res = await add({ text: 'pixiv.net', kind: 'sourceDeny' })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      errorCode: 'PROJECT_RULE_LIMIT_REACHED',
      i18nKey: 'errors.projectRule.limitReached',
    })
    expect(await db.projectRule.count()).toBe(
      ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser,
    )
  })

  it('删：我的删得掉，别人的 404 不动', async () => {
    const mine = await db.projectRule.create({
      data: {
        userId: me.id,
        text: 'a.example',
        kind: 'SOURCE_DENY',
        source: 'CREATOR',
      },
    })
    const theirs = await db.projectRule.create({
      data: {
        userId: other.id,
        text: 'b.example',
        kind: 'SOURCE_DENY',
        source: 'CREATOR',
      },
    })
    const del = (id: string) =>
      DELETE_RULE(createDELETE(`${RULES_PATH}/${id}`), {
        params: Promise.resolve({ id }),
      })
    expect((await del(mine.id)).status).toBe(200)
    expect((await del(theirs.id)).status).toBe(404)
    expect((await db.projectRule.findMany()).map((r) => r.id)).toEqual([
      theirs.id,
    ])
  })
})
