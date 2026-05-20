# TODOS

Tracked work that's been considered, sized, and deliberately deferred.

## Dataset Reuse (LoRA Training)

**What:** Add a SavedDataset Prisma model + REST endpoints + reuse flow so
users can pick a previously-uploaded training image set instead of
re-uploading the same images each time they train a new variant.

**Why:** Users iterating on a character/style LoRA usually train 5-10
variants with the same dataset (different triggers, base models, or epochs).
Re-uploading 30 high-res images every iteration wastes time and R2 egress.
PixAI ships this as a first-class feature ("Dataset reuse" dropdown on their
trainer page).

**Pros:**

- Cuts iteration friction from minutes to seconds for the power users who
  actually train multiple LoRAs.
- Closes the loop with the existing `LoraTrainingJob.trainingImageKeys`
  column — the data is already on R2, we just don't expose the reuse path.
- Matches the "Dataset reuse" placeholder card already shipped in the LoRA
  training sidebar redesign (commit `6847afcf`).

**Cons:**

- Requires new Prisma migration (`SavedDataset` model + relations).
- R2 lifecycle questions: when a SavedDataset is deleted, do we cascade-
  delete the image keys (breaks training jobs that reference them) or just
  unlink (orphans the bytes)?
- Quota: do we cap saved datasets per user? Currently `LORA_TRAINING.MAX_PER_USER = 10`,
  reusing the same number would make the UX tight if users name every batch.

**Context:** Surfaced during the `/plan-design-review` Pass 7 unresolved-
decisions round on 2026-05-20. The sidebar already has a "数据集复用 —
敬请期待" placeholder card — this TODO is the work that turns the placeholder
into a shipped feature. Estimated ~2 days of work (schema + API + service +
hook + UI wiring).

**Depends on / blocked by:** None — schema and trainer wiring are independent
of any in-flight work. Could ship as its own PR after the LoRA training
redesign lands.
