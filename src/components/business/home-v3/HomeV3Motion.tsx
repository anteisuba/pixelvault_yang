'use client'

import { useEffect } from 'react'

import { HOME_V3_RAIL_STEP } from '@/constants/home-v3'

/**
 * All of the v3 home's motion, in one place.
 *
 * GSAP is loaded lazily inside the effect on purpose. Per CLAUDE.md the app's
 * animation library is `motion`; GSAP is allowed only in the marketing home, and
 * only dynamically imported so it never reaches the shared client chunk.
 *
 * Nothing here is required for the page to be complete. GSAP sets each start
 * state itself at runtime (`gsap.from`), so the markup renders finished — if this
 * module fails to load, or the visitor asked for reduced motion, the page is
 * simply the static version. Two earlier attempts are worth not repeating:
 * `animation-timeline: view()` finished its range while the element was still at
 * the bottom of the screen, so it read as no motion at all; and an
 * IntersectionObserver stranded every target at `opacity: 0` whenever it did not
 * fire.
 */
export function HomeV3Motion() {
  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ])
      if (disposed) return

      gsap.registerPlugin(ScrollTrigger)

      /* Dev-only handle, stripped from production builds. Automation tabs are
         backgrounded, and a backgrounded tab freezes requestAnimationFrame
         entirely — so the pin, the slide swap and every demo loop read as "never
         happened" unless the clock can be advanced and `ScrollTrigger.update()`
         called by hand. Without this there is no way to verify the motion
         without asking a human to watch it. */
      if (process.env.NODE_ENV !== 'production') {
        Object.assign(window, { __homeV3Motion: { gsap, ScrollTrigger } })
      }

      const header = document.querySelector<HTMLElement>(
        '[data-home-v3-header]',
      )
      const tuck = header
        ? ScrollTrigger.create({
            start: 140,
            end: 'max',
            onToggle: (self) => {
              header.dataset.tucked = self.isActive ? 'true' : 'false'
            },
          })
        : undefined

      /* One reduced-motion gate for the whole set, and matchMedia reverts
         everything it created when it is torn down. */
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        /* ── load beat ──────────────────────────────────────────────────── */
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('[data-home-v3-hero-stat]', {
            y: 26,
            opacity: 0,
            duration: 0.7,
          })
          .from(
            '.home-v3-line > span',
            { yPercent: 112, duration: 1, stagger: 0.12 },
            '-=.45',
          )
          .from(
            '[data-home-v3-strip] figure',
            { y: 90, opacity: 0, scale: 0.88, duration: 1, stagger: 0.07 },
            '-=.55',
          )
          .from(
            '[data-home-v3-strip] img',
            { scale: 1.25, duration: 1.6, stagger: 0.07 },
            '<',
          )

        /* ── scroll reveals ────────────────────────────────────────────── */
        /* Travel is deliberately large: 20px of drift was reported as
           「看不到」, because at that distance a fade reads as a repaint. */
        const rise = (selector: string, vars: gsap.TweenVars = {}) => {
          gsap.utils.toArray<HTMLElement>(selector).forEach((el) => {
            gsap.from(el, {
              y: 70,
              opacity: 0,
              duration: 1,
              ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', once: true },
              ...vars,
            })
          })
        }

        rise('.home-v3-app', { y: 110, scale: 0.93, duration: 1.2 })
        rise('.home-v3-caption')
        rise('.home-v3-railsec > .home-v3-wrap > h2')
        rise('.home-v3-footer-brand')
        rise('.home-v3-footer-col', { y: 50 })

        /* ── capability stage: pinned, swaps under scroll ───────────────── */
        const stage = document.querySelector<HTMLElement>(
          '[data-home-v3-capstage]',
        )
        const slides = gsap.utils.toArray<HTMLElement>('[data-home-v3-cap]')
        const dots = gsap.utils.toArray<HTMLElement>('.home-v3-capsteps i')
        const counter = document.querySelector<HTMLElement>(
          '[data-home-v3-capcount]',
        )

        if (stage && slides.length > 1) {
          /* The absolute stacking only exists once this module is here to drive
             it — otherwise three slides would sit on top of each other. */
          stage.classList.add('is-pinned')
          gsap.set(slides.slice(1), { opacity: 0, yPercent: 10 })

          /* Declared up front and reassigned below. Patching
             `scrollTrigger.vars.onUpdate` after creation does nothing —
             ScrollTrigger has already captured the callback, which is why the
             video demo never started. */
          /* Typed structurally rather than as a ScrollTrigger instance: the
             class is only in scope inside this async body, and progress is the
             single thing the callback reads. */
          let onProgress: (self: { progress: number }) => void = () => {}

          const swap = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            scrollTrigger: {
              trigger: stage,
              start: 'top top',
              end: `+=${slides.length * 90}%`,
              /* Pin the inner box, never the animated children. */
              pin: '[data-home-v3-capstage] .home-v3-capwrap',
              scrub: 0.8,
              onUpdate: (self) => onProgress(self),
            },
          })

          slides.forEach((slide, index) => {
            if (index === 0) return
            swap
              .to(slides[index - 1], {
                opacity: 0,
                yPercent: -10,
                duration: 0.5,
              })
              .to(slide, { opacity: 1, yPercent: 0, duration: 0.5 }, '<.12')
          })

          /* Each demo performs its own capability on a loop, but only while its
             slide is the one on stage. */
          const demos = slides.map((slide) => {
            const tl = gsap.timeline({
              repeat: -1,
              repeatDelay: 0.7,
              paused: true,
            })

            // text → image: the four answers resolve in turn, winner last
            const cells = slide.querySelectorAll('.home-v3-fan figure')
            if (cells.length) {
              cells.forEach((cell) => {
                tl.fromTo(
                  cell.querySelector('img'),
                  {
                    filter: 'blur(14px) brightness(.55) saturate(.4)',
                    scale: 1.06,
                  },
                  {
                    filter: 'none',
                    scale: 1,
                    duration: 0.75,
                    ease: 'power2.out',
                  },
                  '+=.18',
                )
              })
              const picked = slide.querySelector(
                '.home-v3-fan figure[data-picked="true"] figcaption',
              )
              if (picked) {
                tl.fromTo(
                  picked,
                  { scale: 0.7, opacity: 0 },
                  {
                    scale: 1,
                    opacity: 1,
                    duration: 0.45,
                    ease: 'back.out(2.2)',
                  },
                  '-=.2',
                )
              }
            }

            // image → video: the playhead crosses, the strip marker follows
            const fill = slide.querySelector('.home-v3-vscrub i')
            const head = slide.querySelector('.home-v3-vscrub b')
            const screen = slide.querySelector('.home-v3-vscreen img')
            const frames = slide.querySelectorAll('.home-v3-vstrip figure')
            if (fill && head) {
              const clip = 5
              tl.fromTo(
                fill,
                { width: '0%' },
                { width: '100%', duration: clip, ease: 'none' },
                0,
              )
                .fromTo(
                  head,
                  { left: '0%' },
                  { left: '100%', duration: clip, ease: 'none' },
                  0,
                )
                .fromTo(
                  screen,
                  { scale: 1.02 },
                  { scale: 1.14, duration: clip, ease: 'none' },
                  0,
                )
              frames.forEach((frame, index) => {
                const at = index * (clip / frames.length)
                tl.set(frames, { opacity: 0.45 }, at).set(
                  frame,
                  { opacity: 1 },
                  at,
                )
              })
            }

            // image → 3D: the turntable lights each angle in turn
            const angles = slide.querySelectorAll('.home-v3-turn figure')
            if (angles.length) {
              gsap.set(angles, { opacity: 0.4 })
              angles.forEach((angle, index) => {
                tl.to(angles, { opacity: 0.4, duration: 0.01 }, index * 0.6).to(
                  angle,
                  { opacity: 1, duration: 0.3, ease: 'power2.out' },
                  index * 0.6,
                )
              })
              tl.to({}, { duration: 0.5 })
            }

            return tl
          })

          let playing = -1
          const runDemo = (index: number) => {
            if (index === playing) return
            playing = index
            demos.forEach((tl, i) => {
              if (i !== index) tl.pause(0)
            })
            demos[index]?.restart()
          }

          onProgress = (self) => {
            const index = Math.min(
              slides.length - 1,
              Math.round(self.progress * (slides.length - 1)),
            )
            dots.forEach((dot, i) => {
              dot.dataset.active = i === index ? 'true' : 'false'
            })
            if (counter) {
              counter.textContent = `0${index + 1} / 0${slides.length}`
            }
            runDemo(index)
          }

          runDemo(0)
          void swap
        }

        /* Rail cards arrive one after another, which is where the eye lands. */
        gsap.utils
          .toArray<HTMLElement>('.home-v3-railgroup')
          .forEach((group) => {
            gsap.from(group.querySelectorAll('.home-v3-mcard'), {
              y: 80,
              opacity: 0,
              scale: 0.94,
              duration: 0.9,
              ease: 'power3.out',
              stagger: 0.07,
              scrollTrigger: { trigger: group, start: 'top 88%', once: true },
            })
          })

        /* ── scrubbed: tied to the finger, not to a timer ───────────────── */
        gsap.to('[data-home-v3-strip]', {
          yPercent: -22,
          ease: 'none',
          /* Run from the moment the strip appears to the moment it leaves — a
             shorter range only ever produced about 25px of drift. */
          scrollTrigger: {
            trigger: '[data-home-v3-strip]',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
          },
        })

        gsap.utils.toArray<HTMLElement>('.home-v3-rail').forEach((rail) => {
          const over = rail.scrollWidth - rail.clientWidth
          if (over < 40) return
          /* Tween a proxy and write `scrollLeft` by hand. Putting it straight in
             the vars silently does nothing: it is not a CSS property, and the
             plugin that would handle it (ScrollToPlugin) is not loaded. */
          const pos = { v: 0 }
          gsap.to(pos, {
            v: over * 0.45,
            ease: 'none',
            /* `behavior: 'instant'` is required — the rail carries
               `scroll-behavior: smooth` for its arrow buttons, and that turns
               every per-frame write into its own animation, so the scrub never
               lands anywhere. */
            onUpdate: () => rail.scrollTo({ left: pos.v, behavior: 'instant' }),
            scrollTrigger: {
              trigger: rail,
              start: 'top 92%',
              end: 'bottom 30%',
              scrub: 1,
            },
          })
        })
      })

      /* The rail arrows are the page's only non-CSS interaction, so they live
         outside the reduced-motion gate: the control has to work either way,
         and `scroll-behavior` in the stylesheet decides whether it glides. */
      const arrows = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-home-v3-rail-prev], [data-home-v3-rail-next]',
        ),
      )
      const nudge = (event: Event) => {
        const button = event.currentTarget as HTMLElement
        const back = button.dataset.homeV3RailPrev
        const id = back ?? button.dataset.homeV3RailNext
        const rail = document.querySelector<HTMLElement>(
          `[data-home-v3-rail="${id}"]`,
        )
        rail?.scrollBy({ left: back ? -HOME_V3_RAIL_STEP : HOME_V3_RAIL_STEP })
      }
      arrows.forEach((button) => button.addEventListener('click', nudge))

      dispose = () => {
        arrows.forEach((button) => button.removeEventListener('click', nudge))
        mm.revert()
        tuck?.kill()
      }
    })()

    return () => {
      disposed = true
      dispose?.()
    }
  }, [])

  return null
}
