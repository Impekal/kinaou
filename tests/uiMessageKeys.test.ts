import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/**
 * Message modules are merged with object spread, so a key defined in two modules does
 * not fail to compile — the later one silently replaces the earlier one and a panel
 * shows another feature's text. This reads the sources because the merged object can
 * no longer tell.
 */
it('defines every interface message key in exactly one module', () => {
  const directory = fileURLToPath(new URL('../src/core/', import.meta.url))
  const owners = new Map<string, string[]>()
  for (const file of readdirSync(directory).filter(name => /^ui.*Messages.*\.ts$/.test(name)).sort()) {
    for (const match of readFileSync(directory + file, 'utf8').matchAll(/^\s*'([A-Za-z0-9_.-]+)'\s*:\s*\[/gm)) owners.set(match[1], [...(owners.get(match[1]) ?? []), file])
  }
  expect(owners.size).toBeGreaterThan(2500)
  expect([...owners].filter(([, files]) => files.length > 1).map(([key, files]) => `${key} ← ${files.join(', ')}`)).toEqual([])
})
