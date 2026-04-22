/// <reference lib="webworker" />

import { init as initSubset, subset } from 'hb-subset-wasm'
import hbSubsetWasmUrl from 'hb-subset-wasm/hb-subset.wasm?url'
import { encode, init as initWoff2 } from 'woff2-encode-wasm'
import woff2WasmUrl from 'woff2-encode-wasm/encoder.wasm?url'

type SubsetJobRequest = {
  jobId: number
  fileBuffer: ArrayBuffer
  unicodes: number[]
}

let readyPromise: Promise<void> | null = null

const ensureReady = async () => {
  if (!readyPromise) {
    readyPromise = (async () => {
      const hbWasmBytes = await (await fetch(hbSubsetWasmUrl)).arrayBuffer()
      const woff2WasmBytes = await (await fetch(woff2WasmUrl)).arrayBuffer()
      await initSubset(hbWasmBytes)
      await initWoff2(woff2WasmBytes)
    })()
  }
  await readyPromise
}

self.onmessage = async (event: MessageEvent<SubsetJobRequest>) => {
  const { jobId, fileBuffer, unicodes } = event.data
  try {
    await ensureReady()
    const originBytes = new Uint8Array(fileBuffer)
    const subsetBytes = await subset(originBytes, {
      unicodes,
      noHinting: true,
    })
    const woff2Bytes = await encode(subsetBytes)
    ;(self as DedicatedWorkerGlobalScope).postMessage(
      {
        jobId,
        ok: true,
        outputBuffer: woff2Bytes.buffer,
        originSize: originBytes.byteLength,
        outputSize: woff2Bytes.byteLength,
      },
      [woff2Bytes.buffer as Transferable],
    )
  } catch (error) {
    ;(self as DedicatedWorkerGlobalScope).postMessage({
      jobId,
      ok: false,
      error: error instanceof Error ? error.message : '字体处理失败',
    })
  }
}
