'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import type { ReferenceAnalysis } from '@/types/assistant-reference-analysis'

export function StudioOperatorReferenceAnalysisCard({
  analysis,
}: {
  analysis: ReferenceAnalysis
}) {
  const t = useTranslations('StudioOperator.referenceAnalysis')
  const brief = analysis.brief
  const sources = brief
    ? brief.assignments.map((assignment) => ({
        url: assignment.url,
        assignment,
        profile: analysis.profiles.find(
          (profile) => profile.url === assignment.url,
        ),
      }))
    : analysis.profiles.map((profile) => ({
        url: profile.url,
        profile,
        assignment: undefined,
      }))
  return (
    <section
      data-testid="operator-reference-analysis"
      className="min-w-0 space-y-3 rounded-xl border border-border p-3 text-2sm"
    >
      <p className="font-medium">{t('title')}</p>
      {brief && <p className="break-words">{brief.summary}</p>}
      {sources.map(({ url, profile, assignment }) => {
        return (
          <div key={url} className="flex min-w-0 gap-3">
            <Image
              src={url}
              alt={
                assignment?.roles.map((role) => t(role)).join(' / ') ??
                t('details')
              }
              width={48}
              height={48}
              unoptimized
              className="size-12 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1 space-y-1 break-words">
              {assignment && (
                <p className="font-medium">
                  {assignment.roles.map((role) => t(role)).join(' / ')}
                </p>
              )}
              {assignment && assignment.preserve.length > 0 && (
                <p>
                  {t('keep')}：{assignment.preserve.join('；')}
                </p>
              )}
              {assignment && assignment.exclude.length > 0 && (
                <p className="text-muted-foreground">
                  {t('exclude')}：{assignment.exclude.join('；')}
                </p>
              )}
              {profile && (
                <details open={!brief}>
                  <summary className="cursor-pointer text-muted-foreground">
                    {t('details')}
                  </summary>
                  <p>{profile.identity}</p>
                  <p>{profile.pose}</p>
                  {Object.entries(profile.style).map(
                    ([key, value]) =>
                      value && (
                        <p key={key}>
                          {t(key as keyof typeof profile.style)}：{value}
                        </p>
                      ),
                  )}
                  <p>{profile.scene}</p>
                  {profile.uncertainties.length > 0 && (
                    <p>
                      {t('uncertain')}：{profile.uncertainties.join('；')}
                    </p>
                  )}
                </details>
              )}
            </div>
          </div>
        )
      })}
      {brief && brief.requirements.length > 0 && (
        <p className="break-words">
          {t('requirements')}：{brief.requirements.join('；')}
        </p>
      )}
      {brief && brief.avoid.length > 0 && (
        <p className="break-words text-muted-foreground">
          {t('exclude')}：{brief.avoid.join('；')}
        </p>
      )}
      {brief && brief.uncertainties.length > 0 && (
        <p className="break-words text-status-warning">
          {t('uncertain')}：{brief.uncertainties.join('；')}
        </p>
      )}
    </section>
  )
}
