/**
 * @zalvo belongs to the default bot only while its source has no real
 * (pre-reservation) `zalvo` profile. With one, the roster shows exactly one
 * @zalvo — the real profile — and the default answers to @default, so a
 * typed @zalvo reaches the same profile the backend's message_agent does.
 */

import { describe, expect, it, vi } from 'vitest'

import { botHandle, botMentionTag, claimDefaultHandles, mergeMultiSourceRoster, resolveRosterMentions } from './data'
import { previewKind } from './row-helpers'
import type { RosterRow } from './types'

vi.mock('@zalvo/plugin-sdk', async () => {
  const { atom } = await import('nanostores')

  return { atom, host: {}, queryClient: undefined, useQuery: vi.fn(), useValue: vi.fn() }
})

vi.mock('./shared', () => ({ getPluginCtx: () => null, ID: 'zalvo-bots' }))

function roster(names: string[]): RosterRow[] {
  const local = { profiles: names.map(name => ({ name })) }

  // What Electron's buildAgentRoster reports for a single local source: bare-name handles.
  const union = {
    agents: names.map(profile => ({
      connectionId: 'local',
      connectionKind: 'local' as const,
      connectionLabel: 'This device',
      handle: profile,
      profile,
      targetProfile: profile
    })),
    primaryConnectionId: 'local'
  }

  return mergeMultiSourceRoster(local, union, 'local').profiles as RosterRow[]
}

describe('the @zalvo handle', () => {
  it.each([
    [['default', 'researcher'], 'default'],
    [['default', 'zalvo', 'researcher'], 'zalvo']
  ])('roster %j shows one @zalvo and a typed @zalvo reaches %s', (names, owner) => {
    const rows = roster(names)
    const handles = rows.map(row => botHandle(row.name, row))

    expect(handles.filter(handle => handle === 'zalvo')).toHaveLength(1)
    expect(rows.map(row => botMentionTag(row)).filter(tag => tag === 'zalvo')).toHaveLength(1)
    expect(resolveRosterMentions('@zalvo ping', rows, { name: 'researcher' }).map(row => row.name)).toEqual([owner])
  })

  it('names the default @default once a real zalvo profile holds the handle', () => {
    const rows = roster(['default', 'zalvo', 'researcher'])
    const byName = Object.fromEntries(rows.map(row => [row.name, botHandle(row.name, row)]))

    expect(byName).toEqual({ default: 'default', zalvo: 'zalvo', researcher: 'researcher' })
    expect(resolveRosterMentions('@default ping', rows, { name: 'researcher' }).map(row => row.name)).toEqual(['default'])
  })

  it('keeps each source separate: a remote zalvo profile does not rename the local default', () => {
    const rows = claimDefaultHandles<Partial<RosterRow>>([
      { connectionId: 'local', name: 'default' },
      { connectionId: 'mini', name: 'default' },
      { connectionId: 'mini', name: 'zalvo' }
    ])

    expect(rows.map(row => botHandle(String(row.name), row))).toEqual(['zalvo', 'default', 'zalvo'])
  })

  it("never lets a source's stale 'zalvo' handle on its default answer @zalvo", () => {
    // An older backend labels its default @zalvo even beside a real zalvo profile.
    const rows = claimDefaultHandles<RosterRow>([
      { connectionId: 'mini', handle: 'zalvo', name: 'default', remoteSource: true },
      { connectionId: 'mini', handle: 'zalvo', name: 'zalvo', remoteSource: true },
      { connectionId: 'local', name: 'researcher' }
    ])

    expect(resolveRosterMentions('@zalvo ping', rows, { name: 'researcher' }).map(row => row.name)).toEqual(['zalvo'])
  })

  it('names a DM sender in a row preview by its roster handle', () => {
    const rows = claimDefaultHandles<RosterRow>(
      ['default', 'zalvo', 'researcher'].map(name => ({ connectionId: 'local', name }))
    )

    const sender = (name: string, list: RosterRow[]) =>
      previewKind(`Message from 🤖 ${name} (@x): hi`, list, 'local').fromBot

    expect([sender('default', rows), sender('zalvo', rows)]).toEqual(['default', 'zalvo'])
    // No real zalvo profile: the default is still @zalvo (#89484).
    expect(sender('default', claimDefaultHandles<RosterRow>([{ connectionId: 'local', name: 'default' }]))).toBe(
      'zalvo'
    )
  })
})
