#!/usr/bin/env node
/**
 * 刷新 fal 契约样本（o-worker 第 7 步「各家契约测试」）。
 *
 * 从 fal 官方 OpenAPI（每个模型一份）里取 Output 的官方示例值，拼成一份「结果返回」
 * 存进 src/providers/fal/contract-fixtures/<endpoint>.json，契约测试拿它喂解析代码。
 * fal 改了返回字段（比如 3D 从 model_mesh 换成 model_glb），重跑这个脚本、再跑测试就红。
 *
 * 用法（在 workers/execution 下）：node scripts/refresh-fal-contracts.mjs
 * 不需要 key：OpenAPI 是公开的。
 *
 * 以后有了真实返回，直接把对应文件的 `output` 换成真实的、`source` 改成 `recorded` 即可。
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')
const outDir = join(here, '../src/providers/fal/contract-fixtures')

// Worker 实际会派给 fal 的模型：从 Next 的模型表里取（出图 / 视频 / 3D）。
const MODEL_FILES = [
  'src/constants/models/image.ts',
  'src/constants/models/video.ts',
  'src/constants/models/model-3d.ts',
]

async function listEndpoints() {
  const ids = new Set()
  for (const file of MODEL_FILES) {
    const text = await readFile(join(repoRoot, file), 'utf8')
    for (const match of text.matchAll(
      /externalModelId:\s*'((?:fal-ai|bytedance)\/[^']+)'/g,
    )) {
      ids.add(match[1])
    }
  }
  // 参考图编辑会把文生图换成对应的 edit 端点（fal/image.ts 的映射表）。
  const falImage = await readFile(
    join(here, '../src/providers/fal/image.ts'),
    'utf8',
  )
  for (const match of falImage.matchAll(/'((?:fal-ai|bytedance)\/[^']+)'/g)) {
    ids.add(match[1])
  }
  return [...ids].sort()
}

function resolveRef(schemas, node) {
  if (node?.$ref) return schemas[node.$ref.split('/').pop()]
  const ref = node?.anyOf?.find((item) => item.$ref)
  return ref ? schemas[ref.$ref.split('/').pop()] : node
}

function exampleFor(schemas, node, depth = 0) {
  if (!node || depth > 4) return undefined
  if (node.examples?.length) return node.examples[0]
  const resolved = resolveRef(schemas, node)
  if (resolved !== node) return exampleFor(schemas, resolved, depth + 1)
  if (node.type === 'object' || node.properties) {
    const out = {}
    for (const [key, prop] of Object.entries(node.properties ?? {})) {
      const value = exampleFor(schemas, prop, depth + 1)
      if (value !== undefined) out[key] = value
    }
    return out
  }
  if (node.type === 'array' && node.items) {
    const item = exampleFor(schemas, node.items, depth + 1)
    return item === undefined ? [] : [item]
  }
  if (node.type === 'integer' || node.type === 'number') return 1
  if (node.type === 'boolean') return false
  if (node.type === 'string') return 'example'
  return undefined
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const endpoints = await listEndpoints()
  const written = []
  for (const endpointId of endpoints) {
    const url = `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${endpointId}`
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`skip ${endpointId}: HTTP ${response.status}`)
      continue
    }
    const spec = await response.json().catch(() => null)
    const schemas = spec?.components?.schemas
    const outputName =
      schemas && Object.keys(schemas).find((name) => name.endsWith('Output'))
    if (!outputName) {
      console.warn(`skip ${endpointId}: no Output schema`)
      continue
    }
    const output = exampleFor(schemas, schemas[outputName])
    const fixture = {
      endpointId,
      source: 'official-openapi-example',
      sourceUrl: url,
      fetchedAt: new Date().toISOString().slice(0, 10),
      requiredOutputFields: schemas[outputName].required ?? [],
      output,
    }
    const file = `${endpointId.replaceAll('/', '__')}.json`
    await writeFile(join(outDir, file), `${JSON.stringify(fixture, null, 2)}\n`)
    written.push(file)
  }
  const existing = await readdir(outDir)
  const stale = existing.filter(
    (file) => file.endsWith('.json') && !written.includes(file),
  )
  console.log(`wrote ${written.length} fixtures`)
  if (stale.length) console.log(`not refreshed: ${stale.join(', ')}`)
}

await main()
