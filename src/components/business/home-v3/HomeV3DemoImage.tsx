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

type Phase = 'idle' | 'running' | 'ready'

/**
 * The image capability, run by the reader instead of played at them.
 *
 * It opens on an empty frame holding the prompt and nothing else, because that
 * is where the product actually starts. Pressing generate spends a beat and the
 * character arrives; from there the same character can be re-dressed, redrawn
 * as a sprite, or taken to a photograph — each a further press.
 *
 * The frame holds only the picture and the states the picture can be in. The
 * controls sit under it and the argument sits in the section copy beside it, so
 * nothing is said twice.
 *
 * All four frames are real `gpt-image-2` output; the three edits were each
 * generated from the first as a reference image, the product's own
 * multi-reference path. Nothing here calls an API — the page is edge-cached and
 * signed out, so the timings stand in for a generation, which is the honest
 * thing to do in that position.
 */
export function HomeV3DemoImage() {
  const t = useTranslations('Homepage.imageDemo')
  const [phase, setPhase] = useState<Phase>('idle')
  const [variant, setVariant] = useState<HomeV3ImageDemoVariant>('base')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const run = useCallback((next: HomeV3ImageDemoVariant, ms: number) => {
    if (timer.current) clearTimeout(timer.current)

    const instant =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (instant) {
      setVariant(next)
      setPhase('ready')
      return
    }

    setPhase('running')
    timer.current = setTimeout(() => {
      setVariant(next)
      setPhase('ready')
    }, ms)
  }, [])

  const edits = HOME_V3_IMAGE_DEMO_VARIANTS.filter((v) => v.id !== 'base')

  return (
    <div className="home-v3-img2" data-home-v3-imagedemo data-phase={phase}>
      <figure className="home-v3-demo home-v3-img2-stage">
        {HOME_V3_IMAGE_DEMO_VARIANTS.map((entry) => (
          <Image
            key={entry.id}
            src={entry.shot}
            alt=""
            width={450}
            height={675}
            data-variant={entry.id}
            data-shown={
              phase === 'ready' && entry.id === variant ? 'true' : 'false'
            }
            priority={entry.id === 'base'}
          />
        ))}

        {/* Before anything is pressed a prompt really is all there is, so it is
            the frame's resting state rather than an overlay to dismiss. */}
        <span className="home-v3-img2-prompt">{t('promptLine')}</span>

        <span className="home-v3-img2-running">
          <Spinner size="lg" label={t('running')} />
          <em>{t('running')}</em>
        </span>

        {phase === 'ready' ? <figcaption>{t('same')}</figcaption> : null}
      </figure>

      <div className="home-v3-img2-side">
        {phase === 'idle' ? (
          <button
            type="button"
            className="home-v3-img2-run"
            onClick={() => run('base', 1700)}
          >
            {t('generate')}
          </button>
        ) : (
          <div
            className="home-v3-img2-chips"
            role="group"
            aria-label={t('pick')}
          >
            {edits.map((entry) => {
              const active = phase === 'ready' && entry.id === variant
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="home-v3-img2-chip"
                  data-active={active ? 'true' : undefined}
                  aria-pressed={active}
                  disabled={phase === 'running'}
                  /* Pressing the active edit puts the character back, so each
                     edit can be judged against the same original. */
                  onClick={() => run(active ? 'base' : entry.id, 1200)}
                >
                  {t(`${entry.id}.action`)}
                </button>
              )
            })}
          </div>
        )}

        <p className="home-v3-img2-caption" aria-live="polite">
          {phase === 'idle'
            ? t('hint')
            : phase === 'running'
              ? t('running')
              : t(`${variant}.note`)}
        </p>

        <p className="home-v3-img2-by">{HOME_V3_IMAGE_DEMO.model}</p>
      </div>
    </div>
  )
}
