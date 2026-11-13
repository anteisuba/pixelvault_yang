'use client'

import { useEffect, useRef } from 'react'
import { preload } from 'react-dom'

import { HOME_V6_ASSETS, type HomeV6WallShot } from '@/constants/homepage-v6'
import { herMarkup } from '@/lib/home-v6/her-rig'
import { mountStage, type HomeV6StageCopy } from '@/lib/home-v6/stage-engine'

const HER_MARKUP = herMarkup(HOME_V6_ASSETS.her.still, true)

export interface HomeV6StageText {
  headline: readonly [string, string]
  hint: string
  /** 你说的六句：① 到 ④ 各一句，⑤ 两句。 */
  me: readonly string[]
  sys: string
}

interface HomeV6StageProps {
  text: HomeV6StageText
  copy: HomeV6StageCopy
  shots: readonly HomeV6WallShot[]
  locale: string
}

/**
 * 首页 v6 的舞台：一条长轨道上钉着一整屏，左下她、右边一个窗口。
 *
 * 这里只画骨架和首个 HTML 就该有的字（大标题、你说的六句）；随滚动动的东西由
 * `mountStage`（`src/lib/home-v6/stage-engine.ts`）建出来并逐帧摆位。
 * 施工图：`docs/references/pages/home.md` §v6。
 */
export function HomeV6Stage({ text, copy, shots, locale }: HomeV6StageProps) {
  const ref = useRef<HTMLElement>(null)
  // 底和五官层跟 JS 并行下载，挂载时不用再等
  preload(HOME_V6_ASSETS.her.base, { as: 'image' })
  preload(HOME_V6_ASSETS.her.parts, { as: 'image' })

  useEffect(() => {
    const track = ref.current
    const page = track?.closest<HTMLElement>('.home-v6')
    if (!track || !page) return
    return mountStage(track, { page, track, copy, shots, locale })
  }, [copy, shots, locale])

  return (
    <section className="track" data-k="track" ref={ref}>
      <div className="stage" data-k="stage">
        <div className="tide" data-k="tide" />
        <i className="tideline" data-k="tideline" />
        <div className="id" data-k="id">
          <h1 data-k="headline">
            {text.headline[0]}
            <br />
            {text.headline[1]}
          </h1>
        </div>
        <div className="her2" data-k="her2" aria-hidden="true" />
        <div className="say" data-k="say" aria-live="polite" />
        <div className="win" data-k="win">
          <div className="thread" data-k="thread">
            <div className="wall" data-k="wall" />
            {text.me.map((line, k) => (
              <div className="me" data-k={`me${k}`} key={k}>
                {line}
              </div>
            ))}
            <div className="sys" data-k="sys">
              {text.sys}
            </div>
            <div className="voices" data-k="voices" />
          </div>
          <div className="fadebot" data-k="fadebot" />
          <div className="hint" data-k="hint">
            {text.hint}
          </div>
        </div>
        {/* 她的骨架和静态图直接进首个 HTML：首帧就在，WebGL 画好第一帧再换成会动的 */}
        <div
          className="her"
          data-k="her"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: HER_MARKUP }}
        />
      </div>
    </section>
  )
}
