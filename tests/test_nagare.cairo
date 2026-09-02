use nagare::{INagareDispatcher, INagareDispatcherTrait, Op, signing_hash};
use privacy::objects::OpenNoteDeposit;
use snforge_std::signature::KeyPairTrait;
use snforge_std::signature::stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

#[starknet::interface]
trait IMint<T> {
    fn mint(ref self: T, to: ContractAddress, amount: u256);
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;
}

const POOL: felt252 = 0x40337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a;
const START: u64 = 1_000;
const CLIFF: u64 = 1_300;
const END: u64 = 2_200;
const TOTAL: u128 = 30_000;
const PRICE: u128 = 5_000;
const EXPIRY: u64 = 1_900;
const NOTE: felt252 = 77;
const REFUND_NOTE: felt252 = 900;

type Key = snforge_std::signature::KeyPair<felt252, felt252>;

fn pool() -> ContractAddress {
    POOL.try_into().unwrap()
}

fn zero() -> ContractAddress {
    0.try_into().unwrap()
}

#[derive(Drop)]
struct Fx {
    stream: INagareDispatcher,
    token: ContractAddress,
    chain_id: felt252,
    sender: Key,
    recipient: Key,
}

fn deploy(total: u128) -> Fx {
    let token_class = declare("MockErc20").unwrap().contract_class();
    let (token, _) = token_class.deploy(@array![]).unwrap();
    let nagare_class = declare("Nagare").unwrap().contract_class();
    let (addr, _) = nagare_class.deploy(@array![POOL, token.into()]).unwrap();
    let stream = INagareDispatcher { contract_address: addr };
    IMintDispatcher { contract_address: token }.mint(addr, total.into());
    let sender = KeyPairTrait::<felt252, felt252>::generate();
    let recipient = KeyPairTrait::<felt252, felt252>::generate();
    start_cheat_block_timestamp_global(START);
    start_cheat_caller_address(addr, pool());
    Fx { stream, token, chain_id: stream.chain_id(), sender, recipient }
}

fn create(fx: @Fx, total: u128, start: u64, cliff: u64, end: u64) {
    (*fx.stream)
        .privacy_invoke(
            Op::Create,
            0,
            *fx.token,
            total,
            start,
            cliff,
            end,
            (*fx.sender).public_key,
            (*fx.recipient).public_key,
            0,
            0,
            0,
            0,
        );
}

fn setup() -> Fx {
    let fx = deploy(TOTAL);
    create(@fx, TOTAL, START, CLIFF, END);
    fx
}

fn fund(fx: @Fx, amount: u128) {
    IMintDispatcher { contract_address: *fx.token }
        .mint((*fx.stream).contract_address, amount.into());
}

fn invoke(
    fx: @Fx, op: Op, stream_id: u64, note_id: felt252, arg: felt252, r: felt252, s: felt252,
) -> Span<OpenNoteDeposit> {
    (*fx.stream).privacy_invoke(op, stream_id, zero(), 0, 0, 0, 0, 0, 0, arg, note_id, r, s)
}

fn offer(fx: @Fx, stream_id: u64, buyer_pk: felt252, price: u128, expiry: u64) {
    (*fx.stream)
        .privacy_invoke(Op::Offer, stream_id, zero(), price, 0, 0, expiry, 0, 0, buyer_pk, 0, 0, 0);
}

fn sign(
    fx: @Fx, kp: @Key, stream_id: u64, op: Op, note_id: felt252, arg: felt252, nonce: felt252,
) -> (felt252, felt252) {
    let h = signing_hash(
        *fx.chain_id, (*fx.stream).contract_address.into(), stream_id, op, note_id, arg, nonce,
    );
    (*kp).sign(h).unwrap()
}

fn allowance(fx: @Fx) -> u256 {
    IMintDispatcher { contract_address: *fx.token }.allowance((*fx.stream).contract_address, pool())
}

fn assert_liability(fx: @Fx, expected: u128) {
    assert!((*fx.stream).liability(*fx.token) == expected, "liability drifted");
}

fn midpoint() -> u64 {
    START + (END - START) / 2
}

fn vested_at(t: u64) -> u128 {
    TOTAL * ((t - START).into()) / ((END - START).into())
}

#[test]
fn create_records_schedule_and_reserves_funds() {
    let fx = setup();
    let s = fx.stream.get_stream(1);
    assert!(s.exists && s.total == TOTAL && s.cliff == CLIFF && s.end == END && !s.canceled);
    assert!(fx.stream.withdrawable(1) == 0);
    assert!(fx.stream.stream_count() == 1);
    assert_liability(@fx, TOTAL);
}

#[test]
#[should_panic(expected: 'BAD_TOKEN')]
fn create_with_a_foreign_token_reverts() {
    let fx = deploy(TOTAL);
    let other = declare("MockErc20").unwrap().contract_class();
    let (other_token, _) = other.deploy(@array![]).unwrap();
    fx
        .stream
        .privacy_invoke(
            Op::Create,
            0,
            other_token,
            TOTAL,
            START,
            CLIFF,
            END,
            fx.sender.public_key,
            fx.recipient.public_key,
            0,
            0,
            0,
            0,
        );
}

#[test]
#[should_panic(expected: 'UNFUNDED')]
fn create_beyond_the_balance_reverts() {
    let fx = setup();
    create(@fx, 1, START, CLIFF, END);
}

#[test]
#[should_panic(expected: 'NOTHING_VESTED')]
fn withdraw_before_cliff_reverts() {
    let fx = setup();
    start_cheat_block_timestamp_global(CLIFF - 1);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
}

#[test]
fn withdraw_at_midpoint_credits_half_to_the_named_note() {
    let fx = setup();
    start_cheat_block_timestamp_global(midpoint());
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    let out = invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
    assert!(out.len() == 1);
    let d = *out.at(0);
    assert!(d.note_id == NOTE && d.amount == TOTAL / 2 && d.token == fx.token);
    assert!(allowance(@fx) == (TOTAL / 2).into());
    assert_liability(@fx, TOTAL - TOTAL / 2);
}

#[test]
fn accrual_is_zero_at_start_and_through_the_cliff() {
    let fx = setup();
    assert!(fx.stream.withdrawable(1) == 0);
    start_cheat_block_timestamp_global(CLIFF - 1);
    assert!(fx.stream.withdrawable(1) == 0);
}

#[test]
fn accrual_jumps_to_the_elapsed_share_at_the_cliff() {
    let fx = setup();
    start_cheat_block_timestamp_global(CLIFF);
    assert!(fx.stream.withdrawable(1) == vested_at(CLIFF));
}

#[test]
fn accrual_is_total_at_and_after_the_end() {
    let fx = setup();
    start_cheat_block_timestamp_global(END - 1);
    assert!(fx.stream.withdrawable(1) < TOTAL);
    start_cheat_block_timestamp_global(END);
    assert!(fx.stream.withdrawable(1) == TOTAL);
    start_cheat_block_timestamp_global(END + 10_000);
    assert!(fx.stream.withdrawable(1) == TOTAL);
}

#[test]
fn accrual_does_not_overflow_at_the_maximum_total() {
    let max: u128 = 0xffffffffffffffffffffffffffffffff;
    let fx = deploy(max);
    create(@fx, max, START, CLIFF, END);
    start_cheat_block_timestamp_global(END - 1);
    let elapsed: u256 = (END - 1 - START).into();
    let duration: u256 = (END - START).into();
    let expected: u128 = ((max.into() * elapsed) / duration).try_into().unwrap();
    assert!(fx.stream.withdrawable(1) == expected);
}

#[test]
#[should_panic(expected: 'INVALID_SIG')]
fn replayed_signature_cannot_redirect_to_another_note() {
    let fx = setup();
    start_cheat_block_timestamp_global(midpoint());
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, 78, 0, r, s);
}

#[test]
#[should_panic(expected: 'INVALID_SIG')]
fn spent_signature_cannot_be_replayed_after_nonce_advances() {
    let fx = setup();
    start_cheat_block_timestamp_global(midpoint());
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
    start_cheat_block_timestamp_global(END);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
}

#[test]
#[should_panic(expected: 'INVALID_SIG')]
fn sender_key_cannot_withdraw() {
    let fx = setup();
    start_cheat_block_timestamp_global(END);
    let (r, s) = sign(@fx, @fx.sender, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
}

#[test]
fn a_signature_for_another_chain_is_rejected() {
    let fx = setup();
    let a = signing_hash(fx.chain_id, 1, 1, Op::Withdraw, NOTE, 0, 0);
    let b = signing_hash('OTHER_CHAIN', 1, 1, Op::Withdraw, NOTE, 0, 0);
    let c = signing_hash(fx.chain_id, 2, 1, Op::Withdraw, NOTE, 0, 0);
    assert!(a != b && a != c);
}

#[test]
fn cancel_refunds_unvested_and_recipient_keeps_vested() {
    let fx = setup();
    let t = START + (END - START) / 3;
    start_cheat_block_timestamp_global(t);
    let (r, s) = sign(@fx, @fx.sender, 1, Op::Cancel, REFUND_NOTE, 0, 0);
    let out = invoke(@fx, Op::Cancel, 1, REFUND_NOTE, 0, r, s);
    let vested = vested_at(t);
    assert!((*out.at(0)).note_id == REFUND_NOTE && (*out.at(0)).amount == TOTAL - vested);
    assert_liability(@fx, vested);
    start_cheat_block_timestamp_global(END + 100);
    assert!(fx.stream.withdrawable(1) == vested);
    let (r2, s2) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 1);
    let out2 = invoke(@fx, Op::Withdraw, 1, NOTE, 0, r2, s2);
    assert!((*out2.at(0)).amount == vested);
    assert_liability(@fx, 0);
}

#[test]
fn cancel_after_a_partial_withdrawal_settles_to_the_total() {
    let fx = setup();
    let t1 = START + (END - START) / 4;
    start_cheat_block_timestamp_global(t1);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
    let t2 = START + (END - START) / 2;
    start_cheat_block_timestamp_global(t2);
    let (r2, s2) = sign(@fx, @fx.sender, 1, Op::Cancel, REFUND_NOTE, 0, 1);
    invoke(@fx, Op::Cancel, 1, REFUND_NOTE, 0, r2, s2);
    start_cheat_block_timestamp_global(END);
    let (r3, s3) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 2);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r3, s3);
    let st = fx.stream.get_stream(1);
    assert!(st.withdrawn + st.refunded == TOTAL, "stream did not settle to its total");
    assert_liability(@fx, 0);
}

#[test]
fn transfer_rekeys_recipient_and_old_key_is_dead() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Transfer, 0, buyer.public_key, 0);
    invoke(@fx, Op::Transfer, 1, 0, buyer.public_key, r, s);
    start_cheat_block_timestamp_global(END);
    let (r2, s2) = sign(@fx, @buyer, 1, Op::Withdraw, NOTE, 0, 1);
    let out = invoke(@fx, Op::Withdraw, 1, NOTE, 0, r2, s2);
    assert!((*out.at(0)).amount == TOTAL);
}

#[test]
#[should_panic(expected: 'CALLER_NOT_POOL')]
fn only_pool_can_invoke() {
    let fx = setup();
    stop_cheat_caller_address(fx.stream.contract_address);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
}

#[test]
#[should_panic(expected: 'NO_STREAM')]
fn withdraw_on_an_unknown_stream_reverts() {
    let fx = setup();
    let (r, s) = sign(@fx, @fx.recipient, 9, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 9, NOTE, 0, r, s);
}

#[test]
#[should_panic(expected: 'NO_STREAM')]
fn cancel_on_an_unknown_stream_reverts() {
    let fx = setup();
    let (r, s) = sign(@fx, @fx.sender, 9, Op::Cancel, REFUND_NOTE, 0, 0);
    invoke(@fx, Op::Cancel, 9, REFUND_NOTE, 0, r, s);
}

#[test]
#[should_panic(expected: 'NO_STREAM')]
fn transfer_on_an_unknown_stream_reverts() {
    let fx = setup();
    let (r, s) = sign(@fx, @fx.recipient, 9, Op::Transfer, 0, 5, 0);
    invoke(@fx, Op::Transfer, 9, 0, 5, r, s);
}

#[test]
#[should_panic(expected: 'NO_STREAM')]
fn offer_on_an_unknown_stream_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 9, 123, PRICE, EXPIRY);
}

#[test]
fn offer_escrows_the_price_and_accept_pays_the_seller_and_rekeys() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE);
    offer(@fx, 1, buyer.public_key, PRICE, EXPIRY);
    let o = fx.stream.get_offer(1);
    assert!(o.live && o.price == PRICE && o.generation == 1 && o.buyer_pk == buyer.public_key);
    assert_liability(@fx, TOTAL + PRICE);

    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    let out = invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
    assert!((*out.at(0)).amount == PRICE && (*out.at(0)).note_id == NOTE);
    assert!(fx.stream.get_stream(1).recipient_pk == buyer.public_key);
    assert!(!fx.stream.get_offer(1).live);
    assert_liability(@fx, TOTAL);

    start_cheat_block_timestamp_global(END);
    let (r2, s2) = sign(@fx, @buyer, 1, Op::Withdraw, NOTE, 0, 1);
    let out2 = invoke(@fx, Op::Withdraw, 1, NOTE, 0, r2, s2);
    assert!((*out2.at(0)).amount == TOTAL);
    assert_liability(@fx, 0);
}

#[test]
fn reclaim_returns_the_price_to_the_buyer() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE);
    offer(@fx, 1, buyer.public_key, PRICE, EXPIRY);
    let (r, s) = sign(@fx, @buyer, 1, Op::Reclaim, REFUND_NOTE, 1, 0);
    let out = invoke(@fx, Op::Reclaim, 1, REFUND_NOTE, 1, r, s);
    assert!((*out.at(0)).amount == PRICE && (*out.at(0)).note_id == REFUND_NOTE);
    assert!(!fx.stream.get_offer(1).live);
    assert_liability(@fx, TOTAL);
}

#[test]
#[should_panic(expected: 'INVALID_SIG')]
fn reclaim_by_a_key_that_is_not_the_buyer_reverts() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE);
    offer(@fx, 1, buyer.public_key, PRICE, EXPIRY);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Reclaim, REFUND_NOTE, 1, 0);
    invoke(@fx, Op::Reclaim, 1, REFUND_NOTE, 1, r, s);
}

#[test]
#[should_panic(expected: 'OFFER_LIVE')]
fn a_second_offer_while_one_is_live_reverts() {
    let fx = setup();
    fund(@fx, PRICE * 2);
    offer(@fx, 1, 111, PRICE, EXPIRY);
    offer(@fx, 1, 222, PRICE, EXPIRY);
}

#[test]
fn a_second_offer_is_allowed_once_the_first_expires() {
    let fx = setup();
    fund(@fx, PRICE * 2);
    offer(@fx, 1, 111, PRICE, EXPIRY);
    start_cheat_block_timestamp_global(EXPIRY + 1);
    offer(@fx, 1, 222, PRICE, END + 1_000);
    let o = fx.stream.get_offer(1);
    assert!(o.generation == 2 && o.buyer_pk == 222 && o.live);
    assert_liability(@fx, TOTAL + PRICE * 2);
}

#[test]
fn an_expired_offer_stays_reclaimable_after_a_newer_offer_replaces_it() {
    let fx = setup();
    let buyer1 = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE * 2);
    offer(@fx, 1, buyer1.public_key, PRICE, EXPIRY);
    start_cheat_block_timestamp_global(EXPIRY + 1);
    offer(@fx, 1, 222, PRICE, END + 1_000);
    let (r, s) = sign(@fx, @buyer1, 1, Op::Reclaim, REFUND_NOTE, 1, 0);
    let out = invoke(@fx, Op::Reclaim, 1, REFUND_NOTE, 1, r, s);
    assert!((*out.at(0)).amount == PRICE);
    assert_liability(@fx, TOTAL + PRICE);
}

#[test]
#[should_panic(expected: 'STALE_GENERATION')]
fn accept_with_a_stale_generation_reverts() {
    let fx = setup();
    fund(@fx, PRICE * 2);
    offer(@fx, 1, 111, PRICE, EXPIRY);
    start_cheat_block_timestamp_global(EXPIRY + 1);
    offer(@fx, 1, 222, PRICE, END + 1_000);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
}

#[test]
#[should_panic(expected: 'OFFER_EXPIRED')]
fn accept_after_the_offer_expires_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, EXPIRY);
    start_cheat_block_timestamp_global(EXPIRY + 1);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
}

#[test]
#[should_panic(expected: 'POSITION_MOVED')]
fn accept_after_the_seller_withdrew_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, END + 1_000);
    start_cheat_block_timestamp_global(midpoint());
    let (rw, sw) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, rw, sw);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
}

#[test]
#[should_panic(expected: 'OFFER_LIVE')]
fn transfer_while_an_offer_is_live_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, EXPIRY);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Transfer, 0, 555, 0);
    invoke(@fx, Op::Transfer, 1, 0, 555, r, s);
}

#[test]
#[should_panic(expected: 'STREAM_CANCELED')]
fn an_offer_on_a_canceled_stream_reverts() {
    let fx = setup();
    start_cheat_block_timestamp_global(midpoint());
    let (r, s) = sign(@fx, @fx.sender, 1, Op::Cancel, REFUND_NOTE, 0, 0);
    invoke(@fx, Op::Cancel, 1, REFUND_NOTE, 0, r, s);
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, END + 1_000);
}

#[test]
#[should_panic(expected: 'STREAM_DEPLETED')]
fn an_offer_on_a_depleted_stream_reverts() {
    let fx = setup();
    start_cheat_block_timestamp_global(END);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Withdraw, NOTE, 0, 0);
    invoke(@fx, Op::Withdraw, 1, NOTE, 0, r, s);
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, END + 1_000);
}

#[test]
fn cancel_leaves_a_live_offer_reclaimable() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE);
    offer(@fx, 1, buyer.public_key, PRICE, END + 1_000);
    start_cheat_block_timestamp_global(midpoint());
    let (rc, sc) = sign(@fx, @fx.sender, 1, Op::Cancel, REFUND_NOTE, 0, 0);
    invoke(@fx, Op::Cancel, 1, REFUND_NOTE, 0, rc, sc);
    let (rr, sr) = sign(@fx, @buyer, 1, Op::Reclaim, 901, 1, 0);
    let out = invoke(@fx, Op::Reclaim, 1, 901, 1, rr, sr);
    assert!((*out.at(0)).amount == PRICE);
    assert_liability(@fx, vested_at(midpoint()));
}

#[test]
#[should_panic(expected: 'STREAM_CANCELED')]
fn accept_on_a_canceled_stream_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, END + 1_000);
    start_cheat_block_timestamp_global(midpoint());
    let (rc, sc) = sign(@fx, @fx.sender, 1, Op::Cancel, REFUND_NOTE, 0, 0);
    invoke(@fx, Op::Cancel, 1, REFUND_NOTE, 0, rc, sc);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
}

#[test]
fn a_signature_made_in_typescript_verifies_in_cairo() {
    let chain_id: felt252 = 0x534e5f4d41494e;
    let contract: felt252 = 0x04d1e2b3c4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d;
    let public_key: felt252 = 0x20c29f1c98f3320d56f01c13372c923123c35828bce54f2153aa1cfe61c44f2;
    let expected: felt252 = 0x1cdc8e5efc46c0ea1cca695a1954a4c9a5a23907ceb795e9c720a3786e38b4c;
    let r: felt252 = 0x612127a51a8278629477b94a95706b394c6d02473774e0210dfbcaf1bb6c8d4;
    let s: felt252 = 0x4db310573089d30d2f159ab1a163bbec2f593c98ce58108fa92e777fdc069dc;

    let h = signing_hash(chain_id, contract, 7, Op::Withdraw, 0x55, 0, 3);
    assert!(h == expected, "cairo and typescript disagree on the message hash");
    assert!(core::ecdsa::check_ecdsa_signature(h, public_key, r, s));
}

#[test]
#[should_panic(expected: 'BAD_EXPIRY')]
fn an_offer_whose_expiry_exceeds_the_cap_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, START + nagare::MAX_OFFER_DURATION + 1);
}

#[test]
#[should_panic(expected: 'OFFER_CLEARED')]
fn reclaim_twice_reverts() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE);
    offer(@fx, 1, buyer.public_key, PRICE, EXPIRY);
    let (r, s) = sign(@fx, @buyer, 1, Op::Reclaim, REFUND_NOTE, 1, 0);
    invoke(@fx, Op::Reclaim, 1, REFUND_NOTE, 1, r, s);
    invoke(@fx, Op::Reclaim, 1, REFUND_NOTE, 1, r, s);
}

#[test]
#[should_panic(expected: 'OFFER_CLEARED')]
fn reclaim_after_accept_reverts() {
    let fx = setup();
    let buyer = KeyPairTrait::<felt252, felt252>::generate();
    fund(@fx, PRICE);
    offer(@fx, 1, buyer.public_key, PRICE, EXPIRY);
    let (ra, sa) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    invoke(@fx, Op::Accept, 1, NOTE, 1, ra, sa);
    let (r, s) = sign(@fx, @buyer, 1, Op::Reclaim, REFUND_NOTE, 1, 0);
    invoke(@fx, Op::Reclaim, 1, REFUND_NOTE, 1, r, s);
}

#[test]
#[should_panic(expected: 'OFFER_CLEARED')]
fn accept_twice_reverts() {
    let fx = setup();
    fund(@fx, PRICE);
    offer(@fx, 1, 111, PRICE, EXPIRY);
    let (r, s) = sign(@fx, @fx.recipient, 1, Op::Accept, NOTE, 1, 0);
    invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
    invoke(@fx, Op::Accept, 1, NOTE, 1, r, s);
}
