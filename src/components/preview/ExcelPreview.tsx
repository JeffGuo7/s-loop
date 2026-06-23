import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'

interface ExcelPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

interface SheetData {
  name: string
  headers: string[]
  rows: string[][]
}

export function ExcelPreview({ filePath, onLoaded, onError }: ExcelPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const base64 = await invoke<string>('read_file_base64', { path: filePath })

        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const workbook = XLSX.read(bytes.buffer, { type: 'array' })
        const sheetData: SheetData[] = workbook.SheetNames.map((name) => {
          const worksheet = workbook.Sheets[name]
          const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 })
          const headers = jsonData.length > 0 ? jsonData[0].map(String) : []
          const rows = jsonData.slice(1).map((row) => row.map(String))
          return { name, headers, rows }
        })

        if (!cancelled) {
          setSheets(sheetData)
          onLoaded()
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath, onLoaded, onError])

  if (sheets.length === 0) return null

  const current = sheets[activeSheet]

  return (
    <div className="h-full flex flex-col">
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border-light/50 overflow-x-auto shrink-0">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(idx)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                idx === activeSheet
                  ? 'bg-accent text-white'
                  : 'bg-surface-secondary/60 text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-secondary/80 backdrop-blur-xl">
              {current.headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left font-bold text-text tracking-tight border-b border-border-light/50 whitespace-nowrap">
                  {header || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {current.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-surface-secondary/40 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-text-secondary border-b border-border-light/20 truncate max-w-[200px]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {current.rows.length === 0 && (
              <tr>
                <td colSpan={current.headers.length} className="px-3 py-6 text-center text-text-quaternary text-[11px]">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
