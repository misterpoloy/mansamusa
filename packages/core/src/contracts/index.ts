import { computeContracts } from './compute.js'
import { proposeContracts } from './propose.js'
import { readContracts } from './read.js'

export * from './define.js'
export * from './money.js'
export * from './read.js'
export * from './propose.js'
export * from './compute.js'

/** The full contract set a wallet host implements. */
export const walletContracts = {
  ...readContracts,
  ...proposeContracts,
  ...computeContracts,
} as const

export type WalletContracts = typeof walletContracts
export type ReadContracts = typeof readContracts
