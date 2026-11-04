/**
 * L2a 真库：LoRA 资产（可见性、我的库 + 旧收藏自愈回填、按引用找、训练完建行、
 * 改封面 / 公开、收藏 / 取消收藏 / 删）。
 * 只假边界：Civitai 的 model-versions 接口那一跳（fetch）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { LORA_CIVITAI_BACKFILL_MAX_PER_REQUEST } from '@/constants/lora'
import {
  deleteOwnedLoraAsset,
  ensureLoraAssetFromTrainingJob,
  favoriteExternalLora,
  findLoraAssetByExtraReference,
  findLoraAssetsByUrls,
  generateStyleCode,
  getLoraAssetByStyleCode,
  listDiscoverLoraAssets,
  listLoraAssetsForUser,
  setLoraAssetVisibility,
  unfavoriteLora,
  updateLoraAssetCover,
} from '@/features/lora/services/lora-asset.service'
import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

const STORAGE_BASE = 'https://cdn.test'
const CIVITAI_VERSIONS = 'https://civitai.com/api/v1/model-versions/'

let owner: Awaited<ReturnType<typeof createTestUser>>
let viewer: Awaited<ReturnType<typeof createTestUser>>
/** versionId → Civitai 回的详情；没登记的回 404。 */
let civitaiVersions: Map<number, unknown>
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (!url.startsWith(CIVITAI_VERSIONS)) throw new Error(`不该联网：${url}`)
  const payload = civitaiVersions.get(
    Number(url.slice(CIVITAI_VERSIONS.length)),
  )
  return payload
    ? Response.json(payload)
    : new Response('{"error":"not found"}', { status: 404 })
})

beforeEach(async () => {
  civitaiVersions = new Map()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', STORAGE_BASE)
  await resetDatabase()
  owner = await createTestUser()
  viewer = await createTestUser()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

let seq = 0
function seed(data: Record<string, unknown> = {}) {
  seq += 1
  return db.loraAsset.create({
    data: {
      userId: owner.id,
      name: 'Forest',
      styleCode: `pv-c-forest-${seq}`,
      source: 'trained',
      triggerWord: 'pv_forest',
      loraUrl: `https://r2.example.com/forest-${seq}.safetensors`,
      ...data,
    },
  })
}

const row = (id: string) => db.loraAsset.findUnique({ where: { id } })

describe('generateStyleCode', () => {
  it('produces URL-safe codes with kind prefix and random suffix', () => {
    // The slug is truncated to 24 chars, so "studio-ghibli-soft-pastels" loses "ls"
    const code = generateStyleCode('Studio Ghibli soft pastels', 'style')
    expect(code).toMatch(/^pv-s-studio-ghibli-soft-paste-[a-f0-9]{4}$/)
  })

  it('falls back to "lora" when the name has no slug-able characters', () => {
    expect(generateStyleCode('!!!', 'subject')).toMatch(
      /^pv-c-lora-[a-f0-9]{4}$/,
    )
  })

  it('different invocations yield different suffixes', () => {
    expect(generateStyleCode('x', 'subject')).not.toBe(
      generateStyleCode('x', 'subject'),
    )
  })
})

describe('getLoraAssetByStyleCode', () => {
  it('returns null when the code does not exist', async () => {
    await expect(getLoraAssetByStyleCode('missing', null)).resolves.toBeNull()
  })

  it('returns curated/public assets to anonymous viewers', async () => {
    const curated = await seed({
      userId: null,
      source: 'curated',
      isPublic: true,
    })
    const result = await getLoraAssetByStyleCode(curated.styleCode, null)
    expect(result).toMatchObject({ isOwn: false, isPublic: true })
  })

  it('returns private assets to their owner, hides them from others', async () => {
    const mine = await seed()
    await expect(
      getLoraAssetByStyleCode(mine.styleCode, owner.clerkId),
    ).resolves.toMatchObject({ id: mine.id, isOwn: true })
    await expect(
      getLoraAssetByStyleCode(mine.styleCode, viewer.clerkId),
    ).resolves.toBeNull()
  })
})

describe('listLoraAssetsForUser', () => {
  it('returns owned library assets first, then curated; character-only rows stay out', async () => {
    const older = await seed({
      name: 'Mine B',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    const newer = await seed({
      name: 'Mine A',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    })
    await seed({ source: 'imported', inLibrary: false })
    await seed({ userId: viewer.id })
    const curated = await seed({
      userId: null,
      source: 'curated',
      isPublic: true,
    })

    const result = await listLoraAssetsForUser(owner.clerkId)

    expect(result.map((r) => r.id)).toEqual([newer.id, older.id, curated.id])
    expect(result.map((r) => r.isOwn)).toEqual([true, true, false])
    // Non-civitai rows never trigger the backfill fetch.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('heals legacy civitai favorites missing identifiers from loraUrl', async () => {
    const legacy = await seed({
      source: 'imported',
      provider: 'civitai',
      loraUrl: 'https://civitai.com/api/download/models/135867',
    })
    civitaiVersions.set(135867, {
      id: 135867,
      name: 'v1',
      modelId: 122359,
      files: [
        { primary: true, type: 'Model', hashes: { AutoV3: '9C783C8CE46C' } },
      ],
      images: [
        { url: 'https://image.civitai.com/x/abc/cover.jpeg', nsfwLevel: 1 },
      ],
    })

    const result = await listLoraAssetsForUser(owner.clerkId)

    expect(result[0]).toMatchObject({
      modelId: 122359,
      modelVersionId: 135867,
      fileHashAutoV3: '9c783c8ce46c',
    })
    expect(await row(legacy.id)).toMatchObject({
      civitaiModelId: 122359,
      civitaiModelVersionId: 135867,
      civitaiFileHashAutoV3: '9c783c8ce46c',
      coverImageUrl: expect.stringContaining('image.civitai.com'),
    })
  })

  it('keeps a user-set cover and tolerates backfill failure', async () => {
    const withCover = await seed({
      source: 'imported',
      provider: 'civitai',
      loraUrl: 'https://civitai.com/api/download/models/111',
      coverImageUrl: `${STORAGE_BASE}/custom-cover.png`,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    })
    const failing = await seed({
      source: 'imported',
      provider: 'civitai',
      loraUrl: 'https://civitai.com/api/download/models/222',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    civitaiVersions.set(111, {
      id: 111,
      name: 'v1',
      modelId: 1,
      files: [
        { primary: true, type: 'Model', hashes: { AutoV3: 'AABBCCDDEEFF' } },
      ],
      images: [
        { url: 'https://image.civitai.com/x/new/cover.jpeg', nsfwLevel: 1 },
      ],
    })
    // 222 没登记 → Civitai 404。

    const result = await listLoraAssetsForUser(owner.clerkId)

    expect((await row(withCover.id))?.coverImageUrl).toBe(
      `${STORAGE_BASE}/custom-cover.png`,
    )
    expect((await row(withCover.id))?.civitaiModelId).toBe(1)
    // 失败行原样返回，不阻塞列表
    expect(result.map((r) => r.id)).toEqual([withCover.id, failing.id])
    expect(result[1]?.modelId).toBeUndefined()
    expect((await row(failing.id))?.civitaiModelId).toBeNull()
  })

  it('caps backfill fetches per request', async () => {
    for (let i = 0; i < 5; i += 1) {
      await seed({
        source: 'imported',
        provider: 'civitai',
        loraUrl: `https://civitai.com/api/download/models/${1000 + i}`,
      })
    }

    await listLoraAssetsForUser(owner.clerkId)

    const asked = new Set(fetchMock.mock.calls.map(([input]) => String(input)))
    expect(asked.size).toBe(LORA_CIVITAI_BACKFILL_MAX_PER_REQUEST)
  })
})

describe('findLoraAssetByExtraReference', () => {
  it('finds a local asset by hash, then versionId, then normalized name', async () => {
    const byHash = await seed({ civitaiFileHashAutoV3: 'aabbccddeeff' })
    const byVersion = await seed({ civitaiModelVersionId: 77 })
    await seed({ name: 'Something Else' })
    await seed({ name: 'Enchanting Eyes (Detailed Eyes)' })
    const byName = await seed({ name: 'EnchantingEyes Illustrious' })

    await expect(
      findLoraAssetByExtraReference(owner.clerkId, { hash: 'AABBCCDDEEFF' }),
    ).resolves.toMatchObject({ id: byHash.id })
    await expect(
      findLoraAssetByExtraReference(owner.clerkId, { modelVersionId: 77 }),
    ).resolves.toMatchObject({ id: byVersion.id })
    // 不全等 → 不命中
    await expect(
      findLoraAssetByExtraReference(owner.clerkId, {
        name: 'enchanting-eyes details eyes',
      }),
    ).resolves.toBeNull()
    await expect(
      findLoraAssetByExtraReference(owner.clerkId, {
        name: 'enchanting_eyes-illustrious',
      }),
    ).resolves.toMatchObject({ id: byName.id })
  })

  it('only matches rows the viewer can see; signed-out only public ones', async () => {
    await seed({ civitaiFileHashAutoV3: 'aabbccddeeff' })

    await expect(
      findLoraAssetByExtraReference(null, { hash: 'aabbccddeeff' }),
    ).resolves.toBeNull()
    await expect(
      findLoraAssetByExtraReference(viewer.clerkId, { hash: 'aabbccddeeff' }),
    ).resolves.toBeNull()

    const shared = await seed({
      civitaiFileHashAutoV3: 'aabbccddeeff',
      isPublic: true,
    })
    await expect(
      findLoraAssetByExtraReference(null, { hash: 'aabbccddeeff' }),
    ).resolves.toMatchObject({ id: shared.id })
  })
})

describe('findLoraAssetsByUrls', () => {
  it('returns empty when no URLs provided', async () => {
    await expect(findLoraAssetsByUrls([], null)).resolves.toEqual([])
  })

  it('preserves the input URL order in the output', async () => {
    const b = await seed({ isPublic: true })
    const a = await seed({ isPublic: true })
    const result = await findLoraAssetsByUrls([a.loraUrl, b.loraUrl], null)
    expect(result.map((r) => r.id)).toEqual([a.id, b.id])
  })

  it("prefers the viewer's own copy over a public copy on URL collision", async () => {
    const url = 'https://x/shared.safetensors'
    await seed({ userId: null, loraUrl: url, isPublic: true })
    const mine = await seed({ loraUrl: url })
    const result = await findLoraAssetsByUrls([url], owner.id)
    expect(result.map((r) => r.id)).toEqual([mine.id])
  })

  it('skips URLs the viewer cannot see', async () => {
    const hidden = await seed()
    await expect(
      findLoraAssetsByUrls([hidden.loraUrl], viewer.id),
    ).resolves.toEqual([])
  })
})

describe('ensureLoraAssetFromTrainingJob', () => {
  function job(data: Record<string, unknown> = {}) {
    return db.loraTrainingJob.create({
      data: {
        userId: owner.id,
        name: 'Forest',
        triggerWord: 'pv_forest',
        loraType: 'subject',
        baseModel: 'flux-dev-fal',
        status: 'COMPLETED',
        loraUrl: 'https://r2.example.com/x.safetensors',
        trainingImageKeys: [],
        ...data,
      },
    })
  }
  const assetOf = (jobId: string) =>
    db.loraAsset.findUnique({
      where: { trainingJobId: jobId },
      include: { characterLinks: true },
    })

  it('no-ops when the job is not completed', async () => {
    const training = await job({ status: 'TRAINING', loraUrl: null })
    await ensureLoraAssetFromTrainingJob(training.id)
    expect(await db.loraAsset.count()).toBe(0)
  })

  it('no-ops when an asset already exists for the job', async () => {
    const done = await job()
    await seed({ trainingJobId: done.id })
    await ensureLoraAssetFromTrainingJob(done.id)
    expect(await db.loraAsset.count()).toBe(1)
  })

  it('creates an asset for a completed job that has none', async () => {
    const done = await job({
      loraStorageKey: 'lora-weights/owner/job_1.safetensors',
      trainingImageKeys: [
        'lora-training/owner/1-0.png',
        'lora-training/owner/1-1.png',
        'lora-training/owner/1-2.png',
      ],
    })

    await ensureLoraAssetFromTrainingJob(done.id)

    const asset = await assetOf(done.id)
    expect(asset).toMatchObject({
      userId: owner.id,
      name: 'Forest',
      source: 'trained',
      type: 'subject',
      // flux-dev-fal → flux family，存 Civitai 显示名
      baseModelFamily: 'Flux.1 D',
      provider: 'fal',
      triggerWord: 'pv_forest',
      loraUrl: 'https://r2.example.com/x.safetensors',
      // First training image becomes the default cover; full list seeds the
      // preview gallery on the LoRA library card.
      coverImageUrl: `${STORAGE_BASE}/lora-training/owner/1-0.png`,
      previewImageUrls: [
        `${STORAGE_BASE}/lora-training/owner/1-0.png`,
        `${STORAGE_BASE}/lora-training/owner/1-1.png`,
        `${STORAGE_BASE}/lora-training/owner/1-2.png`,
      ],
    })
    expect(asset?.styleCode).toMatch(/^pv-c-forest-[a-f0-9]{4}$/)
    // 没带角色的训练不建关联
    expect(asset?.characterLinks).toEqual([])
  })

  it('从角色发起的训练：训完自动收进她的 LoRA（角色③）', async () => {
    const card = await createTestCard(owner.id, { name: 'Denia' })
    const done = await job({ name: 'Denia', characterCardId: card.id })

    await ensureLoraAssetFromTrainingJob(done.id)

    expect((await assetOf(done.id))?.characterLinks).toEqual([
      expect.objectContaining({ characterCardId: card.id }),
    ])
  })

  it('maps SDXL-family trainer base models to the sdxl bucket', async () => {
    const done = await job({
      name: 'IllustriousChar',
      baseModel: 'illustrious-xl',
      trainingImageKeys: ['lora-training/owner/2-0.png'],
    })

    await ensureLoraAssetFromTrainingJob(done.id)

    // illustrious-xl doesn't end with '-fal', so falls through to replicate.
    expect(await assetOf(done.id)).toMatchObject({
      baseModelFamily: 'SDXL 1.0',
      provider: 'replicate',
    })
  })

  it('tolerates jobs without trainingImageKeys (cover/preview empty)', async () => {
    const done = await job({ baseModel: 'flux-dev' })
    await ensureLoraAssetFromTrainingJob(done.id)
    expect(await assetOf(done.id)).toMatchObject({
      coverImageUrl: null,
      previewImageUrls: [],
    })
  })
})

describe('updateLoraAssetCover', () => {
  const newCover = `${STORAGE_BASE}/lora-training/owner/new-cover.png`

  it('updates cover when the caller is the owner and url is owned', async () => {
    const asset = await seed()
    const result = await updateLoraAssetCover(owner.clerkId, asset.id, newCover)
    expect(result?.coverImageUrl).toBe(newCover)
    expect((await row(asset.id))?.coverImageUrl).toBe(newCover)
  })

  it('returns null when the asset does not exist', async () => {
    await expect(
      updateLoraAssetCover(owner.clerkId, 'missing', newCover),
    ).resolves.toBeNull()
  })

  it('throws when the caller does not own the asset', async () => {
    const asset = await seed()
    await expect(
      updateLoraAssetCover(viewer.clerkId, asset.id, newCover),
    ).rejects.toThrow(/Not authorized/)
    expect((await row(asset.id))?.coverImageUrl).toBeNull()
  })

  it('rejects covers hosted outside our storage bucket', async () => {
    const asset = await seed()
    await expect(
      updateLoraAssetCover(
        owner.clerkId,
        asset.id,
        'https://attacker.example.com/x.png',
      ),
    ).rejects.toThrow(/storage bucket/)
    expect((await row(asset.id))?.coverImageUrl).toBeNull()
  })
})

describe('listDiscoverLoraAssets', () => {
  it('public trained LoRAs only; signed-in viewers do not see their own', async () => {
    const mine = await seed({ isPublic: true })
    const theirs = await seed({ userId: viewer.id, isPublic: true })
    await seed({ userId: viewer.id })
    await seed({ userId: viewer.id, isPublic: true, source: 'imported' })

    const signedIn = await listDiscoverLoraAssets(owner.clerkId)
    expect(signedIn.map((r) => r.id)).toEqual([theirs.id])

    const anonymous = await listDiscoverLoraAssets(null)
    expect(anonymous.map((r) => r.id).sort()).toEqual(
      [mine.id, theirs.id].sort(),
    )
  })
})

describe('setLoraAssetVisibility', () => {
  it('returns null when the asset does not exist', async () => {
    await expect(
      setLoraAssetVisibility(owner.clerkId, 'missing', true),
    ).resolves.toBeNull()
  })

  it('throws when caller is not the owner', async () => {
    const asset = await seed()
    await expect(
      setLoraAssetVisibility(viewer.clerkId, asset.id, true),
    ).rejects.toThrow(/authorized/i)
    expect((await row(asset.id))?.isPublic).toBe(false)
  })

  it('flips isPublic and returns the updated record for the owner', async () => {
    const asset = await seed()
    const result = await setLoraAssetVisibility(owner.clerkId, asset.id, true)
    expect(result).toMatchObject({ isPublic: true, isOwn: true })
    expect((await row(asset.id))?.isPublic).toBe(true)
  })
})

describe('favoriteExternalLora', () => {
  const civitaiInput = {
    name: 'Anima Phoebe',
    triggerWord: 'phoebe_anima',
    loraUrl: 'https://civitai.com/api/download/12345',
    type: 'subject' as const,
    baseModelFamily: 'flux',
    provider: 'fal',
    coverImageUrl: 'https://image.civitai.com/cover.png',
  }
  const mine = () => db.loraAsset.findMany({ where: { userId: owner.id } })

  it('creates an imported asset on first favorite', async () => {
    const result = await favoriteExternalLora(owner.clerkId, civitaiInput)

    expect(await mine()).toEqual([
      expect.objectContaining({
        id: result.id,
        source: 'imported',
        type: 'subject',
        provider: 'fal',
        loraUrl: civitaiInput.loraUrl,
        coverImageUrl: civitaiInput.coverImageUrl,
        isPublic: false,
        inLibrary: true,
        // 没给快照：列留空（Prisma Json 不收顶层 null，键整个省掉）。
        sourceSnapshot: null,
      }),
    ])
    expect(result.isOwn).toBe(true)
  })

  it('收藏一个只被角色收着的 LoRA：同一行收进库，不另建', async () => {
    const linked = await seed({
      source: 'imported',
      inLibrary: false,
      loraUrl: civitaiInput.loraUrl,
    })

    const result = await favoriteExternalLora(owner.clerkId, civitaiInput)

    expect(result.id).toBe(linked.id)
    expect(await mine()).toEqual([
      expect.objectContaining({ id: linked.id, inLibrary: true }),
    ])
  })

  it('同一个 Civitai 版本换了种下载地址（带不带 fileId）：认版本号，不另建一条', async () => {
    const existing = await seed({
      source: 'imported',
      loraUrl: 'https://civitai.com/api/download/models/2?fileId=9',
      civitaiModelVersionId: 2,
    })

    const result = await favoriteExternalLora(owner.clerkId, {
      ...civitaiInput,
      loraUrl: 'https://civitai.com/api/download/models/2',
      modelVersionId: 2,
    })

    expect(result.id).toBe(existing.id)
    expect(await mine()).toHaveLength(1)
  })

  it('并发双击撞唯一约束时返回既有行，而不是把 500 甩给用户', async () => {
    const [first, second] = await Promise.all([
      favoriteExternalLora(owner.clerkId, civitaiInput),
      favoriteExternalLora(owner.clerkId, civitaiInput),
    ])

    expect(second.id).toBe(first.id)
    expect(second.isOwn).toBe(true)
    expect(await mine()).toHaveLength(1)
  })

  it('persists Civitai provenance so source-match survives a reload', async () => {
    const result = await favoriteExternalLora(owner.clerkId, {
      ...civitaiInput,
      recommendedPrompt: 'phoebe_anima, red dress',
      modelId: 12345,
      modelVersionId: 67890,
      fileHashAutoV3: 'abcdef123456',
    })

    expect(await row(result.id)).toMatchObject({
      recommendedPrompt: 'phoebe_anima, red dress',
      civitaiModelId: 12345,
      civitaiModelVersionId: 67890,
      civitaiFileHashAutoV3: 'abcdef123456',
    })
    expect(result).toMatchObject({
      modelId: 12345,
      modelVersionId: 67890,
      fileHashAutoV3: 'abcdef123456',
      recommendedPrompt: 'phoebe_anima, red dress',
    })
  })

  // ⭐ HF 导入的行在四个 civitai 字段上**全是 null，而且那是对的** ——
  //    `sourceSnapshot` 才是作者 / 许可 / revision 的落点。
  const HF_SNAPSHOT = {
    source: 'huggingface' as const,
    author: 'WRATHGODDESS',
    license: {
      label: 'apache-2.0',
      commercialUse: null,
      allowDerivatives: null,
      allowNoCredit: null,
      known: true,
    },
    pageUrl: 'https://huggingface.co/WRATHGODDESS/Shino_Style_Anima',
    revision: '19963ef82b6f0b899800e6ce4202d58fbf89e60e',
    retrievedAt: '2026-08-21T09:00:00.000Z',
    fileSizeBytes: 223_000_000,
    metadataCompleteness: 'partial' as const,
  }

  it('writes the source snapshot, so a Hugging Face row is no longer provenance-blank', async () => {
    const result = await favoriteExternalLora(owner.clerkId, {
      ...civitaiInput,
      provider: 'huggingface',
      loraUrl:
        'https://huggingface.co/WRATHGODDESS/Shino_Style_Anima/resolve/19963ef8/ShinoAnimaV3.safetensors',
      sourceSnapshot: HF_SNAPSHOT,
    })

    expect(await row(result.id)).toMatchObject({
      sourceSnapshot: HF_SNAPSHOT,
      civitaiModelId: null,
      civitaiModelVersionId: null,
      civitaiFileHashAutoV3: null,
    })
    expect(result.sourceSnapshot).toEqual(HF_SNAPSHOT)
  })

  it('treats an unreadable snapshot column as absent instead of throwing', async () => {
    // Json 列没有类型保证，旧行/脏行不该把整份列表打成 500。
    await seed({
      source: 'imported',
      loraUrl: civitaiInput.loraUrl,
      sourceSnapshot: 42,
    })
    const result = await favoriteExternalLora(owner.clerkId, civitaiInput)
    expect(result.sourceSnapshot).toBeNull()
  })

  it('is idempotent — returns existing row without creating a duplicate', async () => {
    const existing = await seed({
      source: 'imported',
      loraUrl: civitaiInput.loraUrl,
    })
    const result = await favoriteExternalLora(owner.clerkId, civitaiInput)
    expect(result.id).toBe(existing.id)
    expect(await mine()).toHaveLength(1)
  })
})

describe('unfavoriteLora', () => {
  it('returns false when the asset does not exist', async () => {
    await expect(unfavoriteLora(owner.clerkId, 'missing')).resolves.toBe(false)
  })

  it('refuses to delete a non-imported asset (no nuking trained LoRAs)', async () => {
    const trained = await seed()
    await expect(unfavoriteLora(owner.clerkId, trained.id)).rejects.toThrow(
      /imported/i,
    )
    expect(await row(trained.id)).not.toBeNull()
  })

  it('deletes an imported favorite owned by the caller', async () => {
    const fav = await seed({ source: 'imported' })
    await expect(unfavoriteLora(owner.clerkId, fav.id)).resolves.toBe(true)
    expect(await row(fav.id)).toBeNull()
  })

  it('还被角色收着：只移出库，不删行（角色里照旧）', async () => {
    const fav = await seed({ source: 'imported' })
    const card = await createTestCard(owner.id)
    await db.characterCardLora.create({
      data: { characterCardId: card.id, loraAssetId: fav.id },
    })

    await expect(unfavoriteLora(owner.clerkId, fav.id)).resolves.toBe(true)

    expect((await row(fav.id))?.inLibrary).toBe(false)
    expect(await db.characterCardLora.count()).toBe(1)
  })
})

describe('deleteOwnedLoraAsset', () => {
  it('returns false when the asset does not exist or belongs to another user', async () => {
    await expect(deleteOwnedLoraAsset(owner.clerkId, 'missing')).resolves.toBe(
      false,
    )
    const theirs = await seed({ userId: viewer.id })
    await expect(deleteOwnedLoraAsset(owner.clerkId, theirs.id)).resolves.toBe(
      false,
    )
    expect(await row(theirs.id)).not.toBeNull()
  })

  it('refuses to delete a curated platform asset or an imported favorite', async () => {
    const curated = await seed({ source: 'curated' })
    const imported = await seed({ source: 'imported' })
    for (const asset of [curated, imported]) {
      await expect(
        deleteOwnedLoraAsset(owner.clerkId, asset.id),
      ).rejects.toThrow(/self-trained/i)
    }
    expect(await db.loraAsset.count()).toBe(2)
  })

  it('deletes a trained asset owned by the caller', async () => {
    const trained = await seed()
    await expect(deleteOwnedLoraAsset(owner.clerkId, trained.id)).resolves.toBe(
      true,
    )
    expect(await row(trained.id)).toBeNull()
  })
})
