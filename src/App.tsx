import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  buildUnicodeList,
  COMMON_3500_COUNT,
  getOutputName,
  PREVIEW_SAMPLE,
  type PresetMode,
} from './core/charset'

type WorkerSuccessMessage = {
  jobId: number
  ok: true
  outputBuffer: ArrayBuffer
  originSize: number
  outputSize: number
}

type WorkerErrorMessage = {
  jobId: number
  ok: false
  error: string
}

type WorkerResponse = WorkerSuccessMessage | WorkerErrorMessage

type ProcessResult = {
  blobUrl: string
  fileName: string
  originSize: number
  outputSize: number
  elapsedMs: number
  unicodeCount: number
}

const MAX_FONT_SIZE_BYTES = 40 * 1024 * 1024

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function App() {
  const workerRef = useRef<Worker | null>(null)
  const currentJobIdRef = useRef(0)
  const blobUrlRef = useRef<string | null>(null)
  const startedAtRef = useRef(0)

  const [fontFile, setFontFile] = useState<File | null>(null)
  const [presetMode, setPresetMode] = useState<PresetMode>('common3500_plus')
  const [customChars, setCustomChars] = useState('')
  const [uploadedChars, setUploadedChars] = useState('')
  const [previewText, setPreviewText] = useState(PREVIEW_SAMPLE)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [statusText, setStatusText] = useState('等待开始')
  const [copyStatus, setCopyStatus] = useState('')
  const [result, setResult] = useState<ProcessResult | null>(null)

  const uploadedCharsCount = useMemo(() => Array.from(uploadedChars).length, [uploadedChars])
  const customCharsCount = useMemo(() => Array.from(customChars).length, [customChars])

  const unicodeList = useMemo(() => {
    return buildUnicodeList({ presetMode, customChars, uploadedChars })
  }, [customChars, uploadedChars, presetMode])

  const compressionRate = useMemo(() => {
    if (!result || result.originSize === 0) return '0.00%'
    return `${((1 - result.outputSize / result.originSize) * 100).toFixed(2)}%`
  }, [result])

  const cssSnippet = useMemo(() => {
    if (!result) return ''
    return `@font-face {
  font-family: "MySubsetFont";
  src: url("/fonts/${result.fileName}") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}`
  }, [result])

  const stepStatus = useMemo(() => {
    return {
      upload: !!fontFile,
      charset: unicodeList.length > 0,
      process: !!result,
    }
  }, [fontFile, result, unicodeList.length])

  useEffect(() => {
    const worker = new Worker(new URL('./worker/font.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const payload = event.data
      if (payload.jobId !== currentJobIdRef.current) return

      setIsProcessing(false)
      if (!payload.ok) {
        setStatusText('处理失败')
        setError(payload.error)
        return
      }

      const blobUrl = URL.createObjectURL(
        new Blob([payload.outputBuffer], { type: 'font/woff2' }),
      )
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = blobUrl

      const elapsedMs = Math.max(1, performance.now() - startedAtRef.current)
      setResult({
        blobUrl,
        fileName: fontFile ? getOutputName(fontFile.name) : 'subset.woff2',
        originSize: payload.originSize,
        outputSize: payload.outputSize,
        elapsedMs,
        unicodeCount: unicodeList.length,
      })
      setStatusText('处理完成')
    }

    return () => {
      worker.terminate()
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [fontFile, unicodeList.length])

  const onPickFont = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setFontFile(file)
    setResult(null)
    setError('')
    setCopyStatus('')
    setStatusText(file ? '已选择字体文件' : '等待开始')
  }

  const onPickCharsetFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setUploadedChars('')
      return
    }
    const text = await file.text()
    setUploadedChars(text)
    setStatusText('已载入字符集文件')
  }

  const handleStartSubset = async () => {
    if (!fontFile) {
      setError('请先上传字体文件（.ttf / .otf）。')
      return
    }

    const ext = fontFile.name.split('.').pop()?.toLowerCase()
    if (!ext || !['ttf', 'otf'].includes(ext)) {
      setError('当前版本仅支持 .ttf / .otf 输入。')
      return
    }

    if (fontFile.size > MAX_FONT_SIZE_BYTES) {
      setError(`当前文件超过 ${formatSize(MAX_FONT_SIZE_BYTES)}，建议先换较小源字体。`)
      return
    }

    if (unicodeList.length === 0) {
      setError('字符集为空，请先输入或上传至少一个字符。')
      return
    }

    const worker = workerRef.current
    if (!worker) {
      setError('处理引擎初始化失败，请刷新后重试。')
      return
    }

    setError('')
    setCopyStatus('')
    setResult(null)
    setIsProcessing(true)
    setStatusText('正在进行字体子集化与 WOFF2 编码...')
    startedAtRef.current = performance.now()

    const fileBuffer = await fontFile.arrayBuffer()
    const nextJobId = currentJobIdRef.current + 1
    currentJobIdRef.current = nextJobId

    worker.postMessage(
      { jobId: nextJobId, fileBuffer, unicodes: unicodeList },
      [fileBuffer],
    )
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.blobUrl
    link.download = result.fileName
    link.click()
  }

  const handleCopyCss = async () => {
    if (!cssSnippet) return
    try {
      await navigator.clipboard.writeText(cssSnippet)
      setCopyStatus('已复制')
    } catch {
      setCopyStatus('复制失败，请手动复制')
    }
  }

  const handleReset = () => {
    setFontFile(null)
    setCustomChars('')
    setUploadedChars('')
    setPresetMode('common3500_plus')
    setPreviewText(PREVIEW_SAMPLE)
    setResult(null)
    setError('')
    setCopyStatus('')
    setStatusText('等待开始')
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <h1>中文字体子集化工具</h1>
          <p>上传字体 → 选择字符集 → 一键生成更小的 woff2 文件</p>
        </div>
        <div className="hero-notes">
          <p>全程本地浏览器处理，不上传字体</p>
          <p>首版支持：TTF / OTF 输入，WOFF2 输出</p>
        </div>
      </header>

      <section className="steps card">
        <div className={`step-item ${stepStatus.upload ? 'done' : ''}`}>1. 上传字体</div>
        <div className={`step-item ${stepStatus.charset ? 'done' : ''}`}>2. 选择字符集</div>
        <div className={`step-item ${stepStatus.process ? 'done' : ''}`}>3. 下载并接入</div>
      </section>

      <section className="layout">
        <div className="left-panel">
          <section className="card">
            <h2>字体文件</h2>
            <p className="hint">建议上传网页实际使用的源字体，体积不超过 40MB。</p>
            <input type="file" accept=".ttf,.otf" onChange={onPickFont} />
            <div className="file-box">
              {fontFile ? (
                <>
                  <p className="file-name">{fontFile.name}</p>
                  <p className="hint">{formatSize(fontFile.size)}</p>
                </>
              ) : (
                <p className="hint">未选择文件</p>
              )}
            </div>
          </section>

          <section className="card">
            <h2>字符集</h2>
            <div className="row">
              <label className="radio-item">
                <input
                  type="radio"
                  checked={presetMode === 'common3500'}
                  onChange={() => setPresetMode('common3500')}
                />
                常用 {COMMON_3500_COUNT} 汉字
              </label>
              <label className="radio-item">
                <input
                  type="radio"
                  checked={presetMode === 'common3500_plus'}
                  onChange={() => setPresetMode('common3500_plus')}
                />
                {COMMON_3500_COUNT} + 英数 + 常用标点
              </label>
            </div>

            <label className="field-label">追加字符（可选）</label>
            <textarea
              value={customChars}
              onChange={(event) => setCustomChars(event.target.value)}
              placeholder="输入你业务中的专有词、人名、地名、生僻字..."
              rows={4}
            />

            <div className="upload-row">
              <label className="field-label">上传字符集文本（.txt，可选）</label>
              <input type="file" accept=".txt" onChange={onPickCharsetFile} />
            </div>

            <div className="charset-stats">
              <span>手动追加：{customCharsCount} 字符</span>
              <span>上传字符集：{uploadedCharsCount} 字符</span>
              <span>最终去重后：{unicodeList.length} 字符</span>
            </div>
          </section>

          <section className="card">
            <h2>执行处理</h2>
            <div className="actions">
              <button className="primary" onClick={handleStartSubset} disabled={isProcessing}>
                {isProcessing ? '处理中...' : '开始子集化'}
              </button>
              <button onClick={handleReset} disabled={isProcessing}>
                重置
              </button>
            </div>
            <p className="status">状态：{statusText}</p>
            {error && <p className="error">{error}</p>}
          </section>
        </div>

        <div className="right-panel">
          <section className="card">
            <h2>结果与下载</h2>
            {result ? (
              <>
                <div className="stats">
                  <div className="stat">
                    <span>原始体积</span>
                    <strong>{formatSize(result.originSize)}</strong>
                  </div>
                  <div className="stat">
                    <span>输出体积</span>
                    <strong>{formatSize(result.outputSize)}</strong>
                  </div>
                  <div className="stat">
                    <span>压缩率</span>
                    <strong>{compressionRate}</strong>
                  </div>
                  <div className="stat">
                    <span>处理耗时</span>
                    <strong>{formatDuration(result.elapsedMs)}</strong>
                  </div>
                </div>
                <button onClick={handleDownload}>下载 {result.fileName}</button>
              </>
            ) : (
              <p className="hint">完成处理后会显示压缩结果与下载按钮。</p>
            )}
          </section>

          {result && (
            <>
              <section className="card">
                <h2>网页接入代码</h2>
                <p className="hint">将下载后的字体放到站点的 /fonts 目录，再使用下面代码。</p>
                <pre className="code-block">{cssSnippet}</pre>
                <div className="actions">
                  <button onClick={handleCopyCss}>复制 CSS</button>
                  {copyStatus && <span className="hint">{copyStatus}</span>}
                </div>
              </section>

              <section className="card">
                <h2>效果预览</h2>
                <textarea
                  value={previewText}
                  onChange={(event) => setPreviewText(event.target.value)}
                  rows={3}
                />
                <style>{`
                  @font-face {
                    font-family: "SubsetPreview";
                    src: url("${result.blobUrl}") format("woff2");
                  }
                `}</style>
                <div className="preview" style={{ fontFamily: 'SubsetPreview, sans-serif' }}>
                  {previewText}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
