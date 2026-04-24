export default function ProfileLoading() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-panel">
          {/* Header skeleton */}
          <div className="editorial-panel-head">
            <div className="editorial-section-head space-y-4">
              <div className="h-3 w-20 animate-pulse rounded-full bg-secondary/40" />
              <div className="h-8 w-56 animate-pulse rounded-2xl bg-secondary/40" />
              <div className="h-4 w-96 animate-pulse rounded-xl bg-secondary/30" />
              <div className="flex gap-3 pt-2">
                <div className="h-10 w-32 animate-pulse rounded-full bg-secondary/40" />
                <div className="h-10 w-32 animate-pulse rounded-full bg-secondary/30" />
              </div>
            </div>
          </div>

          {/* Gallery grid skeleton */}
          <div className="editorial-panel-divider">
            <div className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse overflow-hidden rounded-3xl border border-border/40 bg-card/60"
                >
                  <div
                    className="bg-secondary/25"
                    style={{
                      aspectRatio:
                        i % 3 === 0 ? '3/4' : i % 3 === 1 ? '1/1' : '4/3',
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
        </section>
      </div>
    </div>
  )
}
