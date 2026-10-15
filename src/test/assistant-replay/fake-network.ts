/**
 * 回放的网络边：换掉的只有 `globalThis.fetch`。AI SDK 的五家、`llm-text` 的辅助调用、`safeFetch`
 * 下图下片子，全都从这里过 —— 上面每一层（路由、v3 环、执行器、提示词、路由解析）都是真的。
 *
 * - 厂商主机：认出哪一家、哪个型号、哪把 key、主步还是辅助，按题目里录好的回复答。
 * - 题目画布的素材主机：按扩展名现做字节（sharp 画一张纯色图 / 一段带 `ftyp` 头的 mp4），
 *   过得了服务端的魔数校验。
 * - 别的地址一律记成「意外的网络」并答 599：回放里多出来的一跳本身就是要报的事。
 */
import sharp from 'sharp'

import type { ReplayProvider, ReplayReply, ReplaySearch } from './fixture'
import {
  PROVIDER_HOSTS,
  encodeSearch,
  encodeStream,
  encodeText,
  readProviderRequest,
  type ProviderRequest,
} from './wire'

/** 一次碰模型：请求里认出来的那些 + 它在这一轮里是第几跳。 */
export interface RecordedModelCall extends ProviderRequest {
  readonly host: string
  readonly path: string
}

/**
 * 没录回复时辅助文本调用的答复：一份空的记忆草稿（`AssistantRoundMemoriesDraftSchema`，v3 收尾后
 * 在后台抽记忆那一跳）。别的辅助调用（查证规划……）读不出它，照它们自己的退路走。
 */
export const EMPTY_TEXT_REPLY = JSON.stringify({ memories: [] })

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
}

/** 地址 → 一个稳定的颜色（同一张图每次字节相同，不同的图看得出不同）。 */
function colorOf(url: string) {
  let hash = 0
  for (const char of url) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return { r: hash & 0xff, g: (hash >> 8) & 0xff, b: (hash >> 16) & 0xff }
}

const assetBytes = new Map<string, Promise<Buffer>>()

/** 一张真图（过得了 libvips 的魔数判型）或一段带 `ftyp` 头的 mp4。 */
export function replayAssetBytes(url: string, mime: string): Promise<Buffer> {
  const cached = assetBytes.get(url)
  if (cached) return cached
  const made =
    mime === 'video/mp4'
      ? Promise.resolve(
          Buffer.concat([
            Buffer.from([0, 0, 0, 0x18]),
            Buffer.from('ftypisom', 'ascii'),
            Buffer.from([0, 0, 2, 0]),
            Buffer.from('isommp41', 'ascii'),
            Buffer.alloc(256),
          ]),
        )
      : (() => {
          const image = sharp({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: colorOf(url),
            },
          })
          return (
            mime === 'image/jpeg'
              ? image.jpeg()
              : mime === 'image/webp'
                ? image.webp()
                : image.png()
          ).toBuffer()
        })()
  assetBytes.set(url, made)
  return made
}

function bodyText(body: RequestInit['body'] | undefined): string | null {
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return new TextDecoder().decode(body)
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  return null
}

export interface ReplayNetwork {
  readonly fetch: typeof globalThis.fetch
  readonly modelCalls: RecordedModelCall[]
  readonly assetFetches: string[]
  readonly unexpected: string[]
  /** 还没用掉的主步回复（题目写多了 / 环提前停了）。 */
  remainingReplies(): number
}

export function createReplayNetwork(script: {
  readonly replies: readonly ReplayReply[]
  readonly textReplies: readonly string[]
  readonly search: readonly ReplaySearch[]
  readonly assetHost: string
}): ReplayNetwork {
  const modelCalls: RecordedModelCall[] = []
  const assetFetches: string[] = []
  const unexpected: string[] = []
  let replyIndex = 0
  let textIndex = 0
  let searchIndex = 0

  const fail = (what: string) => {
    unexpected.push(what)
    return new Response(JSON.stringify({ error: { message: what } }), {
      status: 599,
      headers: { 'content-type': 'application/json' },
    })
  }

  const answerModel = (
    adapterType: ReplayProvider,
    url: URL,
    init: RequestInit | undefined,
  ): Response => {
    const text = bodyText(init?.body)
    const body: unknown = text === null ? null : JSON.parse(text)
    const request = readProviderRequest(
      adapterType,
      url,
      new Headers(init?.headers),
      body,
    )
    modelCalls.push({ ...request, host: url.host, path: url.pathname })
    if (request.purpose === 'step') {
      const reply = script.replies[replyIndex]
      if (!reply)
        return fail(
          `unscripted model step #${replyIndex + 1} (${adapterType} ${request.modelId})`,
        )
      replyIndex += 1
      return new Response(encodeStream(request, reply, `s${replyIndex}`), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    if (request.purpose === 'search') {
      const search = script.search[searchIndex]
      if (!search)
        return fail(
          `unscripted web search #${searchIndex + 1} (${adapterType})`,
        )
      searchIndex += 1
      return Response.json(encodeSearch(request, search))
    }
    const reply = script.textReplies[textIndex] ?? EMPTY_TEXT_REPLY
    textIndex += 1
    return request.stream
      ? new Response(
          encodeStream(request, { text: reply, calls: [] }, `t${textIndex}`),
          { headers: { 'content-type': 'text/event-stream' } },
        )
      : Response.json(encodeText(request, reply))
  }

  const answerAsset = async (url: URL): Promise<Response> => {
    const extension = url.pathname.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_BY_EXTENSION[extension]
    if (!mime) return fail(`asset with unknown type: ${url.href}`)
    assetFetches.push(url.href)
    const bytes = await replayAssetBytes(url.href, mime)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': mime,
        'content-length': String(bytes.byteLength),
      },
    })
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    init?.signal?.throwIfAborted()
    const url = new URL(href)
    const provider = PROVIDER_HOSTS[url.host]
    if (provider) return answerModel(provider, url, init)
    if (url.host === script.assetHost) return answerAsset(url)
    return fail(`${init?.method ?? 'GET'} ${url.href}`)
  }

  return {
    fetch,
    modelCalls,
    assetFetches,
    unexpected,
    remainingReplies: () => script.replies.length - replyIndex,
  }
}
