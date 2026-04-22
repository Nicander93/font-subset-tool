export type PresetMode = 'common3000' | 'common3000_plus'

export const COMMON_3000 = Array.from({ length: 3000 }, (_, index) =>
  String.fromCodePoint(0x4e00 + index),
).join('')

export const ASCII_AND_DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const COMMON_PUNCTUATION = '，。！？；：、（）《》【】「」『』“”‘’—…,.!?;:()[]{}<>'

export const PREVIEW_SAMPLE = '字体子集化预览：你好，世界！欢迎使用 Font Subset Web 2026.'

export const toUnicodeSet = (text: string): number[] =>
  Array.from(new Set(Array.from(text, (char) => char.codePointAt(0)!)))

export const buildUnicodeList = ({
  presetMode,
  customChars,
  uploadedChars,
}: {
  presetMode: PresetMode
  customChars: string
  uploadedChars: string
}): number[] => {
  const parts = [COMMON_3000]
  if (presetMode === 'common3000_plus') {
    parts.push(ASCII_AND_DIGITS, COMMON_PUNCTUATION)
  }
  parts.push(customChars, uploadedChars)
  return toUnicodeSet(parts.join(''))
}

export const getOutputName = (name: string): string => {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return `${name}.subset.woff2`
  return `${name.slice(0, dotIndex)}.subset.woff2`
}
