/**
 * One-time migration script: Replace old r2.dev public URLs with new CDN domain.
 *
 * Usage: npx tsx scripts/migrate-r2-urls.ts [--dry-run]
 *
 * This updates ALL URL columns in the database that contain the old r2.dev domain.
 */

import { PrismaClient } from '../src/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const OLD_DOMAIN = 'https://pub-5346558f8dc549f9ba5217489fe5395e.r2.dev'
const NEW_DOMAIN =
  process.env.NEXT_PUBLIC_STORAGE_BASE_URL || 'https://cdn.anteisuba.com'

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const isDryRun = process.argv.includes('--dry-run')

interface MigrationTask {
  table: string
  columns: string[]
}

// All tables and columns that store R2 URLs
const TASKS: MigrationTask[] = [
  { table: 'User', columns: ['avatarUrl', 'bannerUrl'] },
  { table: 'Generation', columns: ['url', 'referenceImageUrl'] },
  { table: 'ImageAnalysis', columns: ['sourceImageUrl'] },
  { table: 'CharacterCard', columns: ['sourceImageUrl'] },
  { table: 'BackgroundCard', columns: ['sourceImageUrl'] },
  { table: 'StyleCard', columns: ['coverUrl'] },
  { table: 'VideoGeneration', columns: ['finalVideoUrl', 'referenceImageUrl'] },
  {
    table: 'VideoClip',
    columns: ['videoUrl', 'lastFrameUrl', 'inputVideoUrl', 'inputFrameUrl'],
  },
  { table: 'LoraTrainingJob', columns: ['loraUrl'] },
]

async function migrateTable(task: MigrationTask) {
  let totalUpdated = 0

  for (const column of task.columns) {
    try {
      // Use raw SQL for efficient bulk update
      const sql = `UPDATE "${task.table}" SET "${column}" = REPLACE("${column}", '${OLD_DOMAIN}', '${NEW_DOMAIN}') WHERE "${column}" LIKE '${OLD_DOMAIN}%'`

      if (isDryRun) {
        const countSql = `SELECT COUNT(*) as count FROM "${task.table}" WHERE "${column}" LIKE '${OLD_DOMAIN}%'`
        const result =
          await prisma.$queryRawUnsafe<[{ count: bigint }]>(countSql)
        const count = Number(result[0].count)
        if (count > 0) {
          console.log(
            `  [DRY RUN] ${task.table}.${column}: ${count} rows to update`,
          )
        }
        totalUpdated += count
      } else {
        const result = await prisma.$executeRawUnsafe(sql)
        if (result > 0) {
          console.log(`  ✅ ${task.table}.${column}: ${result} rows updated`)
        }
        totalUpdated += result
      }
    } catch {
      console.log(`  ⚠️  ${task.table}.${column}: column not found, skipping`)
    }
  }

  return totalUpdated
}

// Also migrate JSON fields that contain URLs (e.g., CharacterCard.loras, StyleCard.advancedParams)
async function migrateJsonFields() {
  let totalUpdated = 0

  // CharacterCard.loras is a JSON array like [{url: "...", scale: 1}]
  const charCards = await prisma.$queryRawUnsafe<
    { id: string; loras: unknown }[]
  >(
    `SELECT id, loras FROM "CharacterCard" WHERE loras::text LIKE '%${OLD_DOMAIN}%'`,
  )
  for (const card of charCards) {
    if (!Array.isArray(card.loras)) continue
    const updated = (card.loras as Array<{ url: string; scale?: number }>).map(
      (lora) => ({
        ...lora,
        url: lora.url.replace(OLD_DOMAIN, NEW_DOMAIN),
      }),
    )
    if (isDryRun) {
      console.log(
        `  [DRY RUN] CharacterCard.loras (id=${card.id.slice(0, 8)}): will update`,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "CharacterCard" SET loras = $1::jsonb WHERE id = $2`,
        JSON.stringify(updated),
        card.id,
      )
      console.log(
        `  ✅ CharacterCard.loras (id=${card.id.slice(0, 8)}): updated`,
      )
    }
    totalUpdated++
  }

  return totalUpdated
}

async function main() {
  console.log(`\n📦 R2 URL Migration: ${OLD_DOMAIN} → ${NEW_DOMAIN}`)
  console.log(isDryRun ? '🔍 DRY RUN MODE (no changes)\n' : '🚀 LIVE MODE\n')

  let grandTotal = 0

  for (const task of TASKS) {
    const count = await migrateTable(task)
    grandTotal += count
  }

  // JSON fields
  const jsonCount = await migrateJsonFields()
  grandTotal += jsonCount

  console.log(
    `\n${isDryRun ? '🔍 Would update' : '✅ Updated'} ${grandTotal} total rows`,
  )
  console.log(
    isDryRun ? '\nRun without --dry-run to apply changes.\n' : '\nDone!\n',
  )
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
