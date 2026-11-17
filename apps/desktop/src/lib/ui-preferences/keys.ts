/**
 * Which persisted keys are machine-level UI preferences (#145213).
 *
 * Only these leave localStorage for the machine's shared store, so native
 * Desktop and every browser that opens this machine's Webapp show the same
 * choices. Scoped families keep their scope inside the key name (a
 * `….profile.<name>` or per-connection suffix): only the location changes.
 *
 * Deliberately NOT here (they stay in this browser/window):
 * - credentials, grants and connection config: gateway registry, custom model
 *   endpoints, plugin decisions and preview-script grants, embed permissions;
 * - per-window or per-device runtime state: layout tree, open tiles and tabs,
 *   last route/session, scroll, zoom, pet and popout geometry, keep-awake;
 * - drafts, queues, journals and caches: composer queue, in-flight turns,
 *   pending/prepared submissions, previews, pricing, backend skin cache, the
 *   "provider configured" onboarding cache (each backend answers that itself);
 * - one-off notices: butterbar, update and real-profile prompts.
 */

const SHARED_KEYS: ReadonlySet<string> = new Set([
  // Appearance.
  'zalvo-desktop-theme-v2',
  'zalvo-desktop-mode-v1',
  'zalvo-desktop-profile-themes-v1',
  'zalvo-desktop-profile-modes-v1',
  'zalvo-desktop-user-themes-v1',
  'zalvo.desktop.backdrop.v1',
  'zalvo.desktop.chat-text-scale.v1',
  'zalvo.desktop.interfaceMode.v1',
  'zalvo.desktop.textDirection',
  'zalvo.desktop.translucency.v2',
  'zalvo.desktop.user-bubble-transparency.v1',
  // Sessions sidebar and profile rail.
  'zalvo.desktop.agentsGroupedByWorkspace',
  'zalvo.desktop.profileColors',
  'zalvo.desktop.profileOrder',
  'zalvo.desktop.profileRailVisible',
  'zalvo.desktop.sessionListDensity',
  'zalvo.desktop.sessionOrder',
  'zalvo.desktop.sessionOrder.manual',
  'zalvo.desktop.showAllProfiles',
  'zalvo.desktop.sidebarAgentsGrouped.allProfiles',
  'zalvo.desktop.sidebarCardRows',
  'zalvo.desktop.sidebarGrouping',
  'zalvo.desktop.sidebarGrouping.allProfiles',
  'zalvo.desktop.sidebarRowMeta',
  'zalvo.desktop.sidebarShowAllSessions',
  'zalvo.desktop.sidebarShowArchived',
  'zalvo.desktop.sidebarSortKey',
  // Status bar.
  'zalvo.desktop.statusbarHidden.v2',
  'zalvo.desktop.statusbarVisible.v2',
  // Transcript and tools.
  'zalvo.desktop.hideThreadTimeline',
  'zalvo.desktop.reasoning.collapsedByDefault',
  'zalvo.desktop.toolView.hideCodeDiffs',
  'zalvo.desktop.toolView.technical',
  // Shell, panes and behaviour.
  'zalvo.desktop.alwaysExternalLinks.v1',
  'zalvo.desktop.capabilities.catalogCardView',
  'zalvo.desktop.composerPopout.enabled',
  'zalvo.desktop.composerPopout.gesturesEnabled',
  'zalvo.desktop.files.showIgnored',
  'zalvo.desktop.keybinds',
  'zalvo.desktop.layoutPresets.v2',
  'zalvo.desktop.panesFlipped',
  'zalvo.desktop.tabStripDefault',
  'zalvo.desktop.titlebarAppActions',
  // Guidance: what the user already skipped, saw or dismissed does not come
  // back in every new browser or origin (#145600).
  'zalvo-onboarding-skipped-v1',
  'zalvo.desktop.tips.last.v1',
  'zalvo.desktop.tips.next.v1',
  'zalvo.desktop.tips.retired.v1',
  'zalvo.desktop.tips.rotation.v1',
  'zalvo.desktop.tips.shownAt.v1',
  'zalvo.desktop.tours.v1',
  // Sound and media.
  'zalvo.desktop.autoSpeakReplies',
  'zalvo.desktop.completionSoundVariantId',
  'zalvo.desktop.hapticsMuted',
  'zalvo.desktop.videoPlaybackSpeed',
  // Model picker.
  'zalvo.desktop.collapsed-providers',
  'zalvo.desktop.favorite-models',
  // visible-models is a diff against known-models: they only make sense together.
  'zalvo.desktop.known-models',
  'zalvo.desktop.model-presets',
  'zalvo.desktop.visible-models'
])

/** Families whose scope rides in the key suffix (gateway aliases/order/collapsed). */
const SHARED_PREFIXES: readonly string[] = ['zalvo.desktop.sidebar.gatewayGroups.v1.']

export function isSharedPreferenceKey(key: string): boolean {
  return SHARED_KEYS.has(key) || SHARED_PREFIXES.some(prefix => key.startsWith(prefix))
}
