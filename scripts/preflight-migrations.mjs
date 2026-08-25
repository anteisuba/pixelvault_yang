#!/usr/bin/env node
/**
 * 迁移预演：从生产库开一个即用即弃的 Neon 分支，把**还没应用的迁移**在上面真跑
 * 一遍，然后删掉分支。
 *
 *   npm run preflight:migrations           # 父分支从 DATABASE_URL 反推
 *   npm run preflight:migrations -- --keep # 保留分支自己进去看
 *
 * ⛔ **别用 `--parent production`。** 本项目里 Neon 的分支名是反的——叫
 * `production` 的那个是 `.env.production.local` 指的**陈旧库**（而且它还是
 * Neon 的默认分支），运行时真正连的库挂在叫 `development` 的分支上。在陈旧库
 * 上预演会绿，但那个绿与生产无关。不传 `--parent` 才是对的。
 *
 * 闸门的另一半是 `prisma/migration-safety.test.ts`（自动，进 pre-push 的全量
 * vitest）。那条拦的是「你忘了想这件事」，这条验的是「想了，且在真实数据上成立」。
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
  // 解析父分支。
  //
  // ⛔ **绝不按分支名认，也绝不用 Neon 的「默认分支」。** 本项目里这两条都会
  // 把你带到错的库上（2026-08-25 实测）：叫 `production` 的分支挂的是
  // `ep-solitary-dew-…`，即 `.env.production.local` 指向的那个**陈旧库**，而且
  // 它正好是 Neon 的默认分支；Vercel 生产运行时真正连的 `ep-flat-violet-…`
  // 反而挂在叫 `development` 的分支上。名字是反的。
  //
  // 在陈旧库上跑预演比不跑更糟：它会绿，而那个绿与生产无关。所以默认行为改成
  // 从 `DATABASE_URL` 反推——运行时连哪个库，就在哪个库的副本上预演。
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
    console.warn(
      `⚠ 用 --parent 指定了 ${hit.name}(${hit.id})，跳过了「从 DATABASE_URL 反推」。` +
        '确认这真是运行时在连的那个库，否则预演结果不作数。',
    )
  } else {
    const runtimeUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL
    if (!runtimeUrl) {
      throw new Error(
        '没有 DATABASE_URL，无法反推该在哪个分支上预演。' +
          '要么配上，要么显式 --parent <分支>（自负其责）。',
      )
    }
    // ep-flat-violet-aifhen7l-pooler.c-4.us-east-1.aws.neon.tech → ep-flat-violet-aifhen7l
    const endpointId = new URL(runtimeUrl).hostname
      .split('.')[0]
      .replace(/-pooler$/, '')
    const { endpoints } = await neon(`/projects/${projectId}/endpoints`)
    const hit = endpoints.find((e) => e.id === endpointId)
    if (!hit) {
      throw new Error(
        `DATABASE_URL 指向的 endpoint ${endpointId} 不在本项目里。` +
          `现有 endpoint：${endpoints.map((e) => e.id).join(', ')}`,
      )
    }
    parentId = hit.branch_id
    const { branches } = await neon(`/projects/${projectId}/branches`)
    const branch = branches.find((b) => b.id === parentId)
    console.log(
      `父分支从 DATABASE_URL 反推：${endpointId} → ${branch?.name ?? '?'}(${parentId})`,
    )
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
      // ⚠ Windows 必须带 shell。Node ≥18.20.2 的 CVE-2024-27980 缓解禁止不经
      // shell 直接起 .cmd/.bat，`spawnSync('npx.cmd', …)` 会当场 EINVAL、
      // status 为 null，而且因为进程压根没起来，stdio:'inherit' 一个字都不输出。
      shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: uri, DIRECT_URL: uri },
    },
  )

  // ⚠ 先分「没能执行」和「执行了但失败」。混为一谈会把一次 spawn 失败播报成
  // 「这些迁移直接打生产会失败」——那是假警报，会把人骗去改根本没问题的数据。
  if (result.error) {
    console.error(
      `\n❌ 起不来 prisma：${result.error.code ?? ''} ${result.error.message}\n` +
        '   这是**没能执行**，不是迁移失败 —— 别据此去修数据。',
    )
    process.exitCode = 1
  } else if (result.status === 0) {
    console.log('\n✅ 待跑的迁移在生产数据的副本上全部通过。')
    process.exitCode = 0
  } else {
    console.error(
      `\n❌ migrate deploy 退出码 ${result.status} —— 这些迁移直接打生产会失败。\n` +
        '   先补数据修复（形状参考 prisma/migrations/20260821210441_dedupe_lora_assets），\n' +
        '   再重跑本脚本。',
    )
    process.exitCode = result.status ?? 1
  }
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
