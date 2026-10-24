// Shared request-body readers for the HTTP routes.

export async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export async function readRawJsonBody(req, { maxBytes = 64 * 1024, timeoutMs = 5000 } = {}) {
  return await new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    const timer = setTimeout(() => {
      req.destroy()
      reject(new Error('Request body timeout'))
    }, timeoutMs)

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        clearTimeout(timer)
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      body += chunk
    })
    req.on('end', () => {
      clearTimeout(timer)
      try {
        resolve({
          raw: body,
          data: body ? JSON.parse(body) : {},
        })
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
