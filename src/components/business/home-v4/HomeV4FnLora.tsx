'use client'

import { useEffect, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_LORA,
  HOME_V4_FN_LORA_CARDS,
  HOME_V4_FN_LORA_MOUNTS,
  HOME_V4_FN_LORA_OUTS,
  HOME_V4_GLYPHS,
} from '@/constants/homepage-v4'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnLoraProps {
  /** True while this is the page on screen. Drives play / reset. */
  active: boolean
  eyebrow: string
  title: string
}

/** Three counters, one per beat — each is 「how many have landed」. */
interface LoraBeats {
  mounted: number
  triggers: number
  outs: number
}

const AT_REST: LoraBeats = { mounted: 0, triggers: 0, outs: 0 }

/**
 * 功能页 02 · LoRA — the mounting bench, played out.
 *
 * Three LoRAs are loaded one at a time (the library card lights, its row slides
 * into the rack, the counter ticks), their trigger words then pop into the
 * prompt on their own, and two output tiles fade up. The 「不设上限」 in the bar
 * is the point of the page and is true of the product: the three backends all
 * take as many as you mount.
 *
 * A fourth card stays in the library unmounted — a rack that fills itself
 * completely reads as a fixed list rather than a choice.
 *
 * Mobile drops the library column entirely and keeps the rack, so the one thing
 * on screen is the state the page is actually about.
 */
export function HomeV4FnLora({ active, eyebrow, title }: HomeV4FnLoraProps) {
  const t = useTranslations('Homepage')
  const [beats, setBeats] = useState<LoraBeats>(AT_REST)

  useEffect(() => {
    if (!active) {
      /* Rewind only once the page has slid away — see `HomeV4Opening`. */
      const rewind = window.setTimeout(
        () => setBeats(AT_REST),
        HOME_V4_ENGINE.PAGE_MS,
      )
      return () => window.clearTimeout(rewind)
    }

    const timers: number[] = []
    const at = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, HOME_V4_FN_LORA.ENTER_DELAY_MS + ms))
    }

    HOME_V4_FN_LORA_MOUNTS.forEach((_, index) => {
      at(
        () => setBeats((current) => ({ ...current, mounted: index + 1 })),
        HOME_V4_FN_LORA.MOUNT_START_MS + index * HOME_V4_FN_LORA.MOUNT_STEP_MS,
      )
      at(
        () => setBeats((current) => ({ ...current, triggers: index + 1 })),
        HOME_V4_FN_LORA.TRIGGER_START_MS +
          index * HOME_V4_FN_LORA.TRIGGER_STEP_MS,
      )
    })

    HOME_V4_FN_LORA_OUTS.forEach((_, index) => {
      at(
        () => setBeats((current) => ({ ...current, outs: index + 1 })),
        HOME_V4_FN_LORA.OUT_START_MS + index * HOME_V4_FN_LORA.OUT_STEP_MS,
      )
    })

    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [active])

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title}>
      <div className="fn-lora">
        <div className="bar">
          <span className="t">{t('v4.fn.lora.workbench')}</span>
          <span className="cnt">
            {t.rich('v4.fn.lora.mounted', {
              count: beats.mounted,
              b: (chunks) => <b>{chunks}</b>,
            })}
          </span>
        </div>

        <div className="cols">
          <div className="lib">
            <div className="search">
              {HOME_V4_GLYPHS.search} {t('v4.fn.lora.search')}
            </div>
            {HOME_V4_FN_LORA_CARDS.map((card) => {
              const mountIndex = HOME_V4_FN_LORA_MOUNTS.findIndex(
                (mount) => mount.id === card.id,
              )
              const hot = mountIndex >= 0 && mountIndex < beats.mounted

              return (
                <div
                  className={`lcard${hot ? ' hot' : ''}`}
                  data-cover={card.id}
                  key={card.id}
                >
                  <span className="cv" />
                  <span>
                    <span className="nm">
                      {t(`v4.fn.lora.cards.${card.id}.name`)}
                    </span>
                    <br />
                    <span className="bm">{card.base}</span>
                  </span>
                  <span className="add">{t('v4.fn.lora.add')}</span>
                </div>
              )
            })}
          </div>

          <div className="rig">
            <span className="rk">{t('v4.fn.lora.mountedKicker')}</span>
            {HOME_V4_FN_LORA_MOUNTS.map((mount, index) => (
              <div
                className={`mrow${index < beats.mounted ? ' in' : ''}`}
                key={mount.id}
              >
                <span className="nm">
                  {t(`v4.fn.lora.cards.${mount.id}.short`)}
                </span>
                <span className="w">
                  <span className="track2">
                    <i
                      style={{ width: `${Math.round(mount.weight * 100)}%` }}
                    />
                  </span>
                  <span className="wv">{mount.weight.toFixed(1)}</span>
                </span>
              </div>
            ))}

            <span className="rk">{t('v4.fn.lora.promptKicker')}</span>
            <div className="prow2">
              {HOME_V4_FN_LORA_MOUNTS.map((mount, index) => (
                <span
                  className={`trig${index < beats.triggers ? ' in' : ''}`}
                  key={mount.id}
                >
                  {mount.trigger}
                </span>
              ))}
              <span className="free">{t('v4.fn.lora.freeText')}</span>
            </div>

            <div className="outrow">
              {HOME_V4_FN_LORA_OUTS.map((out, index) => (
                <div
                  className={`oq${index < beats.outs ? ' in' : ''}`}
                  key={out}
                >
                  <span className="k">{t(`v4.fn.lora.outs.${out}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </HomeV4FnFrame>
  )
}
