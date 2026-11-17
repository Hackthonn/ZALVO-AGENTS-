// data-paths.mjs — the pure path-resolution core, shared by the desktop app
// (via data-paths.ts, a typed re-export) and the CI smoke driver (which runs
// under Node's type-stripping and therefore cannot import the app's
// extensionless TypeScript directly). No Electron imports here; only node:path.
//
// data-paths.ts re-exports these names and adds the TypeScript-facing
// `ZalvoHomeOptions` interface. Keep the two in lockstep: every behavior in
// this file is exercised by data-paths.test.ts through the re-export.

import path from 'node:path'

/** A ZALVO_HOME rooted inside a `profiles/` directory names the profile's
 * parent (the home), not the profile directory itself. */
function normalizeZalvoHomeRoot(zalvoHome, pathModule) {
  if (!zalvoHome) {
    return zalvoHome
  }
  const resolved = pathModule.resolve(String(zalvoHome))
  const parent = pathModule.dirname(resolved)
  if (pathModule.basename(parent).toLowerCase() === 'profiles') {
    return pathModule.dirname(parent)
  }
  return resolved
}

export function platformDefaultZalvoHome(home, env = process.env, platform = process.platform) {
  const suffix = env.ZALVO_DATA_DIR_SUFFIX || ''
  if (platform === 'win32') {
    const base = (env.LOCALAPPDATA || '').trim() || path.win32.join(home, 'AppData', 'Local')
    return path.win32.join(base, 'zalvo') + suffix
  }
  return path.posix.join(home, '.zalvo') + suffix
}

export function resolveDesktopUserData(defaultPath, env = process.env) {
  return env.ZALVO_DESKTOP_USER_DATA_DIR
    ? path.resolve(env.ZALVO_DESKTOP_USER_DATA_DIR)
    : defaultPath + (env.ZALVO_DATA_DIR_SUFFIX || '')
}

export function resolveDesktopZalvoHome({ home, env = process.env, platform = process.platform, directoryExists = () => false, readWindowsHome = () => null }) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (env.ZALVO_HOME) {
    return normalizeZalvoHomeRoot(env.ZALVO_HOME, paths)
  }
  // Fresh-install rehearsals must not touch the real ZALVO home.
  if (env.ZALVO_DESKTOP_USER_DATA_DIR) {
    return paths.join(paths.resolve(env.ZALVO_DESKTOP_USER_DATA_DIR), 'zalvo-home')
  }
  if (platform === 'win32' && env.ZALVO_HOME === undefined) {
    // Explorer can miss setx changes. An explicit empty value opts out of that fallback.
    const registryHome = readWindowsHome()
    if (registryHome) {
      return normalizeZalvoHomeRoot(registryHome, paths)
    }
  }
  const defaultHome = platformDefaultZalvoHome(home, env, platform)
  // Keep the legacy migration for ordinary installs, not isolated suffix runs.
  if (platform === 'win32' && !env.ZALVO_DATA_DIR_SUFFIX) {
    const legacy = paths.join(home, '.zalvo')
    if (!directoryExists(defaultHome) && directoryExists(legacy)) {
      return legacy
    }
  }
  return defaultHome
}
