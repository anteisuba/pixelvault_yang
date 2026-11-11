import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * 多行填字框：和 `Input` 同一家——浅灰底、没边，圆角 16（ui-spec §9 输入）。
 * `bare` 给嵌在输入框里、外观由宿主出的提示词框。
 */
const FIELD =
  'rounded-16 border border-transparent bg-muted px-3.5 py-2.5 hover:bg-fill-strong focus-visible:bg-muted focus-visible:shadow-focus aria-invalid:border-destructive'
const BARE = 'border-0 bg-transparent p-0'

function Textarea({
  className,
  bare = false,
  ...props
}: React.ComponentProps<'textarea'> & { bare?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full text-base leading-relaxed text-foreground transition-[background-color,border-color,box-shadow] duration-fast outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-2sm',
        bare ? BARE : FIELD,
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
