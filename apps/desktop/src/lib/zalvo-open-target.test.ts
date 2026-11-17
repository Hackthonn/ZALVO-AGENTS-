import { describe, expect, it } from 'vitest'

import {
  normalizeZalvoOpenString,
  pathFromZalvoDeepLink,
  pathFromOpenDeepLink,
  resolveZalvoOpenPath
} from './zalvo-open-target'

describe('normalizeZalvoOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeZalvoOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeZalvoOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped zalvo:// deep links to the same path', () => {
    expect(normalizeZalvoOpenString('zalvo://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeZalvoOpenString('zalvo://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps zalvo://open/… deep links by stripping the open host', () => {
    expect(normalizeZalvoOpenString('zalvo://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeZalvoOpenString('zalvo://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved zalvo kinds and unsafe paths', () => {
    expect(normalizeZalvoOpenString('zalvo://blueprint/morning-brief')).toBeNull()
    expect(normalizeZalvoOpenString('zalvo://plugin/install')).toBeNull()
    expect(normalizeZalvoOpenString('https://example.com/x')).toBeNull()
    expect(normalizeZalvoOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeZalvoOpenString('index-network')).toBeNull()
  })
})

describe('resolveZalvoOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveZalvoOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveZalvoOpenPath({ href: 'zalvo://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromZalvoDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromZalvoDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from zalvo://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromZalvoDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromZalvoDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromZalvoDeepLink('plugin', 'install')).toBeNull()
  })
})
