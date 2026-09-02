import { RpcProvider, num } from 'starknet'
import { NAGARE, RPC_URL, STRK } from './config'

export type Stream = {
  token: string
  total: bigint
  withdrawn: bigint
  refunded: bigint
  start: number
  cliff: number
  end: number
  senderPk: string
  recipientPk: string
  canceled: boolean
  nonce: string
  sellable: boolean
  exists: boolean
}

export type Offer = {
  buyerPk: string
  price: bigint
  expiry: number
  generation: bigint
  withdrawnAtOffer: bigint
  live: boolean
}

export const provider = new RpcProvider({ nodeUrl: RPC_URL })

async function call(entrypoint: string, calldata: string[] = []): Promise<string[]> {
  return provider.callContract({ contractAddress: NAGARE, entrypoint, calldata })
}

export async function getStream(streamId: bigint | number): Promise<Stream> {
  const r = await call('get_stream', [num.toHex(BigInt(streamId))])
  return {
    token: r[0],
    total: BigInt(r[1]),
    withdrawn: BigInt(r[2]),
    refunded: BigInt(r[3]),
    start: Number(BigInt(r[4])),
    cliff: Number(BigInt(r[5])),
    end: Number(BigInt(r[6])),
    senderPk: r[7],
    recipientPk: r[8],
    canceled: BigInt(r[9]) !== 0n,
    nonce: r[10],
    sellable: BigInt(r[11]) !== 0n,
    exists: BigInt(r[12]) !== 0n,
  }
}

export async function getOffer(streamId: bigint | number): Promise<Offer> {
  const r = await call('get_offer', [num.toHex(BigInt(streamId))])
  return {
    buyerPk: r[0],
    price: BigInt(r[1]),
    expiry: Number(BigInt(r[2])),
    generation: BigInt(r[3]),
    withdrawnAtOffer: BigInt(r[4]),
    live: BigInt(r[5]) !== 0n,
  }
}

export async function withdrawable(streamId: bigint | number): Promise<bigint> {
  return BigInt((await call('withdrawable', [num.toHex(BigInt(streamId))]))[0])
}

export async function streamCount(): Promise<number> {
  return Number(BigInt((await call('stream_count'))[0]))
}

export async function liability(token: string = STRK): Promise<bigint> {
  return BigInt((await call('liability', [token]))[0])
}

export async function chainId(): Promise<string> {
  return (await call('chain_id'))[0]
}
