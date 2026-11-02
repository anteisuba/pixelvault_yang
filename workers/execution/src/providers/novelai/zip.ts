/**
 * NovelAI 回的是一个只装一张图的 ZIP。这里只做「把那张图拆出来」，不碰别的。
 */

async function inflateRawZipEntry(bytes: Uint8Array): Promise<Uint8Array> {
  const chunkBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(chunkBuffer).set(bytes)
  const stream = new Blob([chunkBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const ZIP_EOCD_MIN_SIZE = 22
const ZIP_MAX_COMMENT_LENGTH = 0xffff

/**
 * Locate the End Of Central Directory record by scanning backward from the
 * tail of the archive (it's the only fixed-signature record whose position
 * isn't knowable in advance, since it sits after an optional comment).
 */
function findZipEndOfCentralDirectory(zipBytes: Uint8Array): number {
  const minIndex = Math.max(
    0,
    zipBytes.length - ZIP_EOCD_MIN_SIZE - ZIP_MAX_COMMENT_LENGTH,
  )
  for (
    let index = zipBytes.length - ZIP_EOCD_MIN_SIZE;
    index >= minIndex;
    index -= 1
  ) {
    if (
      zipBytes[index] === 0x50 &&
      zipBytes[index + 1] === 0x4b &&
      zipBytes[index + 2] === 0x05 &&
      zipBytes[index + 3] === 0x06
    ) {
      return index
    }
  }
  throw new Error(
    'NovelAI ZIP response is missing its end-of-central-directory record.',
  )
}

/**
 * Extracts the sole image entry from NovelAI's ZIP response.
 *
 * ⚠ NovelAI writes the local file header in streamed form — general-purpose
 * bit 3 set, compressed/uncompressed size zeroed there — so those sizes
 * can't be trusted. An earlier version of this function guessed the
 * compressed length by scanning forward for the next `PK\x01`/`PK\x03`
 * signature; that's unsound against arbitrary compressed bytes, which can
 * coincidentally contain that 3-byte pattern (truncating the stream and
 * throwing "incomplete data" on close()) or miss it and swallow the trailing
 * data-descriptor bytes into the stream (throwing "trailing bytes after end
 * of compressed data"). The central directory — always present, always
 * fully populated — carries the authoritative compressed size regardless of
 * the local header's streaming flag, so read from there instead.
 */
export async function extractNovelAiZipImage(
  zipBytes: Uint8Array,
): Promise<Uint8Array> {
  if (
    zipBytes[0] !== 0x50 ||
    zipBytes[1] !== 0x4b ||
    zipBytes[2] !== 0x03 ||
    zipBytes[3] !== 0x04
  ) {
    throw new Error('NovelAI returned an invalid ZIP image response.')
  }

  const localView = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  )
  const localFilenameLength = localView.getUint16(26, true)
  const localExtraFieldLength = localView.getUint16(28, true)
  const dataOffset = 30 + localFilenameLength + localExtraFieldLength

  const eocdOffset = findZipEndOfCentralDirectory(zipBytes)
  const eocdView = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset + eocdOffset,
    ZIP_EOCD_MIN_SIZE,
  )
  const centralDirOffset = eocdView.getUint32(16, true)

  const centralDirView = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset + centralDirOffset,
    zipBytes.byteLength - centralDirOffset,
  )
  if (centralDirView.getUint32(0, true) !== 0x02014b50) {
    throw new Error(
      'NovelAI ZIP central directory entry has an unexpected signature.',
    )
  }
  const compressionMethod = centralDirView.getUint16(10, true)
  const compressedSize = centralDirView.getUint32(20, true)

  const compressed = zipBytes.subarray(dataOffset, dataOffset + compressedSize)
  if (compressionMethod === 0) return compressed
  if (compressionMethod === 8) return inflateRawZipEntry(compressed)
  throw new Error(
    `NovelAI ZIP compression is unsupported: ${compressionMethod}`,
  )
}
