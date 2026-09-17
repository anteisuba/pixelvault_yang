'use client'

import {
  AssetDetailContent,
  type AssetDetailContentProps,
} from '@/components/business/AssetDetailContent'

type AssetDetailSheetProps = Omit<
  AssetDetailContentProps,
  'layout' | 'onOpenChange'
> & {
  onOpenChange: (open: boolean) => void
}

/**
 * Drawer shell for an /assets tile — the body itself lives in
 * `AssetDetailContent`, which the `/assets/[id]` page renders with the
 * same props under a full-page shell.
 */
export function AssetDetailSheet(props: AssetDetailSheetProps) {
  return <AssetDetailContent {...props} layout="sheet" />
}
