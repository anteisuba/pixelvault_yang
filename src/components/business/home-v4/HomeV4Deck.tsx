'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_SCROLL,
  HOME_V4_SECTIONS,
  HOME_V4_STATIONS,
  homeV4SectionAnchor,
  type HomeV4PageGroup,
  type HomeV4Section,
  type HomeV4ShowcaseShot,
  type HomeV4StationKey,
} from '@/constants/homepage-v4'
import { useHomeV4Scrub } from '@/hooks/use-home-v4-scrub'
import { homeV4CanvasProgressForStep } from '@/lib/home-v4-beats'

import { HomeV4Finale } from './HomeV4Finale'
import { HomeV4FnAudio } from './HomeV4FnAudio'
import { HomeV4FnCanvas } from './HomeV4FnCanvas'
import { HomeV4FnImage } from './HomeV4FnImage'
import { HomeV4FnLora } from './HomeV4FnLora'
import { HomeV4FnVault } from './HomeV4FnVault'
import { HomeV4FnVideo } from './HomeV4FnVideo'
import { HomeV4ModelRail } from './HomeV4ModelRail'
import { HomeV4ModelSheet } from './HomeV4ModelSheet'
import { HomeV4Opening } from './HomeV4Opening'
import { HomeV4Topbar } from './HomeV4Topbar'

interface HomeV4DeckProps {
  /** Locale segment. Passed down so the sheet's portal can re-declare it. */
  locale: string
  /** Opening wall shots, read server-side. Passed straight through. */
  shots?: readonly HomeV4ShowcaseShot[]
}

/** Which model's detail sheet is open. `null` while none is. */
interface OpenSheet {
  station: HomeV4StationKey
  index: number
}

/** `01`…`09`, then `10` upward — the mobile toc's numbering. */
function tocNumber(index: number): string {
  return index < 9 ? `0${index + 1}` : String(index + 1)
}

/**
 * v5 marketing home — 长卷 + 钉住演示（scrub）。
 *
 * 九段普通的文档流。每段高 `section.vh`，里面钉着一屏（`position: sticky`）的
 * 舞台；滚过的距离就是那一段的 `progress`，演示按进度求值。⛔ **没有翻页引擎**：
 * v4 的 wheel/touch 拦截、`translateY(100vh)` 的页叠、`LOCK_MS` 的输入锁、三层
 * 错速，全部删掉 —— 它们全是「页在翻」这件事的装置，而页已经不翻了。
 *
 * 三件事是承重的：
 *
 * - **钉住用 sticky，不用 GSAP pin。** 零依赖、零脚本、浏览器自己合成；营销域
 *   虽然是全项目唯一允许 GSAP 的地方，但「允许」不是「需要」。
 * - **滚动交回浏览器。** 滚轮、触控板、触屏、空格、Home/End、找字定位、地址栏
 *   的锚点——全是原生行为。段首的 `scroll-snap-align: start` 让一格一段，段内
 *   自由。键盘方向键只多做一件事：先把当前段走完，再去下一段。
 * - **进度只有一个源。** `useHomeV4Scrub` 读 `scrollY`；目录、键盘、画布步骤
 *   按钮都只是「滚到那个位置」，没有第二套状态。
 */
export function HomeV4Deck({ locale, shots }: HomeV4DeckProps) {
  const t = useTranslations('Homepage')
  const { progress, activeId, enabled, register, jumpTo } = useHomeV4Scrub()

  const [tocOpen, setTocOpen] = useState(false)
  const [sheet, setSheet] = useState<OpenSheet | null>(null)
  const tocOpenRef = useRef(false)
  const sheetRef = useRef<OpenSheet | null>(null)
  /* 键盘处理器只注册一次，所以它读的是 ref 而不是闭包里的那一帧。
     ⚠ 写在 effect 里而不是 render 里：render 期间改 ref 是并发模式下的坑。 */
  const activeRef = useRef(activeId)
  const progressRef = useRef(progress)
  useEffect(() => {
    activeRef.current = activeId
    progressRef.current = progress
  }, [activeId, progress])

  const setToc = useCallback((open: boolean) => {
    tocOpenRef.current = open
    setTocOpen(open)
  }, [])

  /**
   * The detail sheet belongs to the deck rather than to the rail that opens it:
   * Escape and any section jump have to close it, and a sheet owned by the row
   * underneath would be left hanging over the next section.
   */
  const openSheet = useCallback((station: HomeV4StationKey, index: number) => {
    const next = { station, index }
    sheetRef.current = next
    setSheet(next)
  }, [])

  const closeSheet = useCallback(() => {
    if (sheetRef.current === null) return
    sheetRef.current = null
    setSheet(null)
  }, [])

  /**
   * 目录跳段 = 把那一段直接摆到结果态（落地要点原文：「键盘翻页跳到 1.0」）。
   * 地址栏里的 `/#lora` 走浏览器原生，落在段首 —— 两条路径是两件事：点目录是
   * 「给我看这一段做完的样子」，分享链接是「从这一段开始看」。
   */
  const goToSection = useCallback(
    (id: string) => {
      setToc(false)
      closeSheet()
      jumpTo(id, HOME_V4_SCROLL.JUMP_PROGRESS)
    },
    [closeSheet, jumpTo, setToc],
  )

  /* 页面拥有文档滚动条。挂在类上而不是裸 `html, body` 选择器上，所以离开这条
     路由时文档就还回去了——应用里每一页共用这个 body。 */
  useEffect(() => {
    const { documentElement, body } = document
    documentElement.classList.add('home-v4-roll')
    body.classList.add('home-v4-roll')
    return () => {
      documentElement.classList.remove('home-v4-roll')
      body.classList.remove('home-v4-roll')
    }
  }, [])

  /**
   * 方向键 / PageUp / PageDown：**先走完这一段，再去下一段**。
   *
   * ⚠ 只接管这几个键，别的（空格、Home/End、Tab、找字）一律留给浏览器。一个把
   * 所有输入都吞掉的首页，是 v4 最贵的那个决定。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (tocOpenRef.current) {
        if (event.key === 'Escape') setToc(false)
        return
      }
      if (sheetRef.current) {
        if (event.key === 'Escape') closeSheet()
        return
      }

      const forward = event.key === 'ArrowDown' || event.key === 'PageDown'
      const back = event.key === 'ArrowUp' || event.key === 'PageUp'
      if (!forward && !back) return

      const index = HOME_V4_SECTIONS.findIndex(
        (section) => section.id === activeRef.current,
      )
      if (index < 0) return
      const here = HOME_V4_SECTIONS[index]
      const at = progressRef.current[here.id] ?? 0

      event.preventDefault()
      if (forward) {
        if (here.scrub && at < 1) jumpTo(here.id, 1)
        else if (index < HOME_V4_SECTIONS.length - 1)
          jumpTo(HOME_V4_SECTIONS[index + 1].id, 0)
        return
      }
      if (here.scrub && at > 0) jumpTo(here.id, 0)
      else if (index > 0) jumpTo(HOME_V4_SECTIONS[index - 1].id, 1)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSheet, jumpTo, setToc])

  const renderSection = (section: HomeV4Section) => {
    const at = progress[section.id] ?? HOME_V4_SCROLL.REST_PROGRESS
    const live = section.id === activeId

    if (section.id === 'opening')
      return <HomeV4Opening progress={at} shots={shots} />
    if (section.id === 'finale') return <HomeV4Finale progress={at} />
    if (section.id === 'models')
      return <HomeV4ModelRail onOpenDetail={openSheet} />

    const shared = {
      progress: at,
      eyebrow: section.eyebrow ?? '',
      title: t(`v4.pages.${section.id}.title`),
    }

    switch (section.id) {
      case 'image':
        return (
          <HomeV4FnImage
            {...shared}
            onOpenModel={() => goToSection('models')}
          />
        )
      case 'lora':
        return <HomeV4FnLora {...shared} />
      case 'audio':
        return <HomeV4FnAudio {...shared} active={live} />
      case 'video':
        return <HomeV4FnVideo {...shared} active={live} />
      case 'canvas':
        return (
          <HomeV4FnCanvas
            {...shared}
            active={live}
            onStepChange={(step) =>
              jumpTo('canvas', homeV4CanvasProgressForStep(step))
            }
          />
        )
      case 'vault':
        return <HomeV4FnVault {...shared} />
      default:
        /* Unreachable: every id in `HOME_V4_SECTIONS` is handled above, and the
           copy test pins that list against the message files. */
        return null
    }
  }

  /** A group heading is printed on the first row of each group, and nowhere else. */
  const tocGroupHeads: (HomeV4PageGroup | null)[] = HOME_V4_SECTIONS.map(
    (section, index) =>
      index === 0 || HOME_V4_SECTIONS[index - 1].group !== section.group
        ? section.group
        : null,
  )

  return (
    <>
      <HomeV4Topbar />

      <main className="deck" data-scrub={String(enabled)}>
        {HOME_V4_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={homeV4SectionAnchor(section.id)}
            ref={register(section.id)}
            className="vp"
            data-name={section.id}
            data-live={String(section.id === activeId)}
            style={{ '--sec-vh': `${section.vh}vh` } as CSSProperties}
            aria-label={t(`v4.pages.${section.id}.nav`)}
          >
            {/* 钉住的一屏。`.vp` 本身是滚动行程，舞台是 sticky 的那一层。 */}
            <div className="vp-stage">{renderSection(section)}</div>
          </section>
        ))}
      </main>

      {/* PC：左缘段进度条，hover 整个区域展开全部段名 */}
      <nav className="dots" aria-label={t('v4.nav.label')}>
        {HOME_V4_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            data-on={String(section.id === activeId)}
            onClick={() => goToSection(section.id)}
          >
            <i />
            <span className="nm">{t(`v4.pages.${section.id}.nav`)}</span>
          </button>
        ))}
      </nav>

      {/* Mobile：右缘细点条（拇指区）→ 点击弹全屏目录 */}
      <button
        type="button"
        className="mdots"
        aria-label={t('v4.nav.pageLabel')}
        onClick={() => setToc(true)}
      >
        {HOME_V4_SECTIONS.map((section) => (
          <i
            key={section.id}
            className={section.id === activeId ? 'on' : undefined}
          />
        ))}
      </button>

      {/* Closed, it is only `opacity:0` — without `inert` a screen reader would
          still walk every invisible section button on every mobile screen. */}
      <div className={`mtoc${tocOpen ? ' on' : ''}`} inert={!tocOpen}>
        <button
          type="button"
          className="mt-x"
          aria-label={t('v4.nav.close')}
          onClick={() => setToc(false)}
        >
          ✕
        </button>
        {HOME_V4_SECTIONS.map((section, index) => {
          const heading = tocGroupHeads[index]
          const name = t(`v4.pages.${section.id}.nav`)

          return (
            <Fragment key={section.id}>
              {heading ? (
                <span className="mt-k">{t(`v4.groups.${heading}`)}</span>
              ) : null}
              <button
                type="button"
                className={section.id === activeId ? 'on' : undefined}
                onClick={() => goToSection(section.id)}
              >
                <span className="no">{tocNumber(index)}</span>
                {name}
              </button>
            </Fragment>
          )
        })}
      </div>

      {/* Portalled to `<body>`: the sheet is `position: fixed` and a sticky
          stage with its own stacking context would trap it. */}
      <HomeV4ModelSheet
        model={sheet ? HOME_V4_STATIONS[sheet.station][sheet.index] : null}
        locale={locale}
        onClose={closeSheet}
      />
    </>
  )
}
