import { describe, expect, it } from 'vitest'
import {
  buildQwenImage21Workflow,
  readQwenPngDimensions,
} from './qwen-workflow-builder'

const input = {
  prompt: '一个写着千问的杯子',
  width: 1024,
  height: 1024,
  seed: 42,
  referenceImageNames: [],
}

describe('Qwen-Image-2.1 workflow', () => {
  it('builds native text conditioning and a one-image latent without SDXL loaders', () => {
    const graph = buildQwenImage21Workflow(input)
    expect(graph.encode.class_type).toBe('TextEncodeQwenImage21')
    expect(graph.latent.inputs).toEqual({
      width: 1024,
      height: 1024,
      batch_size: 1,
    })
    expect(graph.sampler.inputs).toMatchObject({
      cfg: 1,
      steps: 25,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    })
    expect(
      Object.values(graph).some(
        (node) => node.class_type === 'CheckpointLoaderSimple',
      ),
    ).toBe(false)
  })
  it('keeps all ten native editing references and uses the encoder-sized latent', () => {
    const refs = Array.from({ length: 10 }, (_, i) => `reference-${i + 1}.png`)
    const graph = buildQwenImage21Workflow({
      ...input,
      referenceImageNames: refs,
    })
    expect(graph.latent).toBeUndefined()
    expect(graph.sampler.inputs.latent_image).toEqual(['encode', 2])
    expect(graph.encode.inputs['images.image_10']).toEqual(['reference-10', 0])
    expect(graph['reference-10'].inputs.image).toBe(refs[9])
    expect(() =>
      buildQwenImage21Workflow({
        ...input,
        referenceImageNames: [...refs, 'extra.png'],
      }),
    ).toThrow('at most 10')
  })
  it('records the actual PNG dimensions instead of the requested edit dimensions', () => {
    const png = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 3, 0,
      0, 0, 4, 0,
    ])
    expect(readQwenPngDimensions(png)).toEqual({ width: 768, height: 1024 })
    expect(() => readQwenPngDimensions(new Uint8Array(24))).toThrow('not a PNG')
  })
})
