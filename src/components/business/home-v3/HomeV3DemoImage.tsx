'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  HOME_V3_IMAGE_DEMO,
  HOME_V3_IMAGE_DEMO_VARIANTS,
  type HomeV3ImageDemoVariant,
} from '@/constants/home-v3'
import { Spinner } from '@/components/ui/spinner'

/**
 * The image capability, run by the reader instead of played at them.
 *
 * It opens on the character already there, because the section is about what
 * can be done to a picture, not about waiting for one. Each control re-runs the
 * same subject through a different edit: a new jacket, a sprite redraw, a
 * photograph. Pressing the active edit puts him back, so each can be judged
 * against the same original.
 *
 * All four frames are real `gpt-image-2` output; the three edits were each
 * generated from the first as a reference image, the product's own
 * multi-reference path. Nothing here calls an API — the page is edge-cached and
 * signed out, so the delay stands in for a generation, which is the honest
 * thing to do in that position.
 *
 * The mole under his left eye survives every edit. That is what makes "same
 * character" checkable in the picture instead of asserted in the copy.
 */
export function HomeV3DemoImage() {
  const t = useTranslations('Homepage.imageDemo')
  const [running, setRunning] = useState(false)
  const [variant, setVariant] = useState<HomeV3ImageDemoVariant>('base')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const run = useCallback((next: HomeV3ImageDemoVariant) => {
    if (timer.current) clearTimeout(timer.current)

    const instant =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (instant) {
      setVariant(next)
      return
    }

    setRunning(true)
    timer.current = setTimeout(() => {
      setVariant(next)
      setRunning(false)
    }, 1200)
  }, [])

  const edits = HOME_V3_IMAGE_DEMO_VARIANTS.filter((v) => v.id !== 'base')

  return (
    <div
      className="home-v3-img2"
      data-home-v3-imagedemo
      data-phase={running ? 'running' : 'ready'}
    >
      <figure className="home-v3-demo home-v3-img2-stage">
        {HOME_V3_IMAGE_DEMO_VARIANTS.map((entry) => (
          <Image
            key={entry.id}
            src={entry.shot}
            alt=""
            width={450}
            height={675}
            data-variant={entry.id}
            data-shown={entry.id === variant ? 'true' : 'false'}
            priority={entry.id === 'base'}
          />
        ))}

        <span className="home-v3-img2-running">
          <Spinner size="lg" label={t('running')} />
          <em>{t('running')}</em>
        </span>

        <figcaption>{t('same')}</figcaption>
      </figure>

      <div className="home-v3-img2-side">
        <div className="home-v3-img2-chips" role="group" aria-label={t('pick')}>
          {edits.map((entry) => {
            const active = !running && entry.id === variant
            return (
              <button
                key={entry.id}
                type="button"
                className="home-v3-img2-chip"
                data-active={active ? 'true' : undefined}
                aria-pressed={active}
                disabled={running}
                onClick={() => run(active ? 'base' : entry.id)}
              >
                {t(`${entry.id}.action`)}
              </button>
            )
          })}
        </div>

        <p className="home-v3-img2-caption" aria-live="polite">
          {running ? t('running') : t(`${variant}.note`)}
        </p>

        <p className="home-v3-img2-by">{HOME_V3_IMAGE_DEMO.model}</p>
      </div>
    </div>
  )
}
