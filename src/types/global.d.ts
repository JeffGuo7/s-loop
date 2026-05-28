export {}

declare global {
  interface Window {
    __aiFetchHandler?: (
      url: string,
      request: { method: string; headers: Record<string, string>; body: string }
    ) => Promise<Response>
  }
}
