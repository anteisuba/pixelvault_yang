import 'server-only'

/**
 * Standard Prisma `where` fragment that scopes a query to one owner.
 *
 * Use everywhere a service touches per-user tables (cards, recipes, projects,
 * generations, collections, ...). The lint rule in api/CLAUDE.md prefers
 * `where: ownedBy(userId)` over the inline `{ userId, ... }` literal so a
 * future refactor (multi-tenant, soft-delete, audit fields) only needs to
 * change this helper, and the human reviewer immediately sees the scoping
 * intent at the call site.
 *
 * ```ts
 * await db.characterCard.findMany({ where: ownedBy(userId) })
 * await db.recipe.findFirst({ where: { ...ownedBy(userId), id } })
 * ```
 */
export function ownedBy(userId: string): { userId: string } {
  return { userId }
}

/**
 * Same as {@link ownedBy} but for resources keyed by Clerk's external user
 * identifier instead of the internal DB id. Use this only when the table
 * actually stores `clerkId` (e.g. `User`, `UserPreference` lookups before
 * `ensureUser` resolves the DB row).
 */
export function ownedByClerk(clerkId: string): { clerkId: string } {
  return { clerkId }
}
