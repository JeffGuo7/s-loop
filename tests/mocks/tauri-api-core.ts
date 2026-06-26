/**
 * Vitest mock for @tauri-apps/api/core.
 *
 * Linked via resolve.alias in vitest.config.ts.
 * Override per test with `invoke.mockResolvedValue(...)` or `invoke.mockImplementation(...)`.
 *
 * Default return is a resolved Promise so callers can .catch() it.
 */
import { vi } from 'vitest'

export const invoke = vi.fn<any, Promise<any>>(() => Promise.resolve(undefined))
