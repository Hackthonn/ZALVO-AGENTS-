import { vi } from 'vitest'

import type { ZalvoApiRequest } from '@/global'

/** Install a fake `window.zalvoDesktop.api`, the preload bridge every REST helper sends through. */
export function installRestBridge(answer: (request: ZalvoApiRequest) => object) {
  const api = vi.fn(async (request: ZalvoApiRequest) => answer(request))

  Object.defineProperty(window, 'zalvoDesktop', { configurable: true, value: { api } })

  return api
}
