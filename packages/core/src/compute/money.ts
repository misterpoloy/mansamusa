/** Integer-cent helpers. Every money calculation in core goes through these. */

export function toCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Not a finite amount: ${value}`)
    return Math.round(value * 100)
  }
  const s = value.trim()
  const m = /^(-)?(\d+)(?:\.(\d{1,6}))?$/.exec(s)
  if (!m) throw new Error(`Not a decimal amount: "${value}"`)
  const [, sign, whole, frac = ''] = m
  const padded = (frac + '000000').slice(0, 6)
  // round half away from zero at the cent
  const micro = Number(whole) * 1_000_000 + Number(padded)
  const cents = Math.floor(micro / 10_000) + (micro % 10_000 >= 5_000 ? 1 : 0)
  return sign ? -cents : cents
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
