'use client'

import { useTranslations } from 'next-intl'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import {
  AUDIO_EXPRESSIVENESS,
  AUDIO_EXPRESSIVENESS_VALUES,
  type AudioExpressiveness,
} from '@/constants/audio-options'
import {
  AUDIO_DEFAULT_PACE,
  AUDIO_PACE,
  AUDIO_PACES,
  type AudioPace,
} from '@/constants/voice-cards'
import type { VoiceRoomDeliveryState } from '@/types/voiceroom'

/**
 * 念法参数 —— 输入行旁那颗按钮（owner 2026-08-29：参数收进输入框旁一个按钮）。
 *
 * 管的是**接下来生成的这句怎么念**，会话级、不落库。单句纠错不走这里，走气泡
 * 上的情感角标。
 *
 * ⚠ 样机上画过的「朗读风格」**故意没有**：它和情感角标写的是同一个 provider
 * 字段（`AUDIO_EMOTION` 是 `AUDIO_STYLE` 的超集，请求里只有一个 `emotion`），
 * 两处 UI 改同一个值必然打架。`audioParams.styleHint` 的原文也说它「不是独立
 * 情感参数」。留下的两项才真正与情感正交。
 *
 * ⚠ 用 `ResponsivePopover` 而不是手写浮层：细指针锚定、触屏落成半屏抽屉（正是
 * 手机切片第四帧要的那个），两条路都不用自己维护。
 */

const PACE_LABEL_KEY: Record<AudioPace, string> = {
  [AUDIO_PACE.SLOW]: 'paceSlow',
  [AUDIO_PACE.NORMAL]: 'paceNormal',
  [AUDIO_PACE.FAST]: 'paceFast',
}

const EXPRESSIVENESS_LABEL_KEY: Record<AudioExpressiveness, string> = {
  [AUDIO_EXPRESSIVENESS.AUTO]: 'expressivenessAuto',
  [AUDIO_EXPRESSIVENESS.RESTRAINED]: 'expressivenessRestrained',
  [AUDIO_EXPRESSIVENESS.NATURAL]: 'expressivenessNatural',
  [AUDIO_EXPRESSIVENESS.DRAMATIC]: 'expressivenessDramatic',
}

interface VoiceRoomDeliveryProps {
  delivery: VoiceRoomDeliveryState
  onChange: (patch: Partial<VoiceRoomDeliveryState>) => void
  disabled?: boolean
}

export function VoiceRoomDelivery({
  delivery,
  onChange,
  disabled,
}: VoiceRoomDeliveryProps) {
  const t = useTranslations('VoiceRoom')
  // 语速 / 表现力的措辞在 `audioParams` 里已经有了，不在这个域再抄一份。
  const tParams = useTranslations('audioParams')

  /** 非默认档在按钮上留个点——面板收起来后也看得出参数被动过。 */
  const touched =
    delivery.pace !== AUDIO_DEFAULT_PACE ||
    delivery.expressiveness !== AUDIO_EXPRESSIVENESS.AUTO

  return (
    <ResponsivePopover>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          className="vr-params-btn"
          data-touched={touched}
          disabled={disabled}
        >
          {t('params')}
        </button>
      </ResponsivePopoverTrigger>

      <ResponsivePopoverContent
        label={t('params')}
        // ⚠ 两个都要给：`className` 只作用于桌面 Popover，触屏落成 Drawer 时
        // 走的是 `mobileClassName`。少给一个，那条路上 `--vr-*` 一个都解析不到
        // （浮层在 portal 里，域根够不着），chip 会变成没有颜色的裸按钮。
        className="vr-params-pop"
        mobileClassName="vr-params-pop"
        align="end"
        side="top"
        sideOffset={10}
      >
        <p className="vr-params-hint">{t('paramsHint')}</p>

        <div className="vr-params-row">
          <span className="vr-params-k">{tParams('pace')}</span>
          <span className="vr-opts">
            {AUDIO_PACES.map((pace) => (
              <button
                key={pace}
                type="button"
                className="vr-opt"
                data-current={delivery.pace === pace}
                onClick={() => onChange({ pace })}
              >
                {tParams(PACE_LABEL_KEY[pace])}
              </button>
            ))}
          </span>
        </div>

        <div className="vr-params-row">
          <span className="vr-params-k">{tParams('expressiveness')}</span>
          <span className="vr-opts">
            {AUDIO_EXPRESSIVENESS_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className="vr-opt"
                data-current={delivery.expressiveness === value}
                onClick={() => onChange({ expressiveness: value })}
              >
                {tParams(EXPRESSIVENESS_LABEL_KEY[value])}
              </button>
            ))}
          </span>
          <span className="vr-params-hint">
            {tParams('expressivenessHint')}
          </span>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
