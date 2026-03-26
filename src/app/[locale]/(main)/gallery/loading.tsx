export default function GalleryLoading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
      {/* Header skeleton */}
      <div className="mb-8 space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-2xl bg-secondary/40" />
        <div className="h-5 w-72 animate-pulse rounded-xl bg-secondary/30" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse overflow-hidden rounded-3xl border border-border/40 bg-card/60"
          >
            <div
              className="bg-secondary/25"
              style={{
                aspectRatio: i % 3 === 0 ? '3/4' : i % 3 === 1 ? '1/1' : '4/3',
              }}
            />
            <div className="space-y-2 p-4">
              <div className="h-3 w-3/4 rounded-full bg-secondary/30" />
              <div className="h-3 w-1/2 rounded-full bg-secondary/20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
