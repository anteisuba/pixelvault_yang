import {
  Fraunces,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  Noto_Sans,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Serif_JP,
  Noto_Serif_SC,
} from 'next/font/google'

/**
 * The app's one Latin face. Everything in the product UI is set in it.
 *
 * ⚠ 2026-09-03: there used to be **three** identical `Geist()` declarations
 * here — `appSans` / `displayFont` / `serifFont`, byte-for-byte the same
 * config behind `--font-app-sans` / `--font-app-display` / `--font-app-serif`.
 * next/font keys its cache on the call site, not on the arguments, so that was
 * three `<link rel=preload>` + three `@font-face` sets of the same four
 * weights on every route. The two extra variables are gone; `globals.css` maps
 * the `font-display` / `font-serif` / `font-hero` Tailwind keys straight onto
 * `--font-app-sans`. **Don't reintroduce a second Geist declaration** — if a
 * surface ever needs a real display or serif face, add that *face*, not another
 * alias of this one.
 */
export const appSans = Geist({
  variable: '--font-app-sans',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

/**
 * Editorial display serif, now read only by `src/app/legal.css` — the marketing
 * hero it was added for is gone (v3 sets everything in Noto Sans). Latin glyphs
 * use Fraunces; CJK falls back to a Song/Mincho system stack so we don't ship a
 * heavy CJK webfont for a serif that appears on two legal pages.
 *
 * `preload: false` because those two pages (+ the 404) are the only consumers:
 * the variable is now mounted on `.legal-page` by `LegalPage` /
 * `LocaleNotFound`, not on the root `<body>`, so preloading it from every route
 * in the app would spend critical-path bandwidth on a face nobody there draws.
 */
export const editorialSerif = Fraunces({
  variable: '--font-editorial',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500'],
})

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const japaneseSans = Noto_Sans_JP({
  variable: '--font-japanese-sans',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Sans', 'Yu Gothic UI', 'sans-serif'],
})

export const chineseSans = Noto_Sans_SC({
  variable: '--font-chinese-sans',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
})

/**
 * Marketing homepage only (see `docs/references/pages/home.md` §A3). The Latin
 * face is deliberately Noto Sans rather than the app-wide Geist so that a mixed
 * run like「一句 prompt，」stays inside one design family with `chineseSans` /
 * `japaneseSans` — and it has to sit *before* the CJK face in the stack, or the
 * Latin gets drawn by the looser Latin bundled inside Noto Sans SC.
 *
 * The app's own Latin stays Geist; nothing outside `home-v4.css` reads these.
 *
 * `preload: false` on both (matching `homepageSerif` / `japaneseSans`): the
 * marketing home is the only route that draws them, and their variables are
 * mounted on `HomeV4Shell`'s `.home-v4` domain root rather than the app-wide
 * `<body>` — preloading from every route would put two faces the app UI never
 * uses on the critical path. The home still preloads nothing *less* than
 * before: it declares the fonts on its own subtree, so the browser fetches
 * them as soon as it hits the first rule that uses them.
 */
export const homepageSans = Noto_Sans({
  variable: '--font-home-sans',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
})

export const homepageMono = IBM_Plex_Mono({
  variable: '--font-home-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500'],
})

/**
 * v4 marketing home only — the display serif from the 2026-08-28 font board
 * (方向 B：标题走衬线). Every headline on the paging deck is set in it; body copy
 * and the data type stay on `homepageSans` / `homepageMono`.
 *
 * Only the two weights the deck actually uses. No `subsets` for the same reason
 * as `chineseSans`: a CJK face has no useful Latin-only slice, so it ships
 * unsubsetted and `preload: false` keeps it off the critical path of every other
 * route.
 *
 * Latin is drawn by this face too — unlike the sans pair, where Noto Sans has to
 * come first, Noto Serif SC's own Latin *is* Noto Serif and needs no partner.
 *
 * ⚠ **This one variable has to stay on the root `<body>`** — the other home
 * faces moved down onto `.home-v4` in 2026-09-03's font pass, this one can't:
 * VoiceRoom reads it too (`voiceroom.css` `--vr-serif`, and `.vr-flier` which
 * is mounted on `<body>` itself so it can escape the panel's overflow — see the
 * ⚠ at `voiceroom.css:1933`). A domain-scoped declaration would be out of that
 * element's ancestor chain, and custom properties only inherit down. It costs
 * nothing on other routes: `preload: false` keeps it off their critical path.
 */
export const homepageSerif = Noto_Serif_SC({
  variable: '--font-home-serif',
  weight: ['600', '900'],
  display: 'swap',
  preload: false,
  fallback: ['Songti SC', 'serif'],
})

/**
 * The same display serif for `ja`, picked by `home-v4.css` off the domain root's
 * `data-locale`.
 *
 * Noto Serif SC covers kana and shared ideographs, so Japanese *renders* without
 * this — in the wrong regional glyph forms. That is the exact bug the sans pair
 * already fixed once on the previous marketing home; shipping the serif with it
 * would be repeating it. `preload: false` means visitors on the other two
 * locales never fetch this.
 */
export const homepageSerifJapanese = Noto_Serif_JP({
  variable: '--font-home-serif-jp',
  weight: ['600', '900'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Mincho ProN', 'Yu Mincho', 'serif'],
})
