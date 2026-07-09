import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../src/utils/errors'

describe('getErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns the message of an Error subclass', () => {
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type')
  })

  it('stringifies non-Error values by default', () => {
    expect(getErrorMessage('plain string')).toBe('plain string')
    expect(getErrorMessage(42)).toBe('42')
    expect(getErrorMessage(null)).toBe('null')
    expect(getErrorMessage(undefined)).toBe('undefined')
  })

  it('uses the fallback for non-Error values', () => {
    expect(getErrorMessage('ignored', 'fallback')).toBe('fallback')
    expect(getErrorMessage({}, 'fallback')).toBe('fallback')
  })

  it('prefers the Error message over the fallback', () => {
    expect(getErrorMessage(new Error('real'), 'fallback')).toBe('real')
  })
})
