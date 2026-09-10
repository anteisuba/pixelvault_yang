/**
 * 容器内的 ffmpeg 执行器（S9）。
 *
 * Worker 一步一个 HTTP 请求过来，这里 spawn 一次 ffmpeg。**每一步都幂等**：
 * 产物文件已经在就直接回 `{ reused: true }`，不重跑。这就是「断点续传」的下半句 ——
 * 上半句是 Workflow 的步缓存（已完成的步不会再执行），下半句是同一个容器实例被
 * 复用时**中间件还在盘上**。
 *
 * ⛔ 这里不认识「时间线」：它只收已经算好的命令参数。所有「这条片子长什么样」的
 * 算术都在 `src/lib/filtergraph.ts` 那一侧做完，于是它可以被逐字断言测试。
 */

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, stat, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const WORK_DIR = process.env.RENDER_WORK_DIR || '/work'
const PORT = Number(process.env.PORT || 8080)

/** 正在跑的 ffmpeg 进程，按 jobId 存 —— 取消要能找到它。 */
const running = new Map()

async function exists(path) {
  try {
    const info = await stat(path)
    return info.size > 0
  } catch {
    return false
  }
}

function jobDir(jobId) {
  // ⚠ jobId 进路径前先洗一遍：worker 是可信的，但一个 `../` 能把 /work 之外的
  // 东西写掉，而这条防线的成本是一行。
  const safe = String(jobId).replace(/[^A-Za-z0-9_-]/g, '')
  if (!safe) throw new Error('invalid jobId')
  return join(WORK_DIR, safe)
}

async function runFfmpeg(jobId, args, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    running.set(jobId, child)
    let stderr = ''
    child.stdout.on('data', (chunk) => onProgress?.(chunk.toString()))
    child.stderr.on('data', (chunk) => {
      // ⚠ 只留尾巴：ffmpeg 的 stderr 能有几 MB，整条塞进回调会撑爆载荷。
      stderr = (stderr + chunk.toString()).slice(-4000)
    })
    child.on('error', (error) => {
      running.delete(jobId)
      reject(error)
    })
    child.on('close', (code, signal) => {
      running.delete(jobId)
      if (code === 0) resolve({ stderr })
      else
        reject(
          new Error(
            `ffmpeg exited ${code}${signal ? ` (${signal})` : ''}: ${stderr}`,
          ),
        )
    })
  })
}

async function download(url, dest) {
  if (await exists(dest)) return { reused: true }
  await mkdir(dirname(dest), { recursive: true })
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`download failed (${response.status}) for ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
  return { reused: false }
}

function json(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

const routes = {
  '/health': async () => ({ ok: true }),

  /** 拉素材。`{ jobId, url, name }` → `/work/<jobId>/src/<name>`。 */
  '/download': async (body) => {
    const dest = join(jobDir(body.jobId), 'src', body.name)
    const result = await download(body.url, dest)
    return { path: dest, ...result }
  },

  /** 规格化一段。`{ jobId, args, dest }` —— args 由 worker 侧生成器给出。 */
  '/run': async (body) => {
    if (body.dest && (await exists(body.dest))) {
      return { path: body.dest, reused: true }
    }
    if (body.dest) await mkdir(dirname(body.dest), { recursive: true })
    let progress = ''
    await runFfmpeg(body.jobId, body.args, (chunk) => {
      progress = chunk
    })
    return { path: body.dest ?? null, reused: false, progress }
  },

  /** 取消：给这个 job 正在跑的 ffmpeg 一刀。 */
  '/cancel': async (body) => {
    const child = running.get(body.jobId)
    if (child) child.kill('SIGKILL')
    return { cancelled: Boolean(child) }
  },

  /** 收尾：把 job 的整个工作目录删掉（成片已经上了 R2）。 */
  '/cleanup': async (body) => {
    await rm(jobDir(body.jobId), { recursive: true, force: true })
    return { ok: true }
  },
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://container')

  // 产物取回：worker 用它把成片流进 R2（容器自己没有 R2 绑定）。
  if (request.method === 'GET' && url.pathname === '/file') {
    const path = url.searchParams.get('path')
    if (!path || !path.startsWith(WORK_DIR)) {
      json(response, 400, { error: 'bad path' })
      return
    }
    readFile(path)
      .then((buffer) => {
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': buffer.length,
        })
        response.end(buffer)
      })
      .catch((error) => json(response, 404, { error: String(error) }))
    return
  }

  const handler = routes[url.pathname]
  if (!handler) {
    json(response, 404, { error: 'not found' })
    return
  }
  if (request.method !== 'POST' && url.pathname !== '/health') {
    json(response, 405, { error: 'method not allowed' })
    return
  }

  readJson(request)
    .then((body) => handler(body))
    .then((result) => json(response, 200, result))
    .catch((error) =>
      json(response, 500, { error: String(error?.message ?? error) }),
    )
})

server.listen(PORT, () => {
  console.log(`[render-video] container listening on ${PORT}`)
})
