'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_LORA,
  HOME_V4_FN_LORA_CARDS,
  HOME_V4_FN_LORA_MOUNTS,
  HOME_V4_FN_LORA_OUTS,
  HOME_V4_FN_LORA_WEIGHT_MAX,
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

        {/* ⭐ 左右分栏，右边是主体。工作台（库 + 机架）压进左边一栏，四张出图占右边
            并排成 2×2 —— 四张横排在半幅宽里每张只剩 150px，比放在底部一排还小，
            「图片是主体」就成了空话。2×2 才能让每张都比原来大。 */}
        <div className="cols">
          <div className="side">
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
                        style={{
                          width: `${Math.round(
                            (mount.weight / HOME_V4_FN_LORA_WEIGHT_MAX) * 100,
                          )}%`,
                        }}
                      />
                    </span>
                    <span className="wv">{mount.weight.toFixed(1)}</span>
                  </span>
                </div>
              ))}

              <span className="rk">{t('v4.fn.lora.promptKicker')}</span>
              <div className="prow2">
                {/* Only the mounts that have a trigger word. A slider LoRA has
                  none, and inventing one would misrepresent how it is used. */}
                {HOME_V4_FN_LORA_MOUNTS.filter((mount) => mount.trigger).map(
                  (mount, index) => (
                    <span
                      className={`trig${index < beats.triggers ? ' in' : ''}`}
                      key={mount.id}
                    >
                      {mount.trigger}
                    </span>
                  ),
                )}
                <span className="free">{t('v4.fn.lora.freeText')}</span>
              </div>
            </div>
          </div>

          {/* 右栏：出图。⚠ 这里不再是「机架的一部分」，而是与整个工作台并列的另一半
              —— 页面的结论跟产生它的操作各占一边。 */}
          <div className="outwrap">
            <span className="rk outk">{t('v4.fn.lora.outKicker')}</span>
            {/* 错开延时挂在 `.oq` 的 `nth-child` 上，四格必须是 `.outrow` 的直接子元素。 */}
            <div className="outrow">
              {HOME_V4_FN_LORA_OUTS.map((out, index) => (
                <div
                  className={`oq${index < beats.outs ? ' in' : ''}`}
                  key={out.id}
                >
                  <Image
                    src={out.shot}
                    alt={t('v4.fn.lora.outAlt', {
                      cel: out.cel,
                      solid: out.solid,
                    })}
                    fill
                    sizes="(max-width: 768px) 44vw, 210px"
                  />
                  {/* The two numbers are the whole point — same mounts, same seed,
                  only these moved. Never translated: they are values. */}
                  <span className="k">
                    {out.cel.toFixed(1)} / {out.solid.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </HomeV4FnFrame>
  )
}
