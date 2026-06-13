import { describe, expect, it } from 'vitest'

import {
  createProviderPayloadError,
  createProviderResponseError,
} from '../../workers/execution/src/lib/provider-error'

describe('execution worker provider error classification', () => {
  it('classifies fal locked-account balance errors as insufficient balance before auth errors', async () => {
    const error = await createProviderResponseError(
      new Response(
        JSON.stringify({
          detail:
            'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
        }),
        { status: 403 },
      ),
      {
        provider: 'fal',
        phase: 'submit',
        fallbackMessage: 'FAL submission failed.',
      },
    )

    expect(error.errorCode).toBe('provider_insufficient_balance')
    expect(error.message).toContain('Exhausted balance')
  })

  it('does not treat nullable provider error fields as failure markers', () => {
    const error = createProviderPayloadError(
      {
        status: 'COMPLETED',
        error: null,
        error_type: null,
        failureCode: null,
        blockReason: null,
      },
      {
        provider: 'replicate',
        phase: 'status',
        fallbackMessage: 'Prediction failed.',
      },
    )

    expect(error).toBeNull()
  })
})
