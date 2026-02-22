"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Coins } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/use-credits";

export function Navbar() {
  const { credits, isLoading } = useCredits();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <SignedIn>
          <Link
            href={`/en${ROUTES.STUDIO}`}
            className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            PixelVault
          </Link>
        </SignedIn>
        <SignedOut>
          <Link
            href={`/en${ROUTES.SIGN_IN}`}
            className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            PixelVault
          </Link>
        </SignedOut>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <SignedIn>
            {/* Credits — icon always visible, text hidden on mobile */}
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
              <Coins className="size-4 shrink-0 text-yellow-500" />
              <span className="hidden sm:inline">
                {isLoading ? "..." : `${credits} credits`}
              </span>
            </div>
            <UserButton />
          </SignedIn>

          <SignedOut>
            <Button asChild size="sm">
              <Link href={`/en${ROUTES.SIGN_IN}`}>Sign In</Link>
            </Button>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
