import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import type { DesktopProfileRoute } from './desktop-profile'
import type { HudModifierApi, HudModifierStatus } from './hud-modifier-types'
import { customWindowControlsEnabled } from './window-controls'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.zalvoDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('zalvo:translucency:support')
const hudWindowing = ipcRenderer.sendSync('zalvo:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

const launchFlags: { localModels?: boolean; assumeFreshInstall?: boolean } | undefined =
  ipcRenderer.sendSync('zalvo:feature-flags')

// Local, sanitized skin payload for the first renderer theme paint. This does
// not wait on `gateway.ready`, so an unreachable remote primary cannot force
// the built-in palette over the skin configured on this machine.
const localSkin = ipcRenderer.sendSync('zalvo:skin:local')

// This machine's UI preferences store (#145213), read before the first paint so
// a preference set in another window or in this machine's Webapp paints at once.
const uiPreferencesSnapshot = ipcRenderer.sendSync('zalvo:ui-preferences:snapshot')

import { unwrapExpectedNotFound } from './api-expected-404'

contextBridge.exposeInMainWorld('zalvoDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Dev-only launch fact: an unpackaged app started with --fresh-install, so
  // onboarding treats this launch as a fresh install. Always false when packaged.
  assumeFreshInstall: launchFlags?.assumeFreshInstall === true,
  localSkin: localSkin && typeof localSkin === 'object' ? localSkin : null,
  uiPreferences: {
    snapshot: uiPreferencesSnapshot && typeof uiPreferencesSnapshot === 'object' ? uiPreferencesSnapshot : null,
    read: () => ipcRenderer.invoke('zalvo:ui-preferences:read'),
    write: payload => ipcRenderer.invoke('zalvo:ui-preferences:write', payload),
    onChanged: callback => {
      const listener = (_event, snapshot) => callback(snapshot)
      ipcRenderer.on('zalvo:ui-preferences:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:ui-preferences:changed', listener)
    }
  },
  getConnection: (profile, opts) => ipcRenderer.invoke('zalvo:connection', profile, opts),
  // Loopback origin that hosts YouTube's player for the file:// renderer.
  getEmbedHostOrigin: () => ipcRenderer.invoke('zalvo:embed-host:origin'),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('zalvo:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('zalvo:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('zalvo:connection:revalidate'),
  getGatewayWsUrl: profile => ipcRenderer.invoke('zalvo:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('zalvo:gateway:ws-url-for', payload),
  // { connectionId, profile, pluginId, path } → one-use local plugin socket URL, null, or { refused: 'permission' }.
  getPluginWsUrl: payload => ipcRenderer.invoke('zalvo:plugin:ws-url', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('zalvo:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('zalvo:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('zalvo:window:openInTerminal', sessionId, opts),
  openWindow: (options?: DesktopProfileRoute) => ipcRenderer.invoke('zalvo:window:openInstance', options),
  openBrowserWindow: tabId => ipcRenderer.invoke('zalvo:window:openBrowser', tabId),
  windowRelay: {
    send: payload => ipcRenderer.send('zalvo:window:relay', payload),
    onMessage: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:window:relay', listener)

      return () => ipcRenderer.removeListener('zalvo:window:relay', listener)
    }
  },
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('zalvo:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('zalvo:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('zalvo:ambient:claim', key),
  windowControls: {
    custom: customWindowControlsEnabled(),
    minimize: () => ipcRenderer.send('zalvo:window-control', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('zalvo:window-control', 'toggle-maximize'),
    close: () => ipcRenderer.send('zalvo:window-control', 'close')
  },
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('zalvo:wake-indicator:get'),
    setState: state => ipcRenderer.send('zalvo:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('zalvo:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('zalvo:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    size: mode => ipcRenderer.send('zalvo:window:size', mode)
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('zalvo:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('zalvo:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('zalvo:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('zalvo:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('zalvo:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('zalvo:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('zalvo:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('zalvo:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('zalvo:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('zalvo:hud:open', request),
    close: () => ipcRenderer.invoke('zalvo:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('zalvo:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('zalvo:hud:begin-move'),
    endMove: () => ipcRenderer.send('zalvo:hud:end-move'),
    moveBy: delta => ipcRenderer.send('zalvo:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('zalvo:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('zalvo:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('zalvo:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('zalvo:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('zalvo:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('zalvo:hud:goto', listener)

      return () => ipcRenderer.removeListener('zalvo:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('zalvo:hud:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('zalvo:hud:cursor', listener)

      return () => ipcRenderer.removeListener('zalvo:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('zalvo:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('zalvo:hud:game-overlay', listener)
    }
  },
  hudModifier: {
    getSettings: () => ipcRenderer.invoke('zalvo:hud-modifier:settings:get'),
    setEnabled: enabled => ipcRenderer.invoke('zalvo:hud-modifier:settings:set', enabled),
    openPermissionSettings: () => ipcRenderer.invoke('zalvo:hud-modifier:permission'),
    onStatus: callback => {
      const listener = (_event: Electron.IpcRendererEvent, status: HudModifierStatus) => callback(status)
      ipcRenderer.on('zalvo:hud-modifier:status', listener)

      return () => ipcRenderer.removeListener('zalvo:hud-modifier:status', listener)
    }
  } satisfies HudModifierApi,
  // macOS native screenshot gesture; captures require a main-issued request.
  screenshot:
    process.platform === 'darwin'
      ? {
          getSettings: () => ipcRenderer.invoke('zalvo:screenshot:settings:get'),
          setEnabled: enabled => ipcRenderer.invoke('zalvo:screenshot:settings:set', enabled),
          openPermissionSettings: kind => ipcRenderer.invoke('zalvo:screenshot:permission', kind),
          capture: requestId => ipcRenderer.invoke('zalvo:screenshot:capture', requestId),
          onStatus: callback => {
            const listener = (_event, status) => callback(status)
            ipcRenderer.on('zalvo:screenshot:status', listener)

            return () => ipcRenderer.removeListener('zalvo:screenshot:status', listener)
          },
          onRequest: callback => {
            const channel = 'zalvo:screenshot:request'
            const listener = (_event, requestId) => callback(requestId)

            if (ipcRenderer.listenerCount(channel) === 0) {
              ipcRenderer.send('zalvo:screenshot:subscribe', true)
            }

            ipcRenderer.on(channel, listener)

            return () => {
              ipcRenderer.removeListener(channel, listener)

              if (ipcRenderer.listenerCount(channel) === 0) {
                ipcRenderer.send('zalvo:screenshot:subscribe', false)
              }
            }
          }
        }
      : undefined,
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('zalvo:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('zalvo:quick-entry:settings:set', patch),
    // Invoke returns the delivery result so the draft is not lost (#85590).
    submit: payload => ipcRenderer.invoke('zalvo:quick-entry:submit', payload),
    // Main cannot invoke the primary renderer, so it receives this ack (#85590).
    ackSubmit: (correlationId, result) => ipcRenderer.send('zalvo:quick-entry:ack', { correlationId, result }),
    dismiss: () => ipcRenderer.send('zalvo:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('zalvo:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('zalvo:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('zalvo:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('zalvo:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('zalvo:quick-entry:shown', listener)
    },
    // Main → quick window: the outcome of a submit whose relay already timed
    // out. Delivery is now KNOWN — reconcile the unknown state instead of
    // leaving the user to resend a prompt that may already be delivered.
    onLateResult: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:quick-entry:late-result', listener)

      return () => ipcRenderer.removeListener('zalvo:quick-entry:late-result', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('zalvo:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('zalvo:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('zalvo:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('zalvo:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('zalvo:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('zalvo:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('zalvo:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('zalvo:connections:list'),
    save: payload => ipcRenderer.invoke('zalvo:connections:save', payload),
    remove: id => ipcRenderer.invoke('zalvo:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('zalvo:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('zalvo:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('zalvo:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('zalvo:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('zalvo:connections:update-managed', id),
    // Fan out `zalvo update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('zalvo:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:connections:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('zalvo:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('zalvo:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('zalvo:connection-config:probe', remoteUrl),
  // `options` lets a registry-editor draft sign in BEFORE it is saved: the
  // main process settles the draft's connection id up front so the login
  // window writes into the per-connection cookie jar the saved entry will
  // read (not the legacy shared jar an unsaved URL would fall back to).
  oauthLoginConnectionConfig: (remoteUrl, options) =>
    ipcRenderer.invoke('zalvo:connection-config:oauth-login', remoteUrl, options),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('zalvo:connection-config:oauth-logout', remoteUrl),
  // ZALVO Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('zalvo:cloud:status'),
    login: () => ipcRenderer.invoke('zalvo:cloud:login'),
    logout: () => ipcRenderer.invoke('zalvo:cloud:logout'),
    discover: org => ipcRenderer.invoke('zalvo:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('zalvo:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    getDefault: () => ipcRenderer.invoke('zalvo:profile:default:get'),
    setDefault: (route: DesktopProfileRoute) => ipcRenderer.invoke('zalvo:profile:default:set', route),
    onDefaultChanged: (callback: (route: DesktopProfileRoute | null) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, route: DesktopProfileRoute | null) => callback(route)
      ipcRenderer.on('zalvo:profile:default:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:profile:default:changed', listener)
    },
    get: () => ipcRenderer.invoke('zalvo:profile:get'),
    remember: name => ipcRenderer.invoke('zalvo:profile:remember', name),
    importConnections: (record: Record<string, string>) =>
      ipcRenderer.invoke('zalvo:profile:connections:import', record),
    rememberConnection: (connectionId: string, profile: string) =>
      ipcRenderer.invoke('zalvo:profile:connections:remember', connectionId, profile),
    set: name => ipcRenderer.invoke('zalvo:profile:set', name)
  },
  // The handler resolves an expected 404 with a sentinel instead of rejecting
  // (Electron logs a stack for every rejected invoke). Turn it back into the
  // rejection the renderer expects — see electron/api-expected-404.ts.
  api: request => ipcRenderer.invoke('zalvo:api', request).then(unwrapExpectedNotFound),
  notify: payload => ipcRenderer.invoke('zalvo:notify', payload),
  claimStartupLatency: () => ipcRenderer.invoke('zalvo:startup-latency:claim'),
  requestMicrophoneAccess: () => ipcRenderer.invoke('zalvo:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('zalvo:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('zalvo:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('zalvo:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('zalvo:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('zalvo:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('zalvo:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('zalvo:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('zalvo:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('zalvo:selectSavePath', options),
  saveTextFileAs: request => ipcRenderer.invoke('zalvo:saveTextFileAs', request),
  writeClipboard: text => ipcRenderer.invoke('zalvo:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('zalvo:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('zalvo:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('zalvo:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('zalvo:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('zalvo:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('zalvo:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('zalvo:context-menu:guest-add-word', payload),
  spellcheckDictionary: (op, word) => ipcRenderer.invoke('zalvo:spellcheck:dictionary', { op, word }),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('zalvo:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('zalvo:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('zalvo:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('zalvo:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('zalvo:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('zalvo:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('zalvo:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('zalvo:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('zalvo:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('zalvo:active-work', payload),
  scheduleStreamWorkWake: (token, delayMs) => ipcRenderer.send('zalvo:stream-work-wake', { token, delayMs }),
  onStreamWorkWake: callback => {
    const listener = (_event, token) => callback(token)
    ipcRenderer.on('zalvo:stream-work-ready', listener)

    return () => ipcRenderer.removeListener('zalvo:stream-work-ready', listener)
  },
  setTitleBarTheme: payload => ipcRenderer.send('zalvo:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('zalvo:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('zalvo:translucency', payload),
  setKeepAwake: mode => ipcRenderer.send('zalvo:keep-awake', mode),
  // Once per computer, after a timed sleep interrupted a turn with keep-awake off.
  onKeepAwakeOffer: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:keep-awake-offer', listener)

    return () => ipcRenderer.removeListener('zalvo:keep-awake-offer', listener)
  },
  minimizeToTray: {
    get: () => ipcRenderer.invoke('zalvo:minimize-to-tray:get'),
    set: on => ipcRenderer.invoke('zalvo:minimize-to-tray:set', on),
    onChanged: callback => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('zalvo:minimize-to-tray:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:minimize-to-tray:changed', listener)
    }
  },
  setDisableF12: blocked => ipcRenderer.send('zalvo:devtools:disable-f12', blocked),
  setF12ShortcutActive: active => ipcRenderer.send('zalvo:f12ShortcutActive', Boolean(active)),
  onF12Shortcut: callback => {
    const listener = (_event, input) => callback(input)
    ipcRenderer.on('zalvo:f12-shortcut', listener)

    return () => ipcRenderer.removeListener('zalvo:f12-shortcut', listener)
  },
  setPreviewShortcutActive: active => ipcRenderer.send('zalvo:previewShortcutActive', Boolean(active)),
  setPreviewGuestHidden: (webContentsId, hidden) =>
    ipcRenderer.send('zalvo:preview-guest-hidden', { webContentsId, hidden: Boolean(hidden) }),
  beginPreviewGuestActivity: webContentsId => ipcRenderer.invoke('zalvo:preview-guest-activity:begin', webContentsId),
  endPreviewGuestActivity: token => ipcRenderer.invoke('zalvo:preview-guest-activity:end', token),
  executePreviewGuestScript: (token, code) => ipcRenderer.invoke('zalvo:preview-guest-activity:script', token, code),
  syncPreviewSignins: request => ipcRenderer.invoke('zalvo:preview-signins:sync', request),
  migratePreviewSigninsForProfile: (request: { oldProfile: string; newProfile: string }) =>
    ipcRenderer.invoke('zalvo:preview-signins:profile-renamed', request),
  dropPreviewSigninsForProfile: (request: { profile: string }) =>
    ipcRenderer.invoke('zalvo:preview-signins:profile-deleted', request),
  openExternal: url => ipcRenderer.invoke('zalvo:openExternal', url),
  freeTierChallenge: {
    // Load the account service's challenge page in a hidden window (revealed
    // only if the page asks for the human). Resolves with how it ended.
    run: request => ipcRenderer.invoke('zalvo:freeTierChallenge:run', request)
  },
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('zalvo:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('zalvo:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('zalvo:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('zalvo:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('zalvo:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('zalvo:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('zalvo:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('zalvo:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('zalvo:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('zalvo:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('zalvo:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('zalvo:setting:defaultProjectDir:pick')
  },
  preparedSubmissions: {
    read: () => ipcRenderer.invoke('zalvo:prepared-submissions:read'),
    update: (key, entry) => ipcRenderer.invoke('zalvo:prepared-submissions:update', key, entry),
    compareAndSet: (key, expected, entry) =>
      ipcRenderer.invoke('zalvo:prepared-submissions:compare-and-set', key, expected, entry)
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('zalvo:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('zalvo:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:zoom:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('zalvo:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('zalvo:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('zalvo:logs:renderer-error', report),
  logLine: (line: string): void => ipcRenderer.send('zalvo:logs:renderer-line', line),
  readDir: dirPath => ipcRenderer.invoke('zalvo:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('zalvo:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('zalvo:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('zalvo:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('zalvo:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: async () => (await ipcRenderer.invoke('zalvo:fs:reconcileDesktopPlugins')).published,
  reconcileDesktopPluginsReport: () => ipcRenderer.invoke('zalvo:fs:reconcileDesktopPlugins'),
  logsRoot: (profile?: string) => ipcRenderer.invoke('zalvo:fs:logsRoot', profile),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('zalvo:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('zalvo:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('zalvo:fs:trash', targetPath),
  pluginFiles: {
    request: (pluginId, labels) => ipcRenderer.invoke('zalvo:pluginFiles:request', pluginId, labels),
    grants: pluginId => ipcRenderer.invoke('zalvo:pluginFiles:grants', pluginId),
    revoke: (pluginId, folderId) => ipcRenderer.invoke('zalvo:pluginFiles:revoke', pluginId, folderId),
    op: (pluginId, request) => ipcRenderer.invoke('zalvo:pluginFiles:op', pluginId, request),
    onChanged: callback => {
      const listener = (_event, change) => callback(change)
      ipcRenderer.on('zalvo:pluginFiles:changed', listener)

      return () => ipcRenderer.removeListener('zalvo:pluginFiles:changed', listener)
    }
  },
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('zalvo:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('zalvo:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('zalvo:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('zalvo:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('zalvo:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('zalvo:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('zalvo:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('zalvo:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('zalvo:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('zalvo:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('zalvo:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('zalvo:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('zalvo:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('zalvo:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('zalvo:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('zalvo:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('zalvo:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('zalvo:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('zalvo:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('zalvo:git:review:prList', repoPath, branches, numbers),
      createPr: repoPath => ipcRenderer.invoke('zalvo:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('zalvo:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('zalvo:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('zalvo:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('zalvo:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('zalvo:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('zalvo:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `zalvo:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `zalvo:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('zalvo:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('zalvo:preview-nav', listener)

    return () => ipcRenderer.removeListener('zalvo:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('zalvo:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:open-updates', listener)

    return () => ipcRenderer.removeListener('zalvo:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:deep-link', listener)

    return () => ipcRenderer.removeListener('zalvo:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('zalvo:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('zalvo:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('zalvo:plugin:installDesktop', payload),
  removeDesktopPlugin: payload => ipcRenderer.invoke('zalvo:plugin:removeDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:window-state-changed', listener)

    return () => ipcRenderer.removeListener('zalvo:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('zalvo:focus-session', listener)

    return () => ipcRenderer.removeListener('zalvo:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:notification-action', listener)

    return () => ipcRenderer.removeListener('zalvo:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:notification-activate', listener)

    return () => ipcRenderer.removeListener('zalvo:notification-activate', listener)
  },
  onExternalOpenFailed: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:external-open-failed', listener)

    return () => ipcRenderer.removeListener('zalvo:external-open-failed', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('zalvo:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:backend-exit', listener)

    return () => ipcRenderer.removeListener('zalvo:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:connection:applied', listener)

    return () => ipcRenderer.removeListener('zalvo:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:power-resume', listener)

    return () => ipcRenderer.removeListener('zalvo:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('zalvo:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('zalvo:power-battery', listener)

    return () => ipcRenderer.removeListener('zalvo:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:boot-progress', listener)

    return () => ipcRenderer.removeListener('zalvo:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('zalvo:bootstrap:get'),
  probeLocalBackend: () => ipcRenderer.invoke('zalvo:local-backend:probe'),
  continueBootstrapLocal: () => ipcRenderer.invoke('zalvo:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('zalvo:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('zalvo:bootstrap:reset'),
  updateHold: {
    recheck: () => ipcRenderer.invoke('zalvo:update-hold:recheck'),
    quit: () => ipcRenderer.invoke('zalvo:update-hold:quit'),
    startAnyway: (request: { holdId: string; confirmed: true }) =>
      ipcRenderer.invoke('zalvo:update-hold:start-anyway', request)
  },
  repairBootstrap: () => ipcRenderer.invoke('zalvo:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('zalvo:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('zalvo:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('zalvo:bootstrap:event', listener)
  },
  getVersion: (scope?: { connectionId?: string; profile?: string }) => ipcRenderer.invoke('zalvo:version', scope),
  relaunchApp: () => ipcRenderer.invoke('zalvo:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('zalvo:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('zalvo:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('zalvo:uninstall:summary'),
    run: mode => ipcRenderer.invoke('zalvo:uninstall:run', { mode }),
    openAppsSettings: () => ipcRenderer.invoke('zalvo:uninstall:openAppsSettings')
  },
  updates: {
    check: opts => ipcRenderer.invoke('zalvo:updates:check', opts),
    apply: opts => ipcRenderer.invoke('zalvo:updates:apply', opts),
    setChannel: name => ipcRenderer.invoke('zalvo:updates:channel:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('zalvo:updates:progress', listener)

      return () => ipcRenderer.removeListener('zalvo:updates:progress', listener)
    },
    takePendingRun: () => ipcRenderer.invoke('zalvo:updates:metric:take'),
    ackPendingRun: sent => ipcRenderer.invoke('zalvo:updates:metric:ack', sent),
    onPendingRun: callback => {
      const listener = () => callback()
      ipcRenderer.on('zalvo:updates:metric:pending', listener)

      return () => ipcRenderer.removeListener('zalvo:updates:metric:pending', listener)
    }
  },
  desktopMetrics: {
    setEnabled: (on, profile) => ipcRenderer.invoke('zalvo:desktop-metrics:set-enabled', on, profile),
    takeRendererCrashes: () => ipcRenderer.invoke('zalvo:desktop-metrics:crash:take'),
    ackRendererCrashes: sent => ipcRenderer.invoke('zalvo:desktop-metrics:crash:ack', sent)
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('zalvo:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('zalvo:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('zalvo:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('zalvo:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('zalvo:found-in-page', listener)

    return () => ipcRenderer.removeListener('zalvo:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('zalvo:open-find-bar', listener)

    return () => ipcRenderer.removeListener('zalvo:open-find-bar', listener)
  }
})
