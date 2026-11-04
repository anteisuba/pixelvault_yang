import type { fakeServer } from '@/test/app-harness'
import type { GenerationRecord } from '@/types'

/**
 * 常用的几条假接口（L2b）：素材库列表 / 文件夹 / 分面计数。
 * 按 `fakeServer()` 的登记法挂上去；要看请求内容的，自己再 `.on(...)` 盖一条。
 */
export function fakeAssetLibraryRoutes(
  server: ReturnType<typeof fakeServer>,
  generations: GenerationRecord[] = [],
) {
  return server
    .on('GET', '/api/images', (request) =>
      Response.json({
        success: true,
        data: {
          generations,
          page: 1,
          limit: Number(request.nextUrl.searchParams.get('limit') ?? 24),
          total: generations.length,
          hasMore: false,
          nextCursor: null,
        },
      }),
    )
    .on('GET', '/api/projects', () =>
      Response.json({ success: true, data: [] }),
    )
    .on('GET', '/api/assets/section-counts', () =>
      Response.json({
        success: true,
        data: {
          all: generations.length,
          favorites: 0,
          published: 0,
          image: generations.length,
          video: 0,
          audio: 0,
          unassigned: 0,
          byProject: {},
          byModel: {},
        },
      }),
    )
}

/** jsdom 没有的几样浏览器 API：观察器、scrollIntoView。 */
export function stubBrowserObservers() {
  class Noop {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  globalThis.IntersectionObserver ??= Noop as never
  globalThis.ResizeObserver ??= Noop as never
  Element.prototype.scrollIntoView ??= () => {}
}
