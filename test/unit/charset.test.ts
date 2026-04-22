import { describe, expect, it } from 'vitest'
import {
  buildUnicodeList,
  COMMON_3500_COUNT,
  getOutputName,
  toUnicodeSet,
} from '../../src/core/charset'

describe('charset helpers', () => {
  it('toUnicodeSet 会按 code point 去重并保留顺序', () => {
    const result = toUnicodeSet('你你A😊A好😊')
    expect(result).toEqual([
      '你'.codePointAt(0),
      'A'.codePointAt(0),
      '😊'.codePointAt(0),
      '好'.codePointAt(0),
    ])
  })

  it('常用字预设为 3500 个', () => {
    expect(COMMON_3500_COUNT).toBe(3500)
  })

  it('buildUnicodeList 在 common3500_plus 中包含英数和标点', () => {
    const result = buildUnicodeList({
      presetMode: 'common3500_plus',
      customChars: 'A你',
      uploadedChars: 'B，',
    })

    expect(result).toContain('A'.codePointAt(0))
    expect(result).toContain('B'.codePointAt(0))
    expect(result).toContain('，'.codePointAt(0))
    expect(result).toContain('你'.codePointAt(0))
  })

  it('getOutputName 生成 .subset.woff2 文件名', () => {
    expect(getOutputName('source.ttf')).toBe('source.subset.woff2')
    expect(getOutputName('font')).toBe('font.subset.woff2')
  })
})
