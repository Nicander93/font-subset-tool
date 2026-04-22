import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { init as initSubset, subset } from 'hb-subset-wasm'
import { init as initWoff2, encode } from 'woff2-encode-wasm'
import opentype from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

const createGlyph = (unicode: number, name: string) => {
  const glyphPath = new opentype.Path()
  glyphPath.moveTo(0, 0)
  glyphPath.lineTo(0, 700)
  glyphPath.lineTo(500, 700)
  glyphPath.lineTo(500, 0)
  glyphPath.close()

  return new opentype.Glyph({
    name,
    unicode,
    advanceWidth: 600,
    path: glyphPath,
  })
}

const createTestFontBytes = (): Uint8Array => {
  const notdef = new opentype.Glyph({
    name: '.notdef',
    advanceWidth: 600,
    path: new opentype.Path(),
  })

  const font = new opentype.Font({
    familyName: 'SubsetSpecFont',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      notdef,
      createGlyph('A'.codePointAt(0)!, 'A'),
      createGlyph('你'.codePointAt(0)!, 'uni4F60'),
      createGlyph('好'.codePointAt(0)!, 'uni597D'),
      createGlyph('界'.codePointAt(0)!, 'uni754C'),
    ],
  })

  return new Uint8Array(font.toArrayBuffer())
}

const containsCodePoint = (fontBytes: Uint8Array, codePoint: number): boolean => {
  const parsed = opentype.parse(toArrayBuffer(fontBytes))
  const glyph = parsed.charToGlyph(String.fromCodePoint(codePoint))
  return glyph.index !== 0
}

beforeAll(async () => {
  const hbWasmPath = path.resolve(
    process.cwd(),
    'node_modules/hb-subset-wasm/dist/hb-subset.wasm',
  )
  const woff2WasmPath = path.resolve(
    process.cwd(),
    'node_modules/woff2-encode-wasm/dist/encoder.wasm',
  )

  const [hbWasmBytes, woff2WasmBytes] = await Promise.all([
    readFile(hbWasmPath),
    readFile(woff2WasmPath),
  ])

  await initSubset(hbWasmBytes)
  await initWoff2(woff2WasmBytes)
})

describe('subset pipeline e2e', () => {
  it('真实子集化链路可通过完整性校验', async () => {
    const sourceFont = createTestFontBytes()
    const requiredChars = ['A', '你', '好']
    const requiredUnicodes = requiredChars.map((char) => char.codePointAt(0)!)

    const subsetBytes = await subset(sourceFont, {
      unicodes: requiredUnicodes,
      noHinting: true,
    })

    requiredUnicodes.forEach((codePoint) => {
      expect(containsCodePoint(subsetBytes, codePoint)).toBe(true)
    })
    expect(containsCodePoint(subsetBytes, '界'.codePointAt(0)!)).toBe(false)

    const woff2Bytes = await encode(subsetBytes)
    const signature = String.fromCharCode(
      woff2Bytes[0],
      woff2Bytes[1],
      woff2Bytes[2],
      woff2Bytes[3],
    )

    expect(signature).toBe('wOF2')
    expect(woff2Bytes.length).toBeGreaterThan(0)
  })
})
