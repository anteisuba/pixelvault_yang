/**
 * Assets browser skeleton — shown while the page's signed-in
 * `getPublicGenerations` fetch resolves. Mirrors the dark Krea-overlay
 * surface KreaAssetBrowser uses so the swap reads as continuous instead
 * of a flash to the editorial main background.
 */
export default function AssetsLoading() {
  return (
    <div className="dark flex min-h-svh flex-col bg-sidebar text-sidebar-foreground">
      {/* Toolbar row */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="h-7 w-32 animate-pulse rounded-md bg-white/10" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-7 w-24 animate-pulse rounded-md bg-white/10" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-white/10" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-white/10" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 border-r border-white/10 p-3 sm:block">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-7 w-full animate-pulse rounded-md bg-white/10"
              />
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-6 w-full animate-pulse rounded-md bg-white/10"
              />
            ))}
          </div>
        </aside>

        {/* Tile grid */}
        <main className="flex-1 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-md bg-white/10"
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
