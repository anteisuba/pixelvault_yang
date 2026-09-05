import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import worker from './index.ts'

const url = 'https://img.anteisuba.com/bucket/uuid/original=true/141692835.jpeg'
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

afterEach(() => mock.restoreAll())

function setup(body, contentType) {
  const stored = []
  const pending = []
  mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(body, {
        headers: contentType ? { 'Content-Type': contentType } : {},
      }),
  )
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        match: async () => undefined,
        put: async (_key, response) =>
          stored.push({
            type: response.headers.get('content-type'),
            body: Buffer.from(await response.arrayBuffer()),
          }),
      },
    },
  })
  return {
    stored,
    pending,
    ctx: { waitUntil: (promise) => pending.push(promise) },
  }
}

for (const contentType of [
  'binary/octet-stream',
  'application/octet-stream',
  null,
]) {
  test(`serves original PNG bytes despite ${contentType} and a JPEG URL`, async () => {
    const { ctx, pending, stored } = setup(png, contentType)
    const response = await worker.fetch(new Request(url), {}, ctx)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
    await Promise.all(pending)
    assert.deepEqual(stored, [{ type: 'image/png', body: png }])
  })
}

test('recognizes a signature split across stream chunks without losing bytes', async () => {
  const body = new ReadableStream({
    start(controller) {
      for (const byte of png) controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  })
  const { ctx, pending } = setup(body, 'binary/octet-stream')
  const response = await worker.fetch(new Request(url), {}, ctx)
  assert.equal(response.status, 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  await Promise.all(pending)
})

for (const contentType of ['binary/octet-stream', 'text/html']) {
  test(`rejects non-image ${contentType} without caching`, async () => {
    const { ctx, pending, stored } = setup('<html>error</html>', contentType)
    const response = await worker.fetch(new Request(url), {}, ctx)
    assert.equal(response.status, 415)
    await Promise.all(pending)
    assert.equal(stored.length, 0)
  })
}

test('preserves correctly typed images', async () => {
  const { ctx, pending } = setup(png, 'image/png')
  const response = await worker.fetch(new Request(url), {}, ctx)
  assert.equal(response.status, 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  await Promise.all(pending)
})

for (const [type, hex] of [
  ['image/jpeg', 'ffd8ffe000104a4649460001'],
  ['image/gif', '47494638396101000100'],
  ['image/webp', '52494646c2a900005745425056503820'],
  ['image/avif', '00000020667479706176696600000000'],
]) {
  test(`recognizes binary ${type} by bytes`, async () => {
    const bytes = Buffer.from(hex, 'hex')
    const { ctx, pending } = setup(bytes, 'application/octet-stream')
    const response = await worker.fetch(new Request(url), {}, ctx)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), type)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
    await Promise.all(pending)
  })
}
