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

// ── 热链那一支（`/hotlink/<host>/<path>`，助手找图 2026-10-15）──────────────

function setupHotlink(responses) {
  const calls = []
  const queue = [...responses]
  mock.method(globalThis, 'fetch', async (input, init) => {
    calls.push({ url: String(input), init })
    return (
      queue.shift() ??
      new Response(png, { headers: { 'Content-Type': 'image/png' } })
    )
  })
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: { match: async () => undefined, put: async () => {} } },
  })
  const pending = []
  return {
    calls,
    ctx: { waitUntil: (promise) => pending.push(promise) },
    pending,
  }
}

// 面板打这一支时 `referrerPolicy="origin"`：默认带上自家源站。
const OWN_PAGE = { Referer: 'https://www.anteisuba.com/' }
const hotlink = (path, headers = OWN_PAGE) =>
  new Request(`https://img.anteisuba.com/hotlink/${path}`, { headers })

test('hotlink: fetches the allow-listed host with that site’s own Referer', async () => {
  const { calls, ctx, pending } = setupHotlink([])
  const response = await worker.fetch(
    hotlink('i.pximg.net/img-master/img/2020/01/01/x_p0.jpg'),
    {},
    ctx,
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(calls.length, 1)
  assert.equal(
    calls[0].url,
    'https://i.pximg.net/img-master/img/2020/01/01/x_p0.jpg',
  )
  assert.equal(calls[0].init.headers.Referer, 'https://www.pixiv.net/')
  assert.equal(calls[0].init.redirect, 'manual')
  await Promise.all(pending)
})

test('hotlink: bilibili and weibo hosts get their own Referer', async () => {
  for (const [path, referer] of [
    ['i0.hdslb.com/bfs/archive/a.jpg@672w.webp', 'https://www.bilibili.com/'],
    ['wx1.sinaimg.cn/large/b.jpg', 'https://weibo.com/'],
  ]) {
    const { calls, ctx } = setupHotlink([])
    const response = await worker.fetch(hotlink(path), {}, ctx)
    assert.equal(response.status, 200)
    assert.equal(calls[0].url, `https://${path}`)
    assert.equal(calls[0].init.headers.Referer, referer)
    mock.restoreAll()
  }
})

for (const path of [
  'evil.com/x.jpg',
  'i.pximg.net.evil.com/x.jpg',
  'evilpximg.net/x.jpg',
  'i.pximg.net:8443/x.jpg',
  'user@i.pximg.net/x.jpg',
  'i.pximg.net',
  'i.pximg.net/',
]) {
  test(`hotlink: ⛔ not an open proxy — ${path} is 404 and never fetched`, async () => {
    const { calls, ctx } = setupHotlink([])
    const response = await worker.fetch(hotlink(path), {}, ctx)
    assert.equal(response.status, 404)
    assert.equal(calls.length, 0)
  })
}

test('hotlink: another website embedding us with its Referer is refused', async () => {
  const { calls, ctx } = setupHotlink([])
  const response = await worker.fetch(
    hotlink('i.pximg.net/x.jpg', { Referer: 'https://freeloader.example/' }),
    {},
    ctx,
  )
  assert.equal(response.status, 403)
  assert.equal(calls.length, 0)
})

test('hotlink: our own pages are served', async () => {
  for (const headers of [
    { Referer: 'https://www.anteisuba.com/en/studio' },
    { Origin: 'https://www.anteisuba.com' },
  ]) {
    const { ctx } = setupHotlink([])
    const response = await worker.fetch(
      hotlink('i.pximg.net/x.jpg', headers),
      {},
      ctx,
    )
    assert.equal(response.status, 200)
    mock.restoreAll()
  }
})

test('hotlink: no Referer and no Origin → 403, nothing fetched', async () => {
  const { calls, ctx } = setupHotlink([])
  const response = await worker.fetch(hotlink('i.pximg.net/x.jpg', {}), {}, ctx)
  assert.equal(response.status, 403)
  assert.equal(calls.length, 0)
  mock.restoreAll()
})

test('hotlink: follows a redirect inside the allow-list only', async () => {
  const { calls, ctx } = setupHotlink([
    new Response(null, {
      status: 302,
      headers: { Location: 'https://i1.hdslb.com/bfs/moved.jpg' },
    }),
  ])
  const response = await worker.fetch(
    hotlink('i0.hdslb.com/bfs/a.jpg'),
    {},
    ctx,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://i0.hdslb.com/bfs/a.jpg', 'https://i1.hdslb.com/bfs/moved.jpg'],
  )
})

test('hotlink: ⛔ a redirect off the allow-list is a 502, not followed', async () => {
  const { calls, ctx } = setupHotlink([
    new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.example/payload' },
    }),
  ])
  const response = await worker.fetch(
    hotlink('i0.hdslb.com/bfs/a.jpg'),
    {},
    ctx,
  )
  assert.equal(response.status, 502)
  assert.equal(calls.length, 1)
})

test('hotlink: a page that is not an image is refused (415)', async () => {
  const { ctx } = setupHotlink([
    new Response('<html>login</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  ])
  const response = await worker.fetch(hotlink('i.pximg.net/x.jpg'), {}, ctx)
  assert.equal(response.status, 415)
})

test('hotlink: declared size over the cap is refused (413)', async () => {
  const { ctx } = setupHotlink([
    new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(64 * 1024 * 1024),
      },
    }),
  ])
  const response = await worker.fetch(hotlink('i.pximg.net/x.jpg'), {}, ctx)
  assert.equal(response.status, 413)
})
