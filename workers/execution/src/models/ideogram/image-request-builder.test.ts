import { describe, expect, it } from 'vitest'
import {
  buildIdeogramImageRequest,
  parseIdeogramGeneration,
} from './image-request-builder'

const input = {
  prompt: 'Make the mug blue',
  externalModelId: 'ideogram-4-5',
  aspectRatio: '1:1',
}

describe('Ideogram 4.5 native contract', () => {
  it('submits one asynchronous square image with explicit quality and verified size', () => {
    expect(
      buildIdeogramImageRequest({
        ...input,
        advancedParams: { resolution: '2K' },
      }),
    ).toEqual({
      path: '/v2/image/generate/ideogram-4-5',
      fields: {
        prompt: input.prompt,
        quality: 'medium',
        num_images: 1,
        async: true,
        size: '2048x2048',
      },
      files: [],
    })
    expect(() =>
      buildIdeogramImageRequest({ ...input, aspectRatio: '16:9' }),
    ).toThrow('square')
    expect(() =>
      buildIdeogramImageRequest({
        ...input,
        advancedParams: { quality: 'very_low' },
      }),
    ).toThrow('quality')
  })
  it('keeps the precise source, references and mask separate and never resizes', () => {
    const request = buildIdeogramImageRequest({
      ...input,
      imageOperation: 'precise-edit',
      referenceImages: ['source', 'reference'],
      advancedParams: {
        inpaintMask: 'mask',
        resolution: '2K',
        quality: 'very_low',
        seed: 0,
      },
    })
    expect(request.path).toBe('/v2/image/precise-edit/ideogram-4-5')
    expect(request.fields).not.toHaveProperty('size')
    expect(request.fields).toMatchObject({ quality: 'very_low', seed: 0 })
    expect(request.files).toEqual([
      { url: 'source', field: 'image' },
      { url: 'reference', field: 'reference_images' },
      { url: 'mask', field: 'mask' },
    ])
  })
  it('enforces source/ref slots, masks and seeds before a billable submit', () => {
    expect(() =>
      buildIdeogramImageRequest({ ...input, imageOperation: 'precise-edit' }),
    ).toThrow('count')
    expect(() =>
      buildIdeogramImageRequest({
        ...input,
        referenceImages: ['s', 'a', 'b', 'c', 'd'],
        advancedParams: { inpaintMask: 'm' },
      }),
    ).toThrow('count')
    expect(() =>
      buildIdeogramImageRequest({
        ...input,
        advancedParams: { seed: 2147483648 },
      }),
    ).toThrow('seed')
    expect(
      buildIdeogramImageRequest({
        ...input,
        referenceImages: ['s', 'a', 'b', 'c', 'd'],
      }).fields.size,
    ).toBe('1024x1024')
  })
  it('parses pending, the real dimensions and usage without accepting unsafe or absent output', () => {
    expect(parseIdeogramGeneration({ status: 'pending' }, 'g')).toEqual({
      status: 'pending',
    })
    expect(
      parseIdeogramGeneration(
        {
          status: 'completed',
          data: [
            {
              url: 'https://ideogram.ai/result.png',
              resolution: '1672x941',
              seed: 2,
              is_image_safe: true,
            },
          ],
          usage_cost_usd_micros: 60000,
        },
        'g',
      ),
    ).toMatchObject({
      status: 'completed',
      width: 1672,
      height: 941,
      providerMetadata: {
        generationId: 'g',
        seed: 2,
        usageCostUsdMicros: 60000,
      },
    })
    expect(() =>
      parseIdeogramGeneration(
        { status: 'failed', failure_reason: 'content_policy_violation' },
        'g',
      ),
    ).toThrow('content_policy_violation')
    expect(() =>
      parseIdeogramGeneration(
        { status: 'completed', data: [{ is_image_safe: false }] },
        'g',
      ),
    ).toThrow('filtered')
    expect(() =>
      parseIdeogramGeneration({ status: 'completed', data: [] }, 'g'),
    ).toThrow('valid image')
  })
})
