// CI's dependency audit (.github/workflows/ci.yml): it fails on a known
// vulnerability, high or critical, in anything the site is built from or
// runs, except the ones excused below, each with its reason. npm audit
// itself can't leave one out: --omit=dev would stop checking every
// development tool, Vite and Vitest among them.
//
// Usage: npm audit --json > report.json; node scripts/audit.mjs report.json
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const EXCUSED = {
  // picomatch through 4.0.7, the newest (CVE-2026-112366): a glob pattern an
  // attacker supplies, such as +(*a), can block Node for a long time. Here
  // the only patterns are the project's own, in Vite's, Vitest's and
  // ESLint's settings, and picomatch never reaches the built site. No fixed
  // version is out: once one is, update to it and drop this.
  'GHSA-fc5q-39xc-vjpf': 'picomatch',
}

const SERIOUS = new Set(['high', 'critical'])

function advisories(report) {
  if (report.error || !report.vulnerabilities) {
    throw new Error(`npm audit didn't run: ${report.error?.summary || 'no report'}`)
  }
  // A package reached through a vulnerable one lists that package's name;
  // the advisories themselves are the objects.
  return Object.values(report.vulnerabilities)
    .flatMap((entry) => entry.via)
    .filter((via) => typeof via === 'object')
    .map((via) => ({ ...via, id: via.url.split('/').pop() }))
}

/** The serious advisories in an `npm audit --json` report that aren't
 *  excused, one line each. Throws when the report says the audit didn't run. */
export function unexcused(report, excused = EXCUSED) {
  const found = new Map()
  for (const advisory of advisories(report)) {
    if (SERIOUS.has(advisory.severity) && excused[advisory.id] !== advisory.name) {
      found.set(advisory.id, `${advisory.name} (${advisory.severity}): ${advisory.title} ${advisory.url}`)
    }
  }
  return [...found.values()]
}

/** Excused advisories the report no longer has: their exceptions can go. */
export function stale(report, excused = EXCUSED) {
  const reported = new Set(advisories(report).map((advisory) => advisory.id))
  return Object.keys(excused).filter((id) => !reported.has(id))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  for (const id of stale(report)) {
    console.log(`${id} is excused in scripts/audit.mjs but no longer reported: remove its exception`)
  }
  const problems = unexcused(report)
  for (const line of problems) console.error(line)
  console.log(problems.length
    ? `${problems.length} known vulnerabilities, high or critical: update, or excuse one with its reason in scripts/audit.mjs`
    : 'No known vulnerabilities, high or critical, besides those excused in scripts/audit.mjs')
  process.exitCode = problems.length ? 1 : 0
}
