import { create } from 'zustand'
import { detectFileCategory, type FilePreviewState } from '../types/filePreview'

interface FilePreviewStore {
  preview: FilePreviewState | null
  loading: boolean
  error: string | null

  openFile: (filePath: string, fileName: string) => void
  closePreview: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useFilePreviewStore = create<FilePreviewStore>()((set) => ({
  preview: null,
  loading: false,
  error: null,

  openFile: (filePath, fileName) => {
    const category = detectFileCategory(fileName)
    set({
      preview: { filePath, fileName, category },
      loading: true,
      error: null,
    })
  },

  closePreview: () => {
    set({ preview: null, loading: false, error: null })
  },

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),
}))
