// @vitest-environment node
// CI's dependency audit (scripts/audit.mjs) reads npm's report: it fails on
// a serious advisory it doesn't excuse, and on a report npm couldn't make.
import { describe, expect, it } from 'vitest'
import { EXCUSED, stale, unexcused } from './audit.mjs'

function advisory(name, id, severity) {
  return {
    source: 1, name, dependency: name, title: `a flaw in ${name}`, severity, range: '<=1.0.0',
    url: `https://github.com/advisories/${id}`,
  }
}

// As `npm audit --json` writes it: each vulnerable package with its advisories.
function report(...advisories) {
  const vulnerabilities = {}
  for (const found of advisories) {
    vulnerabilities[found.name] = { name: found.name, severity: found.severity, isDirect: false, via: [found] }
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: {} }
}

describe("CI's audit of the site's packages", () => {
  it('fails on a high or critical advisory it does not excuse', () => {
    const found = unexcused(report(
      advisory('left-pad', 'GHSA-aaaa-bbbb-cccc', 'high'),
      advisory('vite', 'GHSA-dddd-eeee-ffff', 'critical'),
    ), {})
    expect(found).toHaveLength(2)
    expect(found[0]).toContain('left-pad (high)')
    expect(found[1]).toContain('https://github.com/advisories/GHSA-dddd-eeee-ffff')
  })

  it('lets through only what it excuses, for the package it names', () => {
    const picomatch = advisory('picomatch', 'GHSA-fc5q-39xc-vjpf', 'high')
    expect(unexcused(report(picomatch))).toEqual([])
    // The same advisory on another package isn't excused.
    expect(unexcused(report({ ...picomatch, name: 'micromatch' }))).toHaveLength(1)
  })

  it('names a package for every exception', () => {
    for (const [id, name] of Object.entries(EXCUSED)) {
      expect(id).toMatch(/^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/)
      expect(name).toBeTruthy()
    }
  })

  it('leaves moderate and low advisories to the report', () => {
    expect(unexcused(report(
      advisory('minimatch', 'GHSA-g3hv-75wg-m249', 'moderate'),
      advisory('debug', 'GHSA-gggg-hhhh-iiii', 'low'),
    ), {})).toEqual([])
  })

  it('counts an advisory once, though a package reached through it lists it again', () => {
    const flaw = advisory('picomatch', 'GHSA-jjjj-kkkk-llll', 'high')
    const both = report(flaw)
    both.vulnerabilities.vite = { name: 'vite', severity: 'high', isDirect: true, via: ['picomatch', flaw] }
    expect(unexcused(both, {})).toHaveLength(1)
  })

  it('fails when npm could not make the report', () => {
    expect(() => unexcused({ error: { code: 'ENOTFOUND', summary: 'request to the registry failed' } }))
      .toThrow("npm audit didn't run: request to the registry failed")
    expect(() => unexcused({})).toThrow("npm audit didn't run")
  })

  it('names an exception the report no longer has, so it can go', () => {
    expect(stale(report(advisory('left-pad', 'GHSA-aaaa-bbbb-cccc', 'high')))).toEqual(Object.keys(EXCUSED))
    expect(stale(report(advisory('picomatch', 'GHSA-fc5q-39xc-vjpf', 'high')))).toEqual([])
  })
})
