import type { ReactNode } from 'react'
import Image from 'next/image'

import type { Route } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { BrandMark } from '@/components/ui/brand-mark'

interface AuthPageShellProps {
  brandLabel: string
  homeHref: Route
  panelEyebrow: string
  panelTitle: string
  panelDescription: string
  panelItems: string[]
  eyebrow: string
  title: string
  description: string
  note: string
  children: ReactNode
}

const AUTH_SHOWCASE_IMAGES = [
  '/showcase/showcase-01.webp',
  '/showcase/showcase-04.webp',
  '/showcase/showcase-06.webp',
] as const

export function AuthPageShell({
  brandLabel,
  homeHref,
  panelEyebrow,
  panelTitle,
  panelDescription,
  panelItems,
  eyebrow,
  title,
  description,
  note,
  children,
}: AuthPageShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="w-full border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-content items-center justify-between">
          <Link
            href={homeHref}
            className="inline-flex min-h-11 items-center gap-3 transition-opacity hover:opacity-75"
            aria-label={brandLabel}
          >
            <BrandMark />
            <span className="font-display text-base font-semibold">
              {brandLabel}
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-content flex-1 items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-16">
        <section className="max-w-xl lg:max-w-none">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {panelEyebrow}
          </p>
          <h1 className="mt-3 max-w-sm font-display text-2xl font-bold leading-tight text-balance sm:text-4xl lg:mt-4 lg:max-w-lg lg:text-5xl">
            {panelTitle}
          </h1>
          <p className="mt-3 max-w-md font-display text-sm leading-relaxed text-muted-foreground sm:text-base lg:mt-5">
            {panelDescription}
          </p>

          <ul className="mt-8 hidden space-y-3 font-display text-sm text-muted-foreground lg:block">
            {panelItems.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-foreground" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 hidden grid-cols-3 gap-2 lg:grid">
            {AUTH_SHOWCASE_IMAGES.map((src) => (
              <div
                key={src}
                className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-secondary"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 180px, 0px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-md flex-col">
          <div className="mb-6">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
              {title}
            </h2>
            <p className="mt-3 font-display text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>

          {children}

          <p className="mt-5 text-center font-display text-xs leading-relaxed text-muted-foreground">
            {note}
          </p>
        </section>
      </main>
    </div>
  )
}
