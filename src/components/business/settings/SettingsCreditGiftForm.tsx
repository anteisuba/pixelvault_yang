'use client'

import { useState, type FormEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { CREDIT_LIMITS } from '@/constants/credits'
import { useCreditGift } from '@/hooks/use-credit-gift'
import { toastSuccess } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * admin（owner）给朋友加点：邮箱或用户名 + 点数，一行。只在 admin 的用量页出现。
 * 平台点数第 3 片（`docs/design/platform-credits.md` §2.4）。
 */
export function SettingsCreditGiftForm({ onGranted }: { onGranted(): void }) {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const { send, isSending, error } = useCreditGift()
  const [recipient, setRecipient] = useState('')
  const [points, setPoints] = useState('')

  const amount = Number(points)
  const valid =
    recipient.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= CREDIT_LIMITS.maxGiftPoints

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || isSending) return
    const result = await send({ recipient: recipient.trim(), points: amount })
    if (!result) return
    toastSuccess(
      t('usage.giftDone', {
        name: result.displayName ?? recipient.trim(),
        points: format.number(amount),
        balance: format.number(result.balancePoints, {
          maximumFractionDigits: 1,
        }),
      }),
    )
    setRecipient('')
    setPoints('')
    onGranted()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap gap-2">
      <Input
        value={recipient}
        onChange={(event) => setRecipient(event.target.value)}
        placeholder={t('usage.giftRecipient')}
        aria-label={t('usage.giftRecipient')}
        className="min-w-0 flex-1 basis-48"
      />
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={CREDIT_LIMITS.maxGiftPoints}
        value={points}
        onChange={(event) => setPoints(event.target.value)}
        placeholder={t('usage.giftPoints')}
        aria-label={t('usage.giftPoints')}
        className="w-28"
      />
      <Button type="submit" disabled={!valid || isSending}>
        {t('usage.giftSubmit')}
      </Button>
      {error ? (
        <p className="basis-full text-xs text-destructive">{error}</p>
      ) : null}
    </form>
  )
}
