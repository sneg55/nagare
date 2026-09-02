# Nagare

Private token vesting on Starknet. A sender funds a lockup from a shielded STRK20
balance, the recipient withdraws what has vested into a private note, and no wallet
address of either party appears in any Nagare transaction.

Nagare is a STRK20 anonymizer. The sender and the recipient of a stream are Stark-curve
public keys generated in the browser, not wallet addresses, and every withdrawal,
cancellation, re-key and sale is an ECDSA signature over the operation, bound to the
chain, the contract, the stream, the note being paid into and a nonce.

## Why keys instead of addresses

Every on-chain vesting contract today publishes the cap table. Open a Tokei or Sablier
stream on Voyager and you see who funds whom, on what schedule, for how much, forever.
Nagare moves the funding and the payouts inside the STRK20 pool: the pool pays Nagare
and Nagare pays the pool, so the graph between sender and recipient is never drawn.

## What the chain can and cannot see

| Not disclosed on-chain | Disclosed on-chain |
|---|---|
| The wallet address that funded a stream | Each stream's total, token, start, cliff, end, and its id |
| The wallet address that receives it | The sender key and recipient key of every stream (pseudonyms), and every re-key |
| The wallet address that canceled, transferred, listed, offered or accepted | Nagare's STRK balance and per-token liability |
| Which wallet owns the open note a payout lands in | Each withdrawal's, refund's and sale's amount and time |
| | Whether a stream is listed for sale, and every offer's price, expiry and buyer key |
| | Every signature and every calldata item, including note ids |

The word is disclosed, not hidden. Amounts, schedules and timing are public. A
distinctive amount withdrawn shortly after a distinctive shield can be correlated. A key
reused across streams links those streams, which is why sender keys are per stream.
Shielding itself publishes the depositor's address and the amount. The exact claim is
that no wallet address of either party appears in any Nagare transaction, and that is
the only claim.

## Operations

All eight run through `privacy_invoke`, callable only by the STRK20 pool.

| Op | Who signs | What it does |
|---|---|---|
| Create | nobody (the pool's withdraw is the authorization) | Opens a stream from a shielded balance |
| Withdraw | recipient key | Pays the vested, unwithdrawn amount into an open note |
| Cancel | sender key | Refunds the unvested part; the vested part stays claimable |
| Transfer | recipient key | Re-keys the position to a new holder |
| List | recipient key | Opens or closes the stream to offers |
| Offer | nobody (the buyer's escrow is the authorization) | Escrows a price against a listed stream |
| Accept | recipient key | Re-keys to the buyer and pays the price into the seller's note |
| Reclaim | buyer key | Returns an unaccepted escrow to the buyer |

Vesting is linear from `start` to `end` with a `cliff` before which nothing is
withdrawable, the same curve as Tokei's LockupLinear.

Every operation is a STRK20 private transaction, and the pool charges a flat 6 STRK fee
for each one, taken from the sender's shielded balance on top of the amount being moved.
That fee is the pool's, not Nagare's.

## Deployment

Live on Starknet mainnet, against the STRK20 pool at
`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`, with STRK as the
only admitted token.

| | |
|---|---|
| Contract | [`0x00ae22ea6b8c2e10bb19450d4caac7d31c89168379e4aef02d83e3eb8f03e323`](https://voyager.online/contract/0x00ae22ea6b8c2e10bb19450d4caac7d31c89168379e4aef02d83e3eb8f03e323) |
| Class hash | [`0x0015bbc96d70c0a295000cdbb433f00f258427e48eaaaa58fb2d864db898abb8`](https://voyager.online/class/0x0015bbc96d70c0a295000cdbb433f00f258427e48eaaaa58fb2d864db898abb8) |

There is no owner, no pause and no upgrade path. A fix means a new class at a new
address, and this table is how you tell which one you are looking at.

## Status

Create, Withdraw and Cancel are proven on Starknet mainnet, each carrying pool events and
a Nagare event; the hashes are in [`strk20.json`](strk20.json). The contract has 46 tests
green under snforge, including a signature vector generated in TypeScript and verified in
Cairo so the browser signer and the contract cannot drift.

The product client and the demo are in progress.

Not audited.

## Build

```
scarb build
snforge test
```

Toolchain versions are pinned in `.tool-versions`.

## License

MIT, see [LICENSE](LICENSE).
