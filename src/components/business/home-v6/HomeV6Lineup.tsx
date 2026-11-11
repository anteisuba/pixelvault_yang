'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  HOME_V6_ASSETS,
  HOME_V6_ROSTER,
  HOME_V6_VOICE_LINES,
  HOME_V6_VOICES,
  type HomeV6Row,
  type HomeV6RowId,
  type HomeV6Voice,
} from '@/constants/homepage-v6'

import { HomeV6Mark } from './HomeV6Mark'

type Lang = 'zh' | 'ja' | 'en'
const LANGS: readonly (readonly [Lang, string])[] = [
  ['zh', '中文'],
  ['ja', '日本語'],
  ['en', 'English'],
]

export interface HomeV6LineupCopy {
  title: string
  sub: string
  groups: Record<'image' | 'video' | 'audio', string>
  pro: string
  con: string
  guide: string
  loraSub: string
  /** 「{name} 画的」 */
  sampleAlt: string
  langs: string
  rows: Record<HomeV6RowId, { pro: string; con: string; say: string }>
}

/**
 * 「模型她来挑」：舞台松开以后的名单。停在一行上（手机是点）那一行变白卡、往下展开它做过的素材，
 * 左下角的小鲸一个字一个字说一句她什么时候找它；离开收起。
 * 施工图：`docs/references/pages/home.md` §v6「模型她来挑」。
 */
export function HomeV6Lineup({
  copy,
  locale,
}: {
  copy: HomeV6LineupCopy
  locale: string
}) {
  const secRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState<HomeV6RowId | null>(null)
  const [inView, setInView] = useState(false)
  const [lang, setLang] = useState<Lang>(
    locale === 'ja' || locale === 'en' ? locale : 'zh',
  )
  const [speaking, setSpeaking] = useState<HomeV6Voice | null>(null)
  const [typing, setTyping] = useState({
    text: copy.guide,
    n: copy.guide.length,
  })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  const say = open ? copy.rows[open].say : copy.guide
  const typed = typing.text === say ? say.slice(0, typing.n) : ''

  /* 小鲸说话慢：一个字一个字出；气泡先按整句占好大小，不跟着抖。减少动态效果时整句直接出现 */
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let n = 0
    const id = setInterval(
      () => {
        n = reduce ? say.length : n + 1
        setTyping({ text: say, n })
        if (n >= say.length) clearInterval(id)
      },
      reduce ? 0 : 26,
    )
    return () => clearInterval(id)
  }, [say])

  const stopVoice = useCallback(() => {
    audioRef.current?.pause()
    setSpeaking(null)
  }, [])

  /* 大舞台滚走以后小鲸才出来（⛔ 同屏两个）；打开的那一行滚出屏幕就收起 */
  useEffect(() => {
    const check = () => {
      const track = secRef.current?.closest('.home-v6')?.querySelector('.track')
      if (track)
        setInView(track.getBoundingClientRect().bottom < innerHeight * 0.03)
      const cur = openRef.current
      if (cur) {
        const row = document.getElementById(`hv6-row-${cur}`)
        const r = row?.getBoundingClientRect()
        if (r && (r.bottom < 0 || r.top > innerHeight)) {
          setOpen(null)
          stopVoice()
        }
      }
    }
    addEventListener('scroll', check, { passive: true })
    addEventListener('resize', check)
    check()
    return () => {
      removeEventListener('scroll', check)
      removeEventListener('resize', check)
    }
  }, [stopVoice])

  useEffect(() => () => audioRef.current?.pause(), [])

  const pick = (id: HomeV6RowId | null) => {
    if (id === open) return
    if (open === 'fish' || id !== 'fish') stopVoice()
    setOpen(id)
  }

  const playVoice = (key: HomeV6Voice) => {
    if (speaking === key) return stopVoice()
    audioRef.current?.pause()
    const a = new Audio(HOME_V6_ASSETS.voiceAudio(key, lang))
    a.onended = () => setSpeaking(null)
    audioRef.current = a
    setSpeaking(key)
    a.play().catch(() => setSpeaking(null))
  }

  return (
    <section
      ref={secRef}
      className={`lineup${inView ? ' in' : ''}`}
      aria-labelledby="hv6-lineup-title"
    >
      <header className="lhead">
        <h2 id="hv6-lineup-title">{copy.title}</h2>
        <p>{copy.sub}</p>
      </header>
      <div className="main">
        {HOME_V6_ROSTER.map(({ group, rows }) => (
          <div
            className={`roster${open && rows.some((r) => r.id === open) ? ' has' : ''}`}
            key={group}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') pick(null)
            }}
          >
            <div className="mhead">
              <b>{copy.groups[group]}</b>
              <span>{copy.pro}</span>
              <span>{copy.con}</span>
            </div>
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                copy={copy}
                isOpen={open === row.id}
                onPick={pick}
                lang={lang}
                onLang={(l) => {
                  stopVoice()
                  setLang(l)
                }}
                speaking={speaking}
                onPlay={playVoice}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="gher" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- 透明底的角色图，跟着 sticky 走 */}
        <img src={HOME_V6_ASSETS.whale} alt="" />
      </div>
      <div className="gsay" aria-live="polite">
        <span className="ghost">{say}</span>
        <span className="live">{typed}</span>
      </div>
    </section>
  )
}

interface RowProps {
  row: HomeV6Row
  copy: HomeV6LineupCopy
  isOpen: boolean
  onPick: (id: HomeV6RowId | null) => void
  lang: Lang
  onLang: (l: Lang) => void
  speaking: HomeV6Voice | null
  onPlay: (key: HomeV6Voice) => void
}

function Row({
  row,
  copy,
  isOpen,
  onPick,
  lang,
  onLang,
  speaking,
  onPlay,
}: RowProps) {
  const text = copy.rows[row.id]
  const videoRef = useRef<HTMLVideoElement>(null)

  /* 视频那一行：展开就播（静音、循环），收起就停；片子快要用到才加载 */
  useEffect(() => {
    const v = videoRef.current
    if (!v || row.tray !== 'clip') return
    if (isOpen) {
      if (!v.getAttribute('src')) v.src = row.src
      v.play().catch(() => {})
    } else v.pause()
  }, [isOpen, row])

  return (
    <div
      className={`mrow${isOpen ? ' on' : ''}`}
      id={`hv6-row-${row.id}`}
      tabIndex={0}
      aria-expanded={isOpen}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onPick(row.id)
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'mouse') return
        if ((e.target as HTMLElement).closest('.tray')) return
        onPick(isOpen ? null : row.id)
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) onPick(row.id)
      }}
    >
      <div className="who">
        <span className="mk">
          <HomeV6Mark mark={row.mark} name={row.name} />
        </span>
        <b>{row.name}</b>
        {row.id === 'lora' ? <small>{copy.loraSub}</small> : null}
      </div>
      <p className="pro">
        <i>{copy.pro}</i>
        {text.pro}
      </p>
      <p className="con">
        <i>{copy.con}</i>
        {text.con}
      </p>
      <div className="tray">
        <div className="tin">
          {row.tray === 'pics'
            ? row.samples.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element -- 高度固定、宽按比例的一排小图
                <img
                  key={s.src}
                  src={s.src}
                  alt={copy.sampleAlt.replace('{name}', row.name)}
                  loading="lazy"
                  style={{ aspectRatio: s.ar }}
                />
              ))
            : null}
          {row.tray === 'clip' ? (
            <span className="vid">
              <video
                ref={videoRef}
                muted
                loop
                playsInline
                preload="none"
                poster={row.poster}
              />
            </span>
          ) : null}
          {row.tray === 'voice' ? (
            <div className="vbox">
              <div className="langs" role="group" aria-label={copy.langs}>
                {LANGS.map(([k, label]) => (
                  <button
                    type="button"
                    key={k}
                    aria-pressed={lang === k}
                    onClick={() => onLang(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="vchips">
                {HOME_V6_VOICES.map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={`vchip${speaking === key ? ' playing' : ''}`}
                    onClick={() => onPlay(key)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 40px 圆头像 */}
                    <img src={HOME_V6_ASSETS.voiceAvatar(key)} alt="" />
                    <span lang={lang}>{HOME_V6_VOICE_LINES[key][lang]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
