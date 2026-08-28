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

export const appSans = Geist({
  variable: '--font-app-sans',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const displayFont = Geist({
  variable: '--font-app-display',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const serifFont = Geist({
  variable: '--font-app-serif',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

/**
 * Editorial display serif, now read only by `src/app/legal.css` — the marketing
 * hero it was added for is gone (v3 sets everything in Noto Sans). Latin glyphs
 * use Fraunces; CJK falls back to a Song/Mincho system stack so we don't ship a
 * heavy CJK webfont for a serif that appears on two legal pages.
 */
export const editorialSerif = Fraunces({
  variable: '--font-editorial',
  subsets: ['latin'],
  display: 'swap',
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
 */
export const homepageSans = Noto_Sans({
  variable: '--font-home-sans',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const homepageMono = IBM_Plex_Mono({
  variable: '--font-home-mono',
  subsets: ['latin'],
  display: 'swap',
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
