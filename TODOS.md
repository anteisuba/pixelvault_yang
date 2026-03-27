# TODOS

## Social & Growth (D3+)

### Feed/Timeline Based on Follows

**What:** Build a personalized feed page showing recent public images from followed creators.

**Why:** Follow feature (D3) builds the social graph, but without a feed there's no way to consume it. Users who follow creators have no reason to check back — a feed closes the engagement loop.

**Context:** D3 ships UserFollow model + toggle API. Feed would query `SELECT generations WHERE userId IN (SELECT followingId FROM UserFollow WHERE followerId = ?) AND isPublic = true ORDER BY createdAt DESC`. Needs pagination, empty state ("follow creators to see their work here"), and a new `/feed` page. Consider ISR or client-side polling for freshness.

**Effort:** M
**Priority:** P2
**Depends on:** D3 Creator Profile (UserFollow model)

### Creator Analytics Dashboard

**What:** Dashboard showing creators their profile stats — views, likes received, follower growth, top-performing images.

**Why:** Creators who see their impact stay engaged. Analytics also inform which content to create more of. Currently there's no feedback mechanism beyond manual counting.

**Context:** Needs aggregation queries on UserLike, UserFollow, and page view tracking (not yet implemented). Start with simple counts; time-series charts are Phase 2. Could live at `/profile/analytics` or a tab on the existing `/profile` page. View tracking requires either a lightweight analytics service or piggybacking on the existing ApiUsageLedger pattern.

**Effort:** L
**Priority:** P3
**Depends on:** D3 Creator Profile (UserLike, UserFollow models), page view tracking (not yet built)

### Publish-to-Earn Credits

**What:** Reward creators with platform credits when they share images publicly that receive engagement (likes, profile visits).

**Why:** Incentivizes public sharing, which grows the Gallery content pool and drives SEO/organic traffic. Creates a virtuous cycle: share → get likes → earn credits → generate more → share more.

**Context:** Blocked by Phase E credit system (Stripe/LemonSqueezy integration). Design decisions needed: credit formula (flat per-share vs engagement-weighted), abuse prevention (spam sharing for credits), and cap per period. The Generation model already has `isPublic` toggle — the trigger would be flipping to public + receiving N likes.

**Effort:** L
**Priority:** P3
**Depends on:** Phase E Credits & Billing, D3 Creator Profile (Like system)

### Creator Reputation & Badges

**What:** Badge system recognizing creator milestones — "First 10 Likes", "100 Followers", "Prolific Creator (50+ public images)", style-specific badges.

**Why:** Gamification drives engagement. Badges on profile pages signal credibility to other users. Creates aspiration targets.

**Context:** Premature without engagement metrics — need at least a few months of D3 data to calibrate meaningful thresholds. Badge definitions should be data-driven, not arbitrary. Implementation: Badge model with criteria JSON, background job to evaluate and award. Display on ProfileHeader component.

**Effort:** M
**Priority:** P4
**Depends on:** D3 Creator Profile, Creator Analytics (for threshold calibration)
