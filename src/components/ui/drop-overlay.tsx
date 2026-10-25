import { cn } from '@/lib/utils'

interface DropOverlayProps {
  /** 拖着的东西正停在这一块上。 */
  active: boolean
  /** 松手去哪（「松手加到参考图」）。 */
  label: string
  /** 圆角跟宿主走（默认 12）；位置偏移也从这里给。 */
  className?: string
}

/**
 * 上传 / 拖放落点（ui-spec §9「上传 / 拖放 `DropZone`」㉞）：拖着停在一块上，
 * 那一块描一圈黑虚线、铺浅灰，中间写松手去哪。宿主自己接拖放事件，
 * 这里只画盖在宿主上的那一层 —— 宿主要 `relative`。
 */
export function DropOverlay({ active, label, className }: DropOverlayProps) {
  return (
    <div
      aria-hidden={!active}
      data-drop-overlay
      data-active={active}
      className={cn(
        'pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-12 border-2 border-dashed border-foreground bg-muted/90 px-4 text-center text-2sm font-medium text-foreground',
        'transition duration-spring-slot ease-spring-slot motion-reduce:transition-none',
        active ? 'scale-100 opacity-100' : 'scale-98 opacity-0',
        className,
      )}
    >
      {label}
    </div>
  )
}
