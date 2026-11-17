/**
 * ZALVO Cloud owns updates for its agents: it replaces the agent's image, so
 * no in-app updater may be offered there. Two shapes reach a Cloud agent:
 *
 * - the Webapp served BY a Cloud agent (the tab's own origin is the agent):
 *   every update target is Cloud's, because the app itself comes from it;
 * - native Desktop CONNECTED to a Cloud agent: only the backend target is;
 *   the Desktop app on this machine still updates itself.
 */

import { isZalvoCloudUrl } from '@zalvo/shared'
import { computed } from 'nanostores'

import type { ZalvoConnection } from '@/global'
import { servedByZalvoCloud } from '@/lib/zalvo-cloud-host'
import type { UpdateTarget } from '@/lib/update-copy'
import { $connection } from '@/store/session'

function connectedToZalvoCloud(connection: ZalvoConnection | null): boolean {
  return connection?.mode === 'remote' && (connection.remoteKind === 'cloud' || isZalvoCloudUrl(connection.baseUrl))
}

/** Whether ZALVO Cloud owns updates for `target` under `connection`. */
export function cloudOwnsUpdates(target: UpdateTarget, connection: ZalvoConnection | null = $connection.get()): boolean {
  return servedByZalvoCloud() || (target === 'backend' && connectedToZalvoCloud(connection))
}

/**
 * The target a generic "Update ZALVO" command acts on: the connected backend
 * in remote mode, unless ZALVO Cloud owns it — then this machine's own app.
 */
export function updateTargetFor(connection: ZalvoConnection | null): UpdateTarget {
  return connection?.mode === 'remote' && !cloudOwnsUpdates('backend', connection) ? 'backend' : 'client'
}

/** Per target: true while every update control for it must stay hidden. */
export const $cloudOwnsUpdates = computed($connection, connection => ({
  backend: cloudOwnsUpdates('backend', connection),
  client: cloudOwnsUpdates('client', connection)
}))
