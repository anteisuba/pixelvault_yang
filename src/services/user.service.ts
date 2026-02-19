import "server-only";

import { db } from "@/lib/db";
import type { User } from "@/lib/generated/prisma/client";

export type { User };

// ─── Service Functions ────────────────────────────────────────────

export async function getUserByClerkId(
  clerkId: string,
): Promise<User | null> {
  return db.user.findUnique({
    where: { clerkId },
  });
}

export async function createUser(params: {
  clerkId: string;
  email: string;
}): Promise<User> {
  return db.user.create({
    data: {
      clerkId: params.clerkId,
      email: params.email,
    },
  });
}

export async function getUserCredits(clerkId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { credits: true },
  });

  return user?.credits ?? 0;
}

export async function deductCredits(
  clerkId: string,
  amount: number,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { credits: true },
  });

  if (!user || user.credits < amount) {
    throw new Error("INSUFFICIENT_CREDITS");
  }

  await db.user.update({
    where: { clerkId },
    data: { credits: { decrement: amount } },
  });
}

export async function addCredits(
  clerkId: string,
  amount: number,
): Promise<void> {
  await db.user.update({
    where: { clerkId },
    data: { credits: { increment: amount } },
  });
}
