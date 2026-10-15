import { toCents } from './money.js'

export interface DedupCandidate {
  accountId: string
  /** YYYY-MM-DD in the user's timezone */
  date: string
  type: 'expense' | 'income'
  amount: string | number
  note?: string | null
  payee?: string | null
}

export interface ExistingTransaction extends DedupCandidate {
  id: string
  contentHash?: string | null
}

export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Stable identity for agent-created rows: "m1:" + sha256(account|date|type|cents|note). */
export async function mansaHash(c: DedupCandidate): Promise<string> {
  const key = [c.accountId, c.date, c.type, toCents(c.amount), normalizeText(c.note ?? c.payee)].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `m1:${hex}`
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

export interface DedupMatch {
  existingId: string
  reason: 'hash' | 'fuzzy'
}

/**
 * Exact match on mansaHash first; otherwise same account + type + amount within
 * ±dayTolerance days. Fuzzy matching is what catches rows inserted by older seed
 * scripts, which carry no contentHash. Each existing row matches at most once.
 */
export async function findDuplicates(
  candidates: DedupCandidate[],
  existing: ExistingTransaction[],
  { dayTolerance = 1 }: { dayTolerance?: number } = {},
): Promise<(DedupMatch | null)[]> {
  const used = new Set<string>()
  const byHash = new Map(existing.filter((e) => e.contentHash).map((e) => [e.contentHash!, e]))
  const out: (DedupMatch | null)[] = []
  for (const c of candidates) {
    const hash = await mansaHash(c)
    const exact = byHash.get(hash)
    if (exact && !used.has(exact.id)) {
      used.add(exact.id)
      out.push({ existingId: exact.id, reason: 'hash' })
      continue
    }
    const cents = toCents(c.amount)
    const fuzzy = existing
      .filter((e) => !used.has(e.id) && e.accountId === c.accountId && e.type === c.type && toCents(e.amount) === cents && dayDiff(e.date, c.date) <= dayTolerance)
      .sort((a, b) => dayDiff(a.date, c.date) - dayDiff(b.date, c.date))[0]
    if (fuzzy) {
      used.add(fuzzy.id)
      out.push({ existingId: fuzzy.id, reason: 'fuzzy' })
    } else {
      out.push(null)
    }
  }
  return out
}
