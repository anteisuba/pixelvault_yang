import { Prisma, PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

import { MODEL_OPTIONS } from '@/constants/models'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// The ModelConfig table is seeded directly from the canonical catalog in
// `src/constants/models` (the same source the runtime uses). Previously this
// file hand-copied an inline MODEL_OPTIONS array, which drifted badly out of
// sync — by the 2026-06 slimdown it still listed deleted models (minimax-video,
// luma-ray-2, sora-2, sdxl, flux-2-dev …) and was missing new ones
// (happyhorse-1.0, ltx-2.3, flux-2-flash). Importing the constant keeps the DB
// authoritative with zero manual upkeep. `sortOrder` follows array order, which
// is already preference-ranked.
async function main() {
  console.log(
    `Seeding ModelConfig from src/constants/models (${MODEL_OPTIONS.length} models)…`,
  )

  const seededIds: string[] = []

  for (let i = 0; i < MODEL_OPTIONS.length; i++) {
    const model = MODEL_OPTIONS[i]
    seededIds.push(model.id)

    const data = {
      externalModelId: model.externalModelId,
      adapterType: model.adapterType,
      outputType: model.outputType,
      cost: model.cost,
      available: model.available,
      officialUrl: model.officialUrl ?? null,
      timeoutMs: model.timeoutMs ?? null,
      qualityTier: model.qualityTier ?? null,
      i2vModelId: model.i2vModelId ?? null,
      videoDefaults: (model.videoDefaults ?? undefined) as unknown as
        | Prisma.InputJsonValue
        | undefined,
      providerConfig: model.providerConfig as unknown as Prisma.InputJsonValue,
      sortOrder: i,
    }

    await db.modelConfig.upsert({
      where: { modelId: model.id },
      update: data,
      create: { modelId: model.id, ...data },
    })

    console.log(`  ✓ ${model.id}`)
  }

  // Purge rows for models no longer in the catalog (e.g. the slimmed-out video
  // models) so a re-seed never resurrects a dead model in the DB.
  const removed = await db.modelConfig.deleteMany({
    where: { modelId: { notIn: seededIds } },
  })
  if (removed.count > 0) {
    console.log(`\nRemoved ${removed.count} stale model config(s).`)
  }

  console.log(`\nSeeded ${MODEL_OPTIONS.length} model configs.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
