#!/usr/bin/env node
/**
 * 迁移预演：从生产库开一个即用即弃的 Neon 分支，把**还没应用的迁移**在上面真跑
 * 一遍，然后删掉分支。
 *
 *   node prisma/preflight-migrations.mjs
 *   node prisma/preflight-migrations.mjs --parent production --keep
 *
 * ⚠ 放在 `prisma/` 而不是 `scripts/`，是因为 `.claude/settings.json` 的 deny 规则
 *   挡着 `Write(scripts/**)` 与 `Write(package.json)`。要挪去 `scripts/` 并加一个
 *   `npm run preflight:migrations` 别名，得人工来。位置本身也说得通：它和
 *   `migration-safety.test.ts` / `migrations/` 是一套东西。
 *
 * ## 为什么需要它
 *
 * `ci.yml` 的「从零重建数据库」是在**空库**上跑迁移历史 —— 没有存量数据，唯一
 * 索引 / NOT NULL / 外键 / 列类型转换怎么都成功。**绿色的 CI 在约束型迁移上不
 * 构成证据。**
 *
 * ⚠ 而本仓 `.env.local` 指向的就是 Vercel 用的那个生产库（2026-08-22 由构建日志
 * 确认是 `ep-flat-violet-…`）。也就是说 `prisma migrate dev` 在开发机上跑 = 直接
 * 改生产 schema，中间没有任何缓冲。这个脚本就是那个缓冲。
 *
 * ⚠ `.env.production.local` **不是**生产库（它指向 `ep-solitary-dew-…`，落后好几
 * 条迁移、数据也对不上）。别拿它当生产查 —— 2026-08-22 已经有人栽在这个名字上，
 * 据此得出过「生产有重复行、部署会炸」的错误结论。
 *
 * ## 需要的环境变量（放 .env.local，它已被 gitignore）
 *
 *   NEON_API_KEY     —— Neon 控制台 → Account settings → API keys
 *   NEON_PROJECT_ID  —— 项目 Settings → General
 *
 * ## 边界（别把它当万能）
 *
 * · 分支是写时复制的**快照**，不是实时镜像。开分支之后生产新写入的数据不在里面。
 * · 它验的是「这些迁移能不能在这份数据上跑通」，不验「跑通之后应用还对不对」。
 * · 数据量小的分支上看不出长时间锁表这类问题。
 *
 * ⚠ **本脚本尚未在真实 NEON_API_KEY 下跑通过**（2026-08-22 写就时手上没有 key）。
 *   第一次用如果炸了，大概率在建分支的 API 形状或就绪等待上，不在迁移本身。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import pg from 'pg'

const API = 'https://console.neon.tech/api/v2'
const BRANCH_TTL_MS = 60 * 60 * 1000
const READY_TIMEOUT_MS = 90_000

function readEnvFiles() {
  const found = {}
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && found[m[1]] === undefined) {
        found[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  return found
}

const fileEnv = readEnvFiles()
const apiKey = process.env.NEON_API_KEY ?? fileEnv.NEON_API_KEY
const projectId = process.env.NEON_PROJECT_ID ?? fileEnv.NEON_PROJECT_ID

if (!apiKey || !projectId) {
  console.error(
    '缺少 NEON_API_KEY / NEON_PROJECT_ID。加进 .env.local：\n' +
      '  NEON_API_KEY=neon_api_key_...\n' +
      '  NEON_PROJECT_ID=...\n' +
      'API key 在 Neon 控制台 Account settings → API keys；project id 在项目 Settings → General。',
  )
  process.exit(2)
}

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const parentIdx = args.indexOf('--parent')
const parent = parentIdx >= 0 ? args[parentIdx + 1] : undefined

async function neon(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `Neon API ${init.method ?? 'GET'} ${path} → ${response.status}: ${text}`,
    )
  }
  return text ? JSON.parse(text) : {}
}

/** 等到真的连得上再交给 prisma —— 新分支的 endpoint 要几秒才起来。 */
async function waitUntilConnectable(uri) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError
  while (Date.now() < deadline) {
    const client = new pg.Client({
      connectionString: uri,
      ssl: { rejectUnauthorized: false },
    })
    try {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      return
    } catch (error) {
      lastError = error
      await client.end().catch(() => {})
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw new Error(
    `分支建好了但连不上（${READY_TIMEOUT_MS / 1000}s 超时）：${lastError?.message}`,
  )
}

let branchId
try {
  // 解析父分支：给了名字就查 id，没给就用项目默认分支。
  let parentId
  if (parent) {
    const { branches } = await neon(`/projects/${projectId}/branches`)
    const hit = branches.find((b) => b.id === parent || b.name === parent)
    if (!hit) {
      throw new Error(
        `找不到父分支 ${parent}。现有分支：${branches
          .map((b) => `${b.name}(${b.id})`)
          .join(', ')}`,
      )
    }
    parentId = hit.id
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const created = await neon(`/projects/${projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      branch: {
        name: `preflight-${stamp}`,
        ...(parentId ? { parent_id: parentId } : {}),
        // 兜底：脚本被 Ctrl-C 掉、或删分支那步失败时，分支自己过期，
        // 不至于把免费档 10 个分支的额度慢慢占满。
        expires_at: new Date(Date.now() + BRANCH_TTL_MS).toISOString(),
      },
      endpoints: [{ type: 'read_write' }],
    }),
  })

  branchId = created.branch?.id
  const uri = created.connection_uris?.[0]?.connection_uri
  if (!branchId || !uri) {
    throw new Error(
      `建分支的响应里没有 branch.id / connection_uri：${JSON.stringify(created).slice(0, 400)}`,
    )
  }

  console.log(
    `分支: ${created.branch.name} (${branchId})，父: ${created.branch.parent_id ?? '默认分支'}`,
  )
  console.log('等 endpoint 就绪…')
  await waitUntilConnectable(uri)

  console.log('\n── prisma migrate deploy ──')
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy'],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: uri, DIRECT_URL: uri },
    },
  )

  if (result.status === 0) {
    console.log('\n✅ 待跑的迁移在生产数据的副本上全部通过。')
  } else {
    console.error(
      `\n❌ migrate deploy 退出码 ${result.status} —— 这些迁移直接打生产会失败。\n` +
        '   先补数据修复（形状参考 prisma/migrations/20260821210441_dedupe_lora_assets），\n' +
        '   再重跑本脚本。',
    )
  }
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(`\n预演失败: ${error.message}`)
  process.exitCode = 1
} finally {
  if (branchId && !keep) {
    try {
      await neon(`/projects/${projectId}/branches/${branchId}`, {
        method: 'DELETE',
      })
      console.log(`已删除分支 ${branchId}`)
    } catch (error) {
      console.error(
        `⚠ 删分支失败（${error.message}）。它带 expires_at，1 小时后会自己消失；` +
          '急的话去 Neon 控制台手删。',
      )
    }
  } else if (branchId) {
    console.log(`--keep：保留分支 ${branchId}（1 小时后自动过期）`)
  }
}
