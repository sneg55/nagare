import { NAGARE, POOL, STRK } from '../src/lib/nagare/config'
import { createActions, keyedActions, offerActions, payoutActions } from '../src/lib/nagare/actions'

const FELT = /^0x(0|[a-fA-F1-9]{1}[a-fA-F0-9]{0,62})$/
const PLACEHOLDER = /^\$\{(?:openNoteIds\[[0-9]+\]|poolAddress)\}$/

const bad: string[] = []

function checkFelt(where: string, v: string) {
  if (!FELT.test(v)) bad.push(`${where}: ${v}`)
}

for (const [name, v] of Object.entries({ NAGARE, POOL, STRK })) checkFelt(`config.${name}`, v)

const create = createActions({
  total: 10n ** 18n,
  start: 1,
  cliff: 2,
  end: 3,
  senderPk: '0x5',
  recipientPk: '0x6',
})
const payout = payoutActions({ op: 'Withdraw', streamId: 1, recipientAddress: '0x7' })
const keyed = keyedActions('List', 1, 1, '0x8', ['0x9', '0xa'])
const offer = offerActions(1, '0xb', 10n ** 18n, 4)

for (const [label, actions] of [['create', create], ['payout', payout], ['keyed', keyed], ['offer', offer]] as const) {
  actions.forEach((a, i) => {
    if (a.type === 'invoke') {
      checkFelt(`${label}[${i}].contract`, a.contract)
      a.calldata.forEach((c, j) => {
        if (!PLACEHOLDER.test(c)) checkFelt(`${label}[${i}].calldata[${j}]`, c)
      })
    } else {
      checkFelt(`${label}[${i}].token`, a.token)
      if (a.amount !== 'OPEN') checkFelt(`${label}[${i}].amount`, a.amount)
      if ('recipient' in a) checkFelt(`${label}[${i}].recipient`, a.recipient)
    }
  })
}

if (bad.length) {
  console.error('values that violate the Wallet API FELT pattern:')
  for (const b of bad) console.error('  ' + b)
  process.exit(1)
}
console.log('every action field satisfies the Wallet API FELT pattern')
