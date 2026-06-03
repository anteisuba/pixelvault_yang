import { describe, expect, it } from 'vitest'

import { IMAGE_GENERATION } from '@/constants/config'
import { EXECUTION_WORKER } from '@/constants/execution'

describe('IMAGE_GENERATION poll window', () => {
  // Regression guard for the async-image bug: the worker is dispatched with
  // timeoutMs = EXECUTION_WORKER.DEFAULT_TIMEOUT_MS and only sends a terminal
  // callback once it finishes (or itself times out). If the frontend poll
  // window is shorter, slow generations (e.g. gpt-image-2 multi-reference edits
  // at ~3 min) get marked failed in the UI while the worker keeps running and
  // the image silently lands in the gallery. The poll window MUST out-wait the
  // worker plus a margin for the callback + R2 finalize roundtrip.
  it('out-waits the worker timeout', () => {
    const pollWindowMs =
      IMAGE_GENERATION.MAX_POLL_ATTEMPTS * IMAGE_GENERATION.POLL_INTERVAL_MS

    expect(pollWindowMs).toBeGreaterThanOrEqual(
      EXECUTION_WORKER.DEFAULT_TIMEOUT_MS,
    )
  })
})
