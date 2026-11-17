import { describe, expect, it } from 'vitest'

import { commandLineIsZalvoRuntime } from './zalvo-process'

// HX003: process identity comes from a whole argv TOKEN, never an argv substring.
describe('commandLineIsZalvoRuntime (HX003 token matching)', () => {
  it('matches a real ZALVO gateway command line', () => {
    expect(commandLineIsZalvoRuntime('zalvo\0gateway\0run')).toBe(true)
    expect(commandLineIsZalvoRuntime('zalvo gateway run')).toBe(true)
    expect(commandLineIsZalvoRuntime('zalvo --profile work gateway run')).toBe(true)
  })

  it('matches a ZALVO launched by an interpreter (basename of a path token)', () => {
    expect(commandLineIsZalvoRuntime('/venv/bin/python\0/venv/bin/zalvo\0gateway\0run')).toBe(true)
    expect(commandLineIsZalvoRuntime('C:\\ZALVO\\zalvo.exe gateway run')).toBe(true)
  })

  // The bug this replaces: a bare `.includes('zalvo')` matched any of these.
  it('does NOT match an unrelated process whose path merely contains "zalvo"', () => {
    expect(commandLineIsZalvoRuntime('vim /home/user/zalvo-notes.txt')).toBe(false)
    expect(commandLineIsZalvoRuntime('/opt/zalvobrew/bin/tool --run')).toBe(false)
    expect(commandLineIsZalvoRuntime('node /srv/zalvo-dashboard/server.js')).toBe(false)
    expect(commandLineIsZalvoRuntime('cat ~/.zalvo/config.yaml')).toBe(false)
  })

  // G2 (#150283): the real unmanaged-gateway launch is `python -m zalvo_cli.main … gateway
  // run`, which the executable-basename-only matcher REJECTED — so findRunningGatewayProfiles
  // missed a live gateway at first launch / profile repair. Mirror the canonical Python matcher
  // (gateway.status.looks_like_gateway_command_line): recognize the module entry point, by argv
  // TOKENS not a substring, carrying the gateway subcommand.
  it('matches a module-launched gateway (python -m zalvo_cli.main … gateway run)', () => {
    expect(commandLineIsZalvoRuntime('python\0-m\0zalvo_cli.main\0-p\0x\0gateway\0run')).toBe(true)
    expect(commandLineIsZalvoRuntime('python -m zalvo_cli.main -p x gateway run')).toBe(true)
    expect(commandLineIsZalvoRuntime('/venv/bin/python /venv/lib/zalvo_cli/main.py gateway run')).toBe(true)
    expect(commandLineIsZalvoRuntime('python -m zalvo_cli.main --profile work gateway run')).toBe(true)
  })

  it('does NOT match a module entry without the gateway subcommand, nor an unrelated zalvo-tool path', () => {
    // A zalvo_cli.main invocation that is not a gateway (e.g. `chat`) is not a running gateway.
    expect(commandLineIsZalvoRuntime('python -m zalvo_cli.main chat')).toBe(false)
    // HX003: no substring; an unrelated tool whose path contains "zalvo" is never a runtime.
    expect(commandLineIsZalvoRuntime('/opt/zalvo-tool/foo gateway run')).toBe(false)
    // `-p gateway` is a profile value, not a subcommand.
    expect(commandLineIsZalvoRuntime('python -m zalvo_cli.main -p gateway chat')).toBe(false)
  })
})
