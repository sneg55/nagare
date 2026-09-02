import { RpcProvider, WalletAccountV6 } from 'starknet'
import { createStore } from '@starknet-io/get-starknet-discovery'

export const WALLET_RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'

export type Connected = {
  wallet: WalletAccountV6
  address: string
}

export async function discoverWallets() {
  const store = createStore({ eip1193Adapters: [] })
  await new Promise((r) => setTimeout(r, 400))
  return store.getWallets()
}

export async function connectWallet(selected: unknown): Promise<Connected> {
  const provider = new RpcProvider({ nodeUrl: WALLET_RPC })
  const wallet = await WalletAccountV6.connect(provider, selected as never)
  const address = wallet.address
  return { wallet, address }
}
