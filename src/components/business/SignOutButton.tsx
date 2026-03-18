'use client'

import { useClerk } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/button'

interface SignOutButtonProps {
  label: string
}

export function SignOutButton({ label }: SignOutButtonProps) {
  const { signOut } = useClerk()

  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full border-border/80 bg-card/72 px-4 text-nav font-semibold uppercase tracking-nav"
      onClick={() => signOut({ redirectUrl: ROUTES.HOME })}
    >
      <LogOut className="mr-1.5 size-3.5" />
      {label}
    </Button>
  )
}
