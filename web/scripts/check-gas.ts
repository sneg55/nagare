import { RpcProvider, uint256 } from 'starknet'
const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/demo'
const ACCOUNTS = {
  'your Ready account': '0x5990a129f6591572cc902573f743f8f13570ffb6e5734e3da8afa5081fb9e3e',
  'nagare deployer': '0x059c8d24197f91ab4523390aafcc25e0b40c967e9bf2ee9ceda6dc6239627182',
}
const T = {
  STRK: ['0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d', 18],
  ETH: ['0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', 18],
} as const
async function main() {
  const p = new RpcProvider({ nodeUrl: RPC })
  for (const [label, addr] of Object.entries(ACCOUNTS)) {
    const out: string[] = []
    for (const [sym, [t, dec]] of Object.entries(T)) {
      const r = await p.callContract({ contractAddress: t, entrypoint: 'balanceOf', calldata: [addr] })
      out.push(`${sym}=${Number(uint256.uint256ToBN({ low: r[0], high: r[1] })) / 10 ** dec}`)
    }
    console.log(label.padEnd(20), out.join('  '))
  }
}
main().catch((e) => { console.error(e.message); process.exit(1) })
