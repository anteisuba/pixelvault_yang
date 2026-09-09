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
  return (
    <section
      data-testid="operator-reference-analysis"
      className="min-w-0 space-y-3 rounded-xl border border-border p-3 text-2sm"
    >
      <p className="font-medium">{t('title')}</p>
      <p className="break-words">{analysis.brief.summary}</p>
      {analysis.brief.assignments.map((assignment) => {
        const profile = analysis.profiles.find(
          (item) => item.url === assignment.url,
        )
        return (
          <div key={assignment.url} className="flex min-w-0 gap-3">
            <Image
              src={assignment.url}
              alt={assignment.roles.map((role) => t(role)).join(' / ')}
              width={48}
              height={48}
              unoptimized
              className="size-12 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1 space-y-1 break-words">
              <p className="font-medium">
                {assignment.roles.map((role) => t(role)).join(' / ')}
              </p>
              {assignment.preserve.length > 0 && (
                <p>
                  {t('keep')}：{assignment.preserve.join('；')}
                </p>
              )}
              {assignment.exclude.length > 0 && (
                <p className="text-muted-foreground">
                  {t('exclude')}：{assignment.exclude.join('；')}
                </p>
              )}
              {profile && (
                <details>
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
      {analysis.brief.requirements.length > 0 && (
        <p className="break-words">
          {t('requirements')}：{analysis.brief.requirements.join('；')}
        </p>
      )}
      {analysis.brief.avoid.length > 0 && (
        <p className="break-words text-muted-foreground">
          {t('exclude')}：{analysis.brief.avoid.join('；')}
        </p>
      )}
      {analysis.brief.uncertainties.length > 0 && (
        <p className="break-words text-status-warning">
          {t('uncertain')}：{analysis.brief.uncertainties.join('；')}
        </p>
      )}
    </section>
  )
}
