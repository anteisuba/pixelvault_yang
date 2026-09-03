/**
 * Assets browser skeleton — shown while the page's signed-in
 * `getPublicGenerations` fetch resolves. Light like the browser itself
 * (ui-defaults.md §2.1: `.dark` only on media-viewing surfaces).
 */
export default function AssetsLoading() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      {/* Toolbar row */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 border-r border-border p-3 sm:block">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-7 w-full animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-6 w-full animate-pulse rounded-md bg-muted"
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
                className="aspect-square animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
