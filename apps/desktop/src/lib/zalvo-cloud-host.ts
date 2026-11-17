/**
 * The Webapp tab is served BY a ZALVO Cloud agent (its own origin is the
 * agent). Cloud then owns every update: the app itself comes from that agent.
 * Kept free of the session store so low-level modules (notifications, the
 * settings manifest) can ask it without an import cycle.
 */

import { isZalvoCloudUrl } from '@zalvo/shared'

import { isBrowserHostedDesktop } from '@/lib/platform'

export function servedByZalvoCloud(): boolean {
  return typeof window !== 'undefined' && isBrowserHostedDesktop() && isZalvoCloudUrl(window.location.origin)
}
