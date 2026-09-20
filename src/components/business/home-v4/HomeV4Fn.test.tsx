import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_FN_CANVAS_SHOTS,
  HOME_V4_FN_IMAGE_MODELS,
  HOME_V4_FN_LORA_MOUNTS,
  HOME_V4_FN_LORA_OUTS,
  HOME_V4_FN_VAULT_CELLS,
  HOME_V4_FN_VIDEO_REFS,
  HOME_V4_SCROLL,
  HOME_V4_STATIONS,
} from '@/constants/homepage-v4'
import { homeV4CanvasProgressForStep } from '@/lib/home-v4-beats'

import { HomeV4FnAudio } from './HomeV4FnAudio'
import { HomeV4FnCanvas } from './HomeV4FnCanvas'
import { HomeV4FnImage } from './HomeV4FnImage'
import { HomeV4FnLora } from './HomeV4FnLora'
import { HomeV4FnVault } from './HomeV4FnVault'
import { HomeV4FnVideo } from './HomeV4FnVideo'

vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate, useLocale: () => 'zh' }
})

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const HEADER = { eyebrow: '01 · TEST', title: 'title' }

/** UX 板给的四个取样点，六段共用。 */
const SAMPLES = [0, 0.3, 0.7, 1] as const

/** One section, drawn at one progress. Nothing here needs a clock. */
function at(section: (progress: number) => ReactElement, progress: number) {
  const view = render(section(progress))
  return {
    unmount: view.unmount,
    count: (selector: string) =>
      view.container.querySelectorAll(selector).length,
    has: (selector: string) => view.container.querySelector(selector) !== null,
    text: (selector: string) =>
      view.container.querySelector(selector)?.textContent ?? '',
    attr: (selector: string, name: string) =>
      view.container.querySelector(selector)?.getAttribute(name) ?? null,
  }
}

const SECTIONS = [
  [
    'image',
    (progress: number) => (
      <HomeV4FnImage
        {...HEADER}
        progress={progress}
        onOpenModel={() => undefined}
      />
    ),
  ],
  [
    'lora',
    (progress: number) => <HomeV4FnLora {...HEADER} progress={progress} />,
  ],
  [
    'audio',
    (progress: number) => (
      <HomeV4FnAudio {...HEADER} progress={progress} active />
    ),
  ],
  [
    'video',
    (progress: number) => (
      <HomeV4FnVideo {...HEADER} progress={progress} active />
    ),
  ],
  [
    'canvas',
    (progress: number) => (
      <HomeV4FnCanvas
        {...HEADER}
        progress={progress}
        active
        onStepChange={() => undefined}
      />
    ),
  ],
  [
    'vault',
    (progress: number) => <HomeV4FnVault {...HEADER} progress={progress} />,
  ],
] as const

/**
 * 六段演示的**状态机**契约（v5 长卷）。
 *
 * jsdom 没有布局，所以这里一寸几何都不断言。被钉住的是另一件事，而且是现在唯一
 * 要紧的那件：**同一个 progress 永远画出同一个 DOM**——没有定时器、没有「播到
 * 哪儿了」、没有进场与退场的差别。往回滚就是把 progress 调小，所以每条断言都
 * 双向成立。
 */
beforeEach(() => {
  /* jsdom implements neither, and `play()` returning undefined would make the
     `.catch()` in the section throw rather than swallow a refused autoplay. */
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(SECTIONS)('home v5 · 功能段 %s', (name, section) => {
  it('空态就画完整的骨架：元素全部预渲染，只是没揭开', () => {
    const view = at(section, 0)
    expect(view.has('.page-inner')).toBe(true)
    expect(view.has('.fn-head h2')).toBe(true)
    expect(view.has('.fn-stage')).toBe(true)
    /* ⛔ 段内没有任何一件东西是「到时候才加进 DOM」的：那是布局变化。 */
    expect(view.count('.fn-stage > *')).toBeGreaterThan(0)
  })

  it('结果态亮 CTA，空态不亮，且 CTA 在两种状态下都在 DOM 里', () => {
    const empty = at(section, 0)
    expect(empty.attr('.fn-cta', 'data-on')).toBe('false')
    /* 不亮的时候不吃 Tab —— 看不见的链接不该是焦点站。 */
    expect(empty.attr('.fn-cta', 'tabindex')).toBe('-1')

    const done = at(section, HOME_V4_SCROLL.REST_PROGRESS)
    expect(done.attr('.fn-cta', 'data-on')).toBe('true')
    expect(done.attr('.fn-cta', 'tabindex')).toBe(null)
    expect(done.attr('.fn-cta', 'href')).toBeTruthy()
  })

  it('同一个 progress 画出同一个 DOM（可来回滚）', () => {
    for (const progress of SAMPLES) {
      const first = render(section(progress)).container.innerHTML
      const second = render(section(progress)).container.innerHTML
      expect(second, `${name} @ ${progress}`).toBe(first)
    }
  })

  it('降级进度（手机 / reduced-motion）给的是结果态', () => {
    const view = at(section, HOME_V4_SCROLL.REST_PROGRESS)
    expect(view.attr('.fn-cta', 'data-on')).toBe('true')
  })
})

describe('01 图片 · DOM 随进度', () => {
  const draw = (progress: number) =>
    at(
      (p: number) => (
        <HomeV4FnImage {...HEADER} progress={p} onOpenModel={() => undefined} />
      ),
      progress,
    )

  it('四格逐格揭开，格子数从头到尾不变', () => {
    const tiles = SAMPLES.map((p) => draw(p).count('.fn-quad .fq.in'))
    expect(tiles).toEqual([0, 0, 3, 4])
    for (const progress of SAMPLES) {
      expect(draw(progress).count('.fn-quad .fq')).toBe(
        HOME_V4_FN_IMAGE_MODELS.length,
      )
    }
  })

  it('prompt 是一截一截写出来的；写完光标就收走', () => {
    expect(draw(0).text('.ptxt .txt')).toBe('')
    expect(draw(0.3).text('.ptxt .txt').length).toBeGreaterThan(0)
    expect(draw(0.2).has('.ptxt .cur')).toBe(true)
    expect(draw(1).has('.ptxt .cur')).toBe(false)
  })

  it('模型 chips 走真站表，不手抄', () => {
    expect(draw(1).count('.chips button')).toBe(HOME_V4_STATIONS.image.length)
  })
})

describe('02 LoRA · DOM 随进度', () => {
  const draw = (progress: number) =>
    at((p: number) => <HomeV4FnLora {...HEADER} progress={p} />, progress)

  it('挂载 → 触发词 → 出图，三批依次落位', () => {
    expect(SAMPLES.map((p) => draw(p).count('.mrow.in'))).toEqual([0, 5, 5, 5])
    expect(SAMPLES.map((p) => draw(p).count('.trig.in'))).toEqual([0, 3, 3, 3])
    expect(SAMPLES.map((p) => draw(p).count('.oq.in'))).toEqual([0, 0, 3, 4])
  })

  it('机架行与出图格的总数与常量一致，不随进度增删', () => {
    expect(draw(0).count('.mrow')).toBe(HOME_V4_FN_LORA_MOUNTS.length)
    expect(draw(0).count('.oq')).toBe(HOME_V4_FN_LORA_OUTS.length)
  })
})

describe('03 声音 · DOM 随进度', () => {
  const draw = (progress: number) =>
    at(
      (p: number) => <HomeV4FnAudio {...HEADER} progress={p} active />,
      progress,
    )

  it('气泡落位、波形跟上', () => {
    expect(SAMPLES.map((p) => draw(p).count('.msg.in'))).toEqual([0, 3, 3, 3])
    expect(SAMPLES.map((p) => draw(p).count('.msg.played'))).toEqual([
      0, 2, 3, 3,
    ])
  })

  it('三条消息与三段音频从头到尾都在 DOM 里，且 preload=none', () => {
    const view = draw(0)
    expect(view.count('.msg')).toBe(HOME_V4_FN_AUDIO_LINES.length)
    expect(view.count('audio[preload="none"]')).toBe(
      HOME_V4_FN_AUDIO_LINES.length,
    )
  })

  it('滚动本身不发声：没有一个 audio 带 autoplay', () => {
    expect(draw(1).count('audio[autoplay]')).toBe(0)
  })
})

describe('04 视频 · DOM 随进度', () => {
  const draw = (progress: number, active = true) =>
    at(
      (p: number) => <HomeV4FnVideo {...HEADER} progress={p} active={active} />,
      progress,
    )

  it('胶囊 → brief → 发送键 → 成片', () => {
    expect(SAMPLES.map((p) => draw(p).count('.iline.in'))).toEqual([0, 4, 4, 4])
    expect(SAMPLES.map((p) => draw(p).count('.up.on'))).toEqual([0, 0, 1, 1])
    expect(SAMPLES.map((p) => draw(p).count('.out.in'))).toEqual([0, 0, 1, 1])
  })

  it('三个参考胶囊从头到尾都在 DOM 里', () => {
    expect(draw(0).count('.ibox .iline .pill')).toBe(
      HOME_V4_FN_VIDEO_REFS.length,
    )
  })

  it('段滚出视口就暂停，不留一个看不见的解码器', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
    draw(1, false)
    expect(pause).toHaveBeenCalled()
  })
})

describe('05 画布 · DOM 随进度', () => {
  const draw = (progress: number) =>
    at(
      (p: number) => (
        <HomeV4FnCanvas
          {...HEADER}
          progress={p}
          active
          onStepChange={() => undefined}
        />
      ),
      progress,
    )

  it('三步随进度推进；步骤按钮与 data-stage 同源', () => {
    expect(draw(0).attr('.fn-canvas', 'data-stage')).toBe('1')
    expect(draw(0.7).attr('.fn-canvas', 'data-stage')).toBe('3')
    expect(draw(1).attr('.fn-canvas', 'data-stage')).toBe('3')
  })

  it('跳步的反解落在那一步上', () => {
    for (const step of [0, 1, 2]) {
      expect(
        draw(homeV4CanvasProgressForStep(step)).attr(
          '.fn-canvas',
          'data-stage',
        ),
      ).toBe(String(step + 1))
    }
  })

  it('节点与连线在第三步才揭开，节点数恒定', () => {
    expect(draw(0).count('.cv .cn')).toBe(HOME_V4_FN_CANVAS_SHOTS.length + 1)
    expect(draw(0).count('.cv .cn.in')).toBe(0)
    expect(draw(1).count('.cv .cn.in')).toBe(HOME_V4_FN_CANVAS_SHOTS.length + 1)
    expect(draw(1).count('.wires path.draw')).toBe(
      HOME_V4_FN_CANVAS_SHOTS.length,
    )
  })
})

describe('06 资源库 · DOM 随进度', () => {
  const draw = (progress: number) =>
    at((p: number) => <HomeV4FnVault {...HEADER} progress={p} />, progress)

  it('落库 → 涌入 → 选中 → 复用位填满', () => {
    expect(SAMPLES.map((p) => draw(p).count('.vc.far.in'))).toEqual([
      0, 3, 3, 3,
    ])
    expect(SAMPLES.map((p) => draw(p).count('.vc.in'))).toEqual([0, 10, 10, 10])
    expect(SAMPLES.map((p) => draw(p).count('.vc.lift'))).toEqual([0, 0, 1, 1])
  })

  it('复用位是连续填充，不是开关', () => {
    expect(draw(0).attr('.slot', 'data-got')).toBe('false')
    expect(draw(0.7).attr('.slot', 'data-got')).toBe('false')
    expect(draw(0.7).attr('.slot', 'style')).toContain('--slot')
    expect(draw(1).attr('.slot', 'data-got')).toBe('true')
  })

  it('⛔ 飞递 ghost 已删：任何进度下都不往 DOM 里塞飞行元素', () => {
    for (const progress of SAMPLES) {
      expect(draw(progress).count('.flyer')).toBe(0)
      expect(draw(progress).count('.fn-flyers')).toBe(0)
    }
  })

  it('库格数恒定，不随进度增删', () => {
    for (const progress of SAMPLES) {
      expect(draw(progress).count('.vgrid .vc')).toBe(
        HOME_V4_FN_VAULT_CELLS.length,
      )
    }
  })
})
