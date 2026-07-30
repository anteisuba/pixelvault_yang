'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useLocale } from 'next-intl'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Link } from '@/i18n/navigation'

export interface HomeV3ModelCardViewModel {
  id: string
  name: string
  description: string
  shot: string
  shotKind: 'brand' | 'artwork'
  price: string
  provider: string
  modality: string
  advantages: string[]
  href: string
  officialUrl?: string
  viewDetailsLabel: string
}

export interface HomeV3ModelDetailLabels {
  canDo: string
  advantages: string
  provider: string
  pricing: string
  modality: string
  openStudio: string
  officialDocs: string
  close: string
}

interface HomeV3ModelRailProps {
  railId: string
  models: HomeV3ModelCardViewModel[]
  labels: HomeV3ModelDetailLabels
}

export function HomeV3ModelRail({
  railId,
  models,
  labels,
}: HomeV3ModelRailProps) {
  const locale = useLocale()
  const [selectedModel, setSelectedModel] =
    useState<HomeV3ModelCardViewModel | null>(null)

  return (
    <>
      <div className="home-v3-rail" data-home-v3-rail={railId}>
        {models.map((model) => (
          <button
            type="button"
            className="home-v3-mcard"
            key={model.id}
            aria-haspopup="dialog"
            aria-label={model.viewDetailsLabel}
            onClick={() => setSelectedModel(model)}
          >
            <Image
              className={
                model.shotKind === 'brand'
                  ? 'home-v3-model-brand-art'
                  : undefined
              }
              src={model.shot}
              alt=""
              width={320}
              height={320}
            />
            <span className="home-v3-mcard-top">
              <b>{model.name}</b>
              <span>{model.price}</span>
            </span>
            <span className="home-v3-mcard-provider">{model.provider}</span>
          </button>
        ))}
      </div>

      <ResponsiveDialog
        open={selectedModel !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedModel(null)
        }}
      >
        {selectedModel ? (
          <ResponsiveDialogContent
            className="home-v3-model-dialog"
            mobileBodyClassName="home-v3-model-dialog-mobile"
            closeLabel={labels.close}
            data-locale={locale}
          >
            <div className="home-v3-model-dialog-grid">
              <div className="home-v3-model-dialog-media">
                <Image
                  className={
                    selectedModel.shotKind === 'brand'
                      ? 'home-v3-model-brand-art'
                      : undefined
                  }
                  src={selectedModel.shot}
                  alt=""
                  width={720}
                  height={720}
                />
              </div>

              <div className="home-v3-model-dialog-body">
                <p className="home-v3-model-dialog-kicker">
                  {selectedModel.modality} · {selectedModel.provider}
                </p>
                <ResponsiveDialogTitle className="home-v3-model-dialog-title">
                  {selectedModel.name}
                </ResponsiveDialogTitle>

                <section className="home-v3-model-dialog-section">
                  <h3>{labels.canDo}</h3>
                  <ResponsiveDialogDescription className="home-v3-model-dialog-description">
                    {selectedModel.description}
                  </ResponsiveDialogDescription>
                </section>

                <section className="home-v3-model-dialog-section">
                  <h3>{labels.advantages}</h3>
                  <ul className="home-v3-model-advantages">
                    {selectedModel.advantages.map((advantage) => (
                      <li key={advantage}>{advantage}</li>
                    ))}
                  </ul>
                </section>

                <dl className="home-v3-model-facts">
                  <div>
                    <dt>{labels.provider}</dt>
                    <dd>{selectedModel.provider}</dd>
                  </div>
                  <div>
                    <dt>{labels.pricing}</dt>
                    <dd>{selectedModel.price}</dd>
                  </div>
                  <div>
                    <dt>{labels.modality}</dt>
                    <dd>{selectedModel.modality}</dd>
                  </div>
                </dl>

                <div className="home-v3-model-dialog-actions">
                  <Link
                    className="home-v3-model-dialog-primary"
                    href={selectedModel.href}
                  >
                    {labels.openStudio}
                  </Link>
                  {selectedModel.officialUrl ? (
                    <a
                      className="home-v3-model-dialog-secondary"
                      href={selectedModel.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {labels.officialDocs}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </ResponsiveDialogContent>
        ) : null}
      </ResponsiveDialog>
    </>
  )
}
