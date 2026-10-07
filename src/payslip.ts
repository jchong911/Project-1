import { createWorker } from 'tesseract.js'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PayslipSuggestions {
  amount: string
  date: string
}

const supportedFile = (file: File) =>
  file.type === 'application/pdf' || file.type.startsWith('image/')

const extractAmount = (text: string, labels: string[]) => {
  const amount = String.raw`(?:HKD|HK\s*\$|\$)?\s*([\d,]+(?:\.\d{1,2})?)`
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[^\\d]{0,45}${amount}`, 'i'))
    if (match) return match[1].replaceAll(',', '')
  }
  return ''
}

const suggestionsFromText = (text: string): PayslipSuggestions => {
  const dateMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  return {
    amount: extractAmount(text, [
      String.raw`(?:bank\s+|current\s+|available\s+)?balance`,
      String.raw`bank(?:\s+account)?\s+amount`,
      String.raw`amount paid`,
      String.raw`take[ -]?home(?:\s+pay)?`,
      String.raw`net(?:\s+(?:pay|salary|income))?`,
    ]),
    date: dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
      : '',
  }
}

const recognizeImage = async (image: File | HTMLCanvasElement) => {
  const worker = await createWorker('eng')
  try {
    const result = await worker.recognize(image)
    return result.data.text
  } finally {
    await worker.terminate()
  }
}

const readPdf = async (file: File) => {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 5); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
  }
  return pages.join('\n')
}

const recognizePdfPages = async (file: File) => {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const worker = await createWorker('eng')
  const pages: string[] = []
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.6 })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) continue
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, canvasContext: context, viewport }).promise
      const result = await worker.recognize(canvas)
      pages.push(result.data.text)
    }
  } finally {
    await worker.terminate()
  }
  return pages.join('\n')
}

export const parsePayslip = async (file: File): Promise<PayslipSuggestions> => {
  if (!supportedFile(file)) throw new Error('Choose a PDF, JPG, or PNG payslip.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.')

  if (file.type === 'application/pdf') {
    const text = await readPdf(file)
    const suggestions = suggestionsFromText(text)
    if (suggestions.amount) return suggestions
    return suggestionsFromText(await recognizePdfPages(file))
  }

  return suggestionsFromText(await recognizeImage(file))
}