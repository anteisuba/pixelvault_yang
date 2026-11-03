import { describe, expect, it } from 'vitest'

import {
  extractFalDetailMessage,
  extractFalErrorMessage,
  isFalErrorBody,
} from './fal-webhook-body'

describe('FAL webhook error helpers', () => {
  it('detects documented webhook error bodies', () => {
    expect(
      isFalErrorBody({
        request_id: 'req_123',
        status: 'ERROR',
        error: 'Invalid status code: 422',
        payload: {
          detail: [
            {
              loc: ['body', 'prompt'],
              msg: 'field required',
              type: 'value_error.missing',
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('joins FAL detail arrays using type and message', () => {
    expect(
      extractFalDetailMessage([
        {
          loc: ['body', 'prompt'],
          msg: 'field required',
          type: 'value_error.missing',
        },
        {
          msg: 'duration is too short',
        },
      ]),
    ).toBe('value_error.missing: field required; duration is too short')
  })

  it('prefers direct error text and falls back to payload detail', () => {
    expect(
      extractFalErrorMessage({
        status: 'ERROR',
        payload: {
          detail: [
            {
              msg: 'field required',
              type: 'value_error.missing',
            },
          ],
        },
      }),
    ).toBe('value_error.missing: field required')

    expect(
      extractFalErrorMessage({
        status: 'ERROR',
        error: 'Invalid status code: 422',
        payload: {
          detail: [{ msg: 'field required', type: 'value_error.missing' }],
        },
      }),
    ).toBe('Invalid status code: 422')
  })
})
