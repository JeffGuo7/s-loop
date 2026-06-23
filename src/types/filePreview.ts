export type FileCategory =
  | 'text'
  | 'code'
  | 'markdown'
  | 'image'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'excel'
  | 'binary'

export interface FilePreviewState {
  filePath: string
  fileName: string
  category: FileCategory
}

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'less',
  'html', 'htm', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
  'yaml', 'yml', 'toml', 'xml', 'sh', 'bash', 'sql',
  'graphql', 'prisma', 'vue', 'svelte', 'astro',
  'dart', 'kt', 'swift', 'rb', 'php', 'lua', 'r',
  'zig', 'nim', 'ex', 'exs', 'hs', 'scala', 'clj',
  'cmake', 'make', 'dockerfile', 'env',
  'conf', 'cfg', 'ini', 'properties', 'gradle',
  'proto', 'thrift',
])

const MARKDOWN_EXTS = new Set(['md', 'mdx'])

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif',
])

const EXCEL_EXTS = new Set(['xlsx', 'xls', 'csv', 'tsv'])

const DOCX_EXTS = new Set(['docx', 'doc'])

const PPTX_EXTS = new Set(['pptx', 'ppt'])

const BINARY_EXTS = new Set([
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
  'exe', 'dll', 'so', 'dylib',
  'wasm', 'o', 'a', 'lib',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
  'mp4', 'avi', 'mkv', 'mov', 'webm',
  'ttf', 'otf', 'woff', 'woff2',
])

const KNOWN_TEXT_FILES = new Set([
  'Makefile', 'Dockerfile', 'Vagrantfile', 'Gemfile',
  'Rakefile', 'Procfile', 'LICENSE', 'README',
  'CHANGELOG', 'CONTRIBUTING',
])

export function detectFileCategory(fileName: string): FileCategory {
  const ext = fileName.includes('.')
    ? fileName.split('.').pop()!.toLowerCase()
    : ''

  if (MARKDOWN_EXTS.has(ext)) return 'markdown'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (EXCEL_EXTS.has(ext)) return 'excel'
  if (DOCX_EXTS.has(ext)) return 'docx'
  if (PPTX_EXTS.has(ext)) return 'pptx'
  if (ext === 'pdf') return 'pdf'
  if (CODE_EXTS.has(ext)) return 'code'
  if (BINARY_EXTS.has(ext)) return 'binary'

  if (KNOWN_TEXT_FILES.has(fileName)) return 'text'

  const TEXT_EXTS = new Set(['txt', 'log', 'cfg', 'ini', 'conf', 'properties'])
  if (TEXT_EXTS.has(ext)) return 'text'

  // 无扩展名的未知文件默认当文本尝试
  if (!ext) return 'text'

  return 'binary'
}
