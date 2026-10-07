'use client'

import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { Globe } from '@/components/icons'
import { useStudioChipClasses } from '@/components/business/studio-shared/primitives/tool-surface'
import { useStudioSearchGrounding } from '@/hooks/use-studio-search-grounding'
import { cn } from '@/lib/utils'

interface StudioSearchGroundingChipProps {
  disabled?: boolean
}

/**
 * 工具行左组「往这一枪里加料」的「先搜再画」（B 定稿：搜到的网页当作资料，所以
 * 开关和参考图、模板放在一组）。开着 = chip 换成「已设」灰底，输入框顶上长出
 * 虚线槽；名单里没有支持的型号时 chip 收起（宽 → 0、淡出），换回来带回刚才的开 / 关。
 */
export function StudioSearchGroundingChip({
  disabled,
}: StudioSearchGroundingChipProps) {
  const t = useTranslations('SearchGrounding')
  const chip = useStudioChipClasses()
  const { available, on, setOn } = useStudioSearchGrounding()

  return (
    <span
      data-open={available ? 'true' : 'false'}
      aria-hidden={!available}
      inert={!available}
      className={cn(
        'search-sources-slot shrink-0',
        // 收起时把左边那 6px 的间隔也一起收掉，⛔ 留一道缝。
        !available && '-ml-1.5',
      )}
    >
      {/* 内边距留给焦点环：外层收起时要裁剪，⛔ 把焦点环一起裁掉。 */}
      <span className="-m-0.5 flex p-0.5">
        <Toolbar.Button
          type="button"
          aria-pressed={on}
          disabled={disabled}
          title={t('hint')}
          onClick={() => setOn(!on)}
          className={cn(chip.trigger, chip.compact, on && chip.set)}
        >
          <Globe className="size-4" aria-hidden />
          <span className={chip.compactLabel}>{t('toggle')}</span>
        </Toolbar.Button>
      </span>
    </span>
  )
}
