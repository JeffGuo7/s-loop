// pi.dev extension management routes.

import {
  installExtension,
  listExtensions,
  reloadAll,
  removeExtension,
} from '../extension-runtime.mjs'
import { readJsonBody } from '../http-body.mjs'

export function handleExtensionRoutes(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/extensions') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listExtensions()))
    return true
  }

  // POST /extensions/install — install a pi.dev package
  if (req.method === 'POST' && url.pathname === '/extensions/install') {
    readJsonBody(req).then(async (data) => {
      try {
        const pkg = data.package || data.name
        if (!pkg) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "package" field' })); return }
        const result = await installExtension(pkg)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  // POST /extensions/remove — uninstall a pi.dev package
  if (req.method === 'POST' && url.pathname === '/extensions/remove') {
    readJsonBody(req).then(async (data) => {
      try {
        const pkg = data.package || data.name
        if (!pkg) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "package" field' })); return }
        const result = await removeExtension(pkg)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  // POST /extensions/reload — reload all extensions
  if (req.method === 'POST' && url.pathname === '/extensions/reload') {
    reloadAll().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  return false
}
