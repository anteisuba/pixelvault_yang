import { describe, expect, it } from 'vitest'

import {
  atempoChain,
  buildFilterGraph,
  FG_BLACK_FADE_SEC,
  FG_CROSSFADE_SEC,
  type FgAudioSegment,
  type FgPlan,
  type FgVideoSegment,
} from './filtergraph'
import {
  buildEncodeCommand,
  buildNormalizeCommand,
  buildPosterCommand,
  parseFfmpegProgress,
} from './ffmpeg-commands'

function videoSegment(
  id: string,
  patch: Partial<FgVideoSegment> = {},
): FgVideoSegment {
  return {
    id,
    durationSec: 4,
    muted: false,
    transitionOut: 'none',
    ...patch,
  }
}

function audioSegment(
  id: string,
  patch: Partial<FgAudioSegment> = {},
): FgAudioSegment {
  return {
    id,
    startSec: 0,
    durationSec: 4,
    gain: 1,
    speed: 1,
    ...patch,
  }
}

function plan(patch: Partial<FgPlan> = {}): FgPlan {
  return { video: [], audio: [], music: [], ...patch }
}

describe('atempoChain', () => {
  it('1× 不产生任何 atempo', () => {
    expect(atempoChain(1)).toEqual([])
  })

  it('区间内一次搞定', () => {
    expect(atempoChain(2)).toEqual(['atempo=2'])
    expect(atempoChain(0.5)).toEqual(['atempo=0.5'])
    expect(atempoChain(1.5)).toEqual(['atempo=1.5'])
  })

  it('>2 串联 —— 直接写 atempo=3 会让 ffmpeg 拒绝整张图', () => {
    expect(atempoChain(3)).toEqual(['atempo=2', 'atempo=1.5'])
    expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2'])
  })

  it('<0.5 反向串联', () => {
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5'])
  })

  it('非法值当作 1×', () => {
    expect(atempoChain(0)).toEqual([])
    expect(atempoChain(Number.NaN)).toEqual([])
  })
})

describe('buildFilterGraph · 硬切', () => {
  it('两段硬切 —— 画面与原声各 concat 一次', () => {
    const graph = buildFilterGraph(
      plan({ video: [videoSegment('a'), videoSegment('b')] }),
    )
    expect(graph.filter).toBe(
      [
        '[0:v]null[v0]',
        '[0:a]volume=1[a0]',
        '[1:v]null[v1]',
        '[1:a]volume=1[a1]',
        '[v0][v1]concat=n=2:v=1:a=0[vx1]',
        '[a0][a1]concat=n=2:v=0:a=1[ax1]',
      ].join(';'),
    )
    expect(graph.videoLabel).toBe('[vx1]')
    expect(graph.audioLabel).toBe('[ax1]')
    expect(graph.totalDurationSec).toBe(8)
  })

  it('静音段 → volume=0（⛔ 不是少接一路）', () => {
    const graph = buildFilterGraph(
      plan({ video: [videoSegment('a', { muted: true })] }),
    )
    expect(graph.filter).toBe('[0:v]null[v0];[0:a]volume=0[a0]')
  })
})

describe('buildFilterGraph · 叠化', () => {
  it('offset = 已折叠时长 - 叠化时长；总时长扣一次', () => {
    const graph = buildFilterGraph(
      plan({
        video: [
          videoSegment('a', { transitionOut: 'crossfade' }),
          videoSegment('b'),
        ],
      }),
    )
    expect(graph.filter).toBe(
      [
        '[0:v]null[v0]',
        '[0:a]volume=1[a0]',
        '[1:v]null[v1]',
        '[1:a]volume=1[a1]',
        '[v0][v1]xfade=transition=fade:duration=0.5:offset=3.5[vx1]',
        '[a0][a1]acrossfade=d=0.5:c1=tri:c2=tri[ax1]',
      ].join(';'),
    )
    expect(graph.totalDurationSec).toBe(8 - FG_CROSSFADE_SEC)
  })

  it('段比叠化还短时叠化被压到段长 —— ⛔ 不出负偏移', () => {
    const graph = buildFilterGraph(
      plan({
        video: [
          videoSegment('a', { transitionOut: 'crossfade', durationSec: 0.2 }),
          videoSegment('b'),
        ],
      }),
    )
    expect(graph.filter).toContain('duration=0.2:offset=0')
    expect(graph.totalDurationSec).toBe(4)
  })
})

describe('buildFilterGraph · 黑场', () => {
  it('前一段淡出、后一段淡入，音画同步，时长不扣', () => {
    const graph = buildFilterGraph(
      plan({
        video: [
          videoSegment('a', { transitionOut: 'black' }),
          videoSegment('b'),
        ],
      }),
    )
    const st = String(4 - FG_BLACK_FADE_SEC)
    expect(graph.filter).toBe(
      [
        `[0:v]fade=t=out:st=${st}:d=0.35[v0]`,
        `[0:a]afade=t=out:st=${st}:d=0.35,volume=1[a0]`,
        '[1:v]fade=t=in:st=0:d=0.35[v1]',
        '[1:a]afade=t=in:st=0:d=0.35,volume=1[a1]',
        '[v0][v1]concat=n=2:v=1:a=0[vx1]',
        '[a0][a1]concat=n=2:v=0:a=1[ax1]',
      ].join(';'),
    )
    expect(graph.totalDurationSec).toBe(8)
  })
})

describe('buildFilterGraph · 语音与配乐层', () => {
  it('adelay 用毫秒 + all=1，amix 带权重且 normalize=0', () => {
    const graph = buildFilterGraph(
      plan({
        video: [videoSegment('a')],
        audio: [audioSegment('voice', { startSec: 1.25 })],
        music: [audioSegment('bgm', { gain: 0.5, speed: 3 })],
      }),
    )
    expect(graph.filter).toBe(
      [
        '[0:v]null[v0]',
        '[0:a]volume=1[a0]',
        '[1:a]adelay=1250:all=1[la1]',
        '[2:a]atempo=2,atempo=1.5,volume=0.5,adelay=0:all=1[lm2]',
        '[a0][la1][lm2]amix=inputs=3:duration=first:dropout_transition=0:weights=1 1.4 0.35:normalize=0[amix]',
      ].join(';'),
    )
    expect(graph.audioLabel).toBe('[amix]')
  })

  it('没有声音层时不出 amix —— 成片音频就是画面轨自己的', () => {
    const graph = buildFilterGraph(plan({ video: [videoSegment('a')] }))
    expect(graph.filter).not.toContain('amix')
    expect(graph.audioLabel).toBe('[a0]')
  })
})

describe('buildFilterGraph · 失败', () => {
  it('空表', () => {
    expect(() => buildFilterGraph(plan())).toThrow('filtergraph: no video')
  })
})

describe('buildNormalizeCommand', () => {
  it('-ss / -to 在 -i 前（输入侧裁剪），并统一 scale / fps / format / timebase', () => {
    const args = buildNormalizeCommand({
      src: '/tmp/src/a.mp4',
      dest: '/tmp/norm/0.mp4',
      in: 2,
      out: 6,
      speed: 1,
      width: 1920,
      height: 1080,
      fps: 25,
    })
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args.indexOf('-to')).toBeLessThan(args.indexOf('-i'))
    expect(args[args.indexOf('-vf') + 1]).toBe(
      'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=25,format=yuv420p,settb=1/90000,setpts=PTS-STARTPTS',
    )
    expect(args.at(-1)).toBe('/tmp/norm/0.mp4')
  })

  it('变速：画面 setpts、声音 atempo 串联，时长按变速后算', () => {
    const args = buildNormalizeCommand({
      src: '/tmp/src/a.mp4',
      dest: '/tmp/norm/0.mp4',
      in: 0,
      out: 6,
      speed: 3,
      width: 1280,
      height: 720,
      fps: 25,
    })
    expect(args[args.indexOf('-vf') + 1]).toContain('setpts=PTS/3')
    expect(args[args.indexOf('-af') + 1]).toBe(
      'aresample=48000,atempo=2,atempo=1.5,asetpts=PTS-STARTPTS',
    )
    // ⚠ 静音那一路的 `-t` 是**变速前**的长度（atempo 会把它一起缩放）。
    expect(args[args.indexOf('-t') + 1]).toBe('6')
    // ⚠ 输出选项排在所有 `-i` 之后 —— 夹在两个输入之间 ffmpeg 会拒绝整条命令。
    expect(args.lastIndexOf('-i')).toBeLessThan(args.indexOf('-vf'))
  })
})

describe('buildEncodeCommand', () => {
  it('输入顺序 = 滤镜图定义的顺序；带 -progress 时同时关掉 -stats', () => {
    const args = buildEncodeCommand({
      inputs: ['/tmp/norm/0.mp4', '/tmp/src/voice.mp3'],
      plan: plan({ video: [videoSegment('a')], audio: [audioSegment('v')] }),
      dest: '/tmp/out.mp4',
      fps: 25,
      progressPath: '/tmp/progress',
    })
    expect(args.filter((arg) => arg === '-i')).toHaveLength(2)
    expect(args[args.indexOf('-map') + 1]).toBe('[v0]')
    expect(args).toContain('-progress')
    expect(args).toContain('-nostats')
    expect(args).toContain('+faststart')
    expect(args.at(-1)).toBe('/tmp/out.mp4')
  })

  it('LGPL 边界：编码器是 libopenh264，⛔ 不是 libx264', () => {
    const args = buildEncodeCommand({
      inputs: ['/tmp/norm/0.mp4'],
      plan: plan({ video: [videoSegment('a')] }),
      dest: '/tmp/out.mp4',
      fps: 25,
    })
    expect(args[args.indexOf('-c:v') + 1]).toBe('libopenh264')
    expect(args).not.toContain('libx264')
  })
})

describe('buildPosterCommand', () => {
  it('抽帧时刻可控 —— 黑场开头别抽到全黑', () => {
    expect(buildPosterCommand('/tmp/out.mp4', '/tmp/poster.jpg', 0.5)).toEqual([
      '-hide_banner',
      '-nostdin',
      '-y',
      '-ss',
      '0.5',
      '-i',
      '/tmp/out.mp4',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '/tmp/poster.jpg',
    ])
  })
})

describe('parseFfmpegProgress', () => {
  it('out_time_us / 总时长', () => {
    expect(
      parseFfmpegProgress('out_time_us=5000000\nprogress=continue', 10),
    ).toBe(0.5)
  })

  it('progress=end → 1', () => {
    expect(parseFfmpegProgress('out_time_us=1\nprogress=end', 10)).toBe(1)
  })

  it('这一块里没有时间码 → null（「不知道」不是「刚开始」）', () => {
    expect(parseFfmpegProgress('frame=12\nfps=30', 10)).toBeNull()
    expect(parseFfmpegProgress('out_time_us=1', 0)).toBeNull()
  })
})

describe('overallProgress', () => {
  it('六步等权，编码那一步内部再插值', async () => {
    const { overallProgress } = await import('../index')
    expect(overallProgress('download', 0)).toBe(0)
    expect(overallProgress('download', 1)).toBeCloseTo(1 / 6, 2)
    expect(overallProgress('encode', 0.5)).toBeCloseTo(3.5 / 6, 2)
    expect(overallProgress('upload', 1)).toBe(1)
  })
})
