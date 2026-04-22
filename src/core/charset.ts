import commonHanTextRaw from '../assets/现代常用汉字.txt?raw'

export type PresetMode = 'common3500' | 'common3500_plus'

const PRESET_HANZI_LIMIT = 3500
const HANZI_REGEX = /\p{Script=Han}/u

const normalizedHanSource = commonHanTextRaw
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('//'))
  .join('')

const extractCommonHanzi = (text: string, limit: number): string => {
  const result: string[] = []
  const seen = new Set<string>()
  for (const char of text) {
    if (!HANZI_REGEX.test(char)) continue
    if (seen.has(char)) continue
    seen.add(char)
    result.push(char)
    if (result.length >= limit) break
  }
  return result.join('')
}

export const COMMON_3500 = extractCommonHanzi(normalizedHanSource, PRESET_HANZI_LIMIT)
export const COMMON_3500_COUNT = Array.from(COMMON_3500).length

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
  const parts = [COMMON_3500]
  if (presetMode === 'common3500_plus') {
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
