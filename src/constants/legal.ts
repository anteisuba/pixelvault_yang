import { ROUTES } from '@/constants/routes'

/**
 * Display-surface legal pages. Content lives in the `Legal` i18n namespace
 * (title / intro / sections[] per doc); this file only owns the doc ids and
 * their routes so the page + footer stay type-safe.
 */
export const LEGAL_DOCS = ['privacy', 'terms'] as const

export type LegalDoc = (typeof LEGAL_DOCS)[number]

export const LEGAL_DOC_ROUTES: Record<LegalDoc, string> = {
  privacy: ROUTES.PRIVACY,
  terms: ROUTES.TERMS,
}

/**
 * One section of a legal document, as stored in the i18n `sections` array.
 *
 * `items` is optional and renders as a list under the body. Several clauses are
 * enumerations by nature — what you may not generate, who processes your data,
 * which rights you can exercise — and a reader scanning for one entry should not
 * have to parse it out of a paragraph.
 */
export interface LegalSection {
  heading: string
  body: string
  items?: string[]
}
