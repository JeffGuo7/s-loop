import { describe, it, expect } from 'vitest'
import { jsonRequest } from '../src/utils/http'

describe('jsonRequest', () => {
  it('defaults to a POST with JSON headers and a serialized body', () => {
    const init = jsonRequest({ a: 1 })
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(JSON.stringify({ a: 1 }))
  })

  it('allows overriding the method', () => {
    const init = jsonRequest({ enabled: true }, { method: 'PUT' })
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ enabled: true }))
  })

  it('merges extra init fields such as an abort signal', () => {
    const controller = new AbortController()
    const init = jsonRequest({}, { signal: controller.signal })
    expect(init.signal).toBe(controller.signal)
    expect(init.method).toBe('POST')
  })

  it('keeps the JSON content-type while merging extra headers', () => {
    const init = jsonRequest({}, { headers: { 'X-Custom': 'yes' } })
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Custom': 'yes',
    })
  })
})
