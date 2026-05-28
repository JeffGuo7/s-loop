import { invoke } from '@tauri-apps/api/core'

interface ProxyRequest {
  url: string
  method?: string
  headers: Record<string, string>
  body: string
}

interface ProxyResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export async function proxyRequest(request: ProxyRequest): Promise<ProxyResponse> {
  return invoke<ProxyResponse>('ai_proxy', { request })
}

export async function proxyStream(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<ReadableStream<Uint8Array>> {
  const response = await proxyRequest({ url, method: 'POST', headers, body })
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(response.body))
      controller.close()
    },
  })
}
