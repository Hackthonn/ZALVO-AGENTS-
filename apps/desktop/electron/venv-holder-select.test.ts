import assert from 'node:assert/strict'

import { test } from 'vitest'

import { hasWindowsPathPrefix, isExternalVenvHolder, isZalvoOwnedVenvDaemon } from './venv-holder-select'

const SCRIPTS = 'C:\\ZALVO\\venv\\Scripts'

test('matches the hindsight daemon shim (exe under venv Scripts + hindsight cmdline)', () => {
  assert.equal(
    isZalvoOwnedVenvDaemon(
      'C:\\ZALVO\\venv\\Scripts\\pythonw.exe',
      'C:\\ZALVO\\venv\\Scripts\\pythonw.exe -m hindsight_api.main --daemon --idle-timeout 300 --port 9177',
      SCRIPTS
    ),
    true
  )
})

test('Windows path prefix match is ordinal case-insensitive', () => {
  assert.equal(
    isZalvoOwnedVenvDaemon(
      'c:\\zalvo\\venv\\scripts\\python.exe',
      'python.exe -m hindsight_api.main --daemon',
      'C:\\ZALVO\\venv\\Scripts'
    ),
    true
  )
})

test('excludes external venv holders that are not the hindsight daemon', () => {
  // a user terminal running the zalvo CLI from the venv — must NOT be killed
  assert.equal(isZalvoOwnedVenvDaemon('C:\\ZALVO\\venv\\Scripts\\zalvo.exe', 'zalvo chat -q "hi"', SCRIPTS), false)
  // an unrelated python script using the venv interpreter
  assert.equal(
    isZalvoOwnedVenvDaemon('C:\\ZALVO\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
})

test('excludes exes outside the venv even when the cmdline mentions hindsight', () => {
  assert.equal(
    isZalvoOwnedVenvDaemon('C:\\Other\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('prefix boundary: sibling dirs (ScriptsX) do not match', () => {
  assert.equal(hasWindowsPathPrefix('C:\\ZALVO\\venv\\ScriptsX\\python.exe', SCRIPTS), false)
  assert.equal(hasWindowsPathPrefix('C:\\ZALVO\\venv\\Scripts\\python.exe', SCRIPTS), true)
})

test('null/undefined fields never match', () => {
  assert.equal(isZalvoOwnedVenvDaemon(null, 'x', SCRIPTS), false)
  assert.equal(isZalvoOwnedVenvDaemon('C:\\ZALVO\\venv\\Scripts\\pythonw.exe', null, SCRIPTS), false)
  assert.equal(isZalvoOwnedVenvDaemon(undefined, undefined, SCRIPTS), false)
})

// --- isExternalVenvHolder (#62311) ------------------------------------------

test('matches the autostart gateway shim (zalvo.exe under venv Scripts)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\ZALVO\\venv\\Scripts\\zalvo.exe',
      '"C:\\ZALVO\\venv\\Scripts\\zalvo.exe" gateway run --external-supervisor',
      SCRIPTS
    ),
    true
  )
})

test('matches the dashboard scheduled task (python -m zalvo_cli / -m zalvo)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\ZALVO\\venv\\Scripts\\python.exe',
      '"C:\\ZALVO\\venv\\Scripts\\python.exe" -m zalvo_cli.main dashboard',
      SCRIPTS
    ),
    true
  )
  assert.equal(
    isExternalVenvHolder('C:\\ZALVO\\venv\\Scripts\\pythonw.exe', 'pythonw.exe -m zalvo serve', SCRIPTS),
    true
  )
})

test('never matches an unrelated process that merely borrows the venv interpreter', () => {
  // a user's own script running on the venv python — NOT ZALVO, must NOT be killed
  assert.equal(
    isExternalVenvHolder('C:\\ZALVO\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
  // hindsight daemon is selected by isZalvoOwnedVenvDaemon, not here
  assert.equal(
    isExternalVenvHolder('C:\\ZALVO\\venv\\Scripts\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('never matches a process outside the venv, even with zalvo in the cmdline', () => {
  // an editor / shell whose command line mentions the install root (#62445 regression guard)
  assert.equal(
    isExternalVenvHolder('C:\\Windows\\System32\\cmd.exe', 'cmd /c cd C:\\ZALVO\\venv\\Scripts && dir', SCRIPTS),
    false
  )
  assert.equal(isExternalVenvHolder('C:\\Other\\zalvo.exe', 'zalvo gateway run', SCRIPTS), false)
})

test('sibling-dir and boundary safety for the external selector', () => {
  assert.equal(isExternalVenvHolder('C:\\ZALVO\\venv\\ScriptsX\\zalvo.exe', 'zalvo gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder(null, 'zalvo gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder('C:\\ZALVO\\venv\\Scripts\\zalvo.exe', null, SCRIPTS), false)
})
