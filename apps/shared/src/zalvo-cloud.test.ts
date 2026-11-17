import { describe, expect, it } from 'vitest'

import { isZalvoCloudUrl } from './zalvo-cloud'

describe('isZalvoCloudUrl', () => {
  it('recognises production and staging agent hosts, nothing else', () => {
    expect(isZalvoCloudUrl('https://ares-3009.agents.nousresearch.com')).toBe(true)
    expect(isZalvoCloudUrl('https://ares--app.agents.staging-nousresearch.com/')).toBe(true)
    expect(isZalvoCloudUrl('https://agents.nousresearch.com.evil.example')).toBe(false)
    expect(isZalvoCloudUrl('https://my-box.tailnet.ts.net')).toBe(false)
    expect(isZalvoCloudUrl('not a url')).toBe(false)
    expect(isZalvoCloudUrl(undefined)).toBe(false)
  })
})
