import { useTranslations } from 'next-intl'

import { ArrowLeft, Compass } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

/**
 * 404（owner 2026-10-08「提示与弹窗」第 3 题 B）：与空态 / 出错同一个模板 ——
 * 虚线框 · 40px 白图标格 · 衬线标题 · 一句话 · 黑丸「返回首页」。
 * 404 不是出错，图标角 ⛔ 不放红点。
 */
export default function LocaleNotFound() {
  const t = useTranslations('NotFound')

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <EmptyState
        className="w-full max-w-lg"
        icon={<Compass />}
        title={t('title')}
        description={t('description')}
        action={
          <Button asChild className="rounded-full">
            <Link href={ROUTES.HOME}>
              <ArrowLeft className="size-4" aria-hidden />
              {t('backHome')}
            </Link>
          </Button>
        }
      />
    </main>
  )
}
