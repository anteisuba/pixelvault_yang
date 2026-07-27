import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOME_V3_LORA } from '@/constants/home-v3'

const SHOT_LABEL_KEY = {
  front: 'shotFront',
  profile: 'shotProfile',
  waist: 'shotWaist',
} as const

/** The assembly bench: base model, weighted LoRA stack, trigger words, one set out. */
export function HomeV3ViewLora() {
  const t = useTranslations('Homepage.loraView')

  return (
    <>
      <div className="home-v3-assembly">
        <p className="home-v3-sublabel">{t('base')}</p>
        <div className="home-v3-base">
          <Image src={HOME_V3_LORA.baseShot} alt="" width={88} height={88} />
          <div>
            <b>{HOME_V3_LORA.baseName}</b>
            <span>{HOME_V3_LORA.baseMeta}</span>
          </div>
        </div>

        <p className="home-v3-sublabel">{t('stack')}</p>
        {HOME_V3_LORA.stack.map((entry) => (
          <div className="home-v3-lora-row" key={entry.name}>
            <header>
              <span>{entry.name}</span>
              <b>{entry.weight.toFixed(2)}</b>
            </header>
            <div className="home-v3-lora-track">
              <i style={{ width: `${entry.weight * 100}%` }} />
            </div>
          </div>
        ))}

        <p className="home-v3-sublabel">{t('triggers')}</p>
        <div className="home-v3-triggers">
          {HOME_V3_LORA.triggers.map((word) => (
            <span key={word}>{word}</span>
          ))}
        </div>

        <button type="button" className="home-v3-generate">
          {t('generateSet')}
        </button>
      </div>

      <div className="home-v3-lora-out">
        <div className="home-v3-lora-grid">
          {HOME_V3_LORA.shots.map((shot) => (
            <figure key={shot.id}>
              <Image
                src={HOME_V3_LORA.shotSource}
                alt=""
                width={300}
                height={420}
                style={{
                  objectPosition: shot.objectPosition,
                  transform: `scale(${shot.scale})`,
                  filter: `brightness(${shot.brightness})`,
                }}
              />
              <figcaption>{t(SHOT_LABEL_KEY[shot.id])}</figcaption>
            </figure>
          ))}
        </div>

        <div className="home-v3-lora-foot">
          <span>{t('footA')}</span>
          <span>{t('footB')}</span>
        </div>
      </div>
    </>
  )
}
