// The ZALVO home the desktop main process runs against, resolved once at boot.
// Resolving it here also registers it with the file-preview read guard, so the
// home's (and every profile's) credential stores are refused before any IPC
// read can be served.

import { resolveDesktopZalvoHome } from './data-paths'
import { directoryExists } from './fs-probes'
import { setSensitiveZalvoHome } from './hardening'
import { readWindowsUserEnvVar } from './windows-user-env'

export function resolveMainZalvoHome(home: string): string {
  const zalvoHome = resolveDesktopZalvoHome({
    home,
    directoryExists,
    readWindowsHome: (): string | null => readWindowsUserEnvVar('ZALVO_HOME')
  })

  setSensitiveZalvoHome(zalvoHome)

  return zalvoHome
}
