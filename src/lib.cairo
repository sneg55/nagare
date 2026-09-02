#[cfg(test)]
mod mocks;
use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Stream {
    pub token: ContractAddress,
    pub total: u128,
    pub withdrawn: u128,
    pub refunded: u128,
    pub start: u64,
    pub cliff: u64,
    pub end: u64,
    pub sender_pk: felt252,
    pub recipient_pk: felt252,
    pub canceled: bool,
    pub nonce: felt252,
    pub sellable: bool,
    pub exists: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug, starknet::Store)]
pub struct Offer {
    pub buyer_pk: felt252,
    pub price: u128,
    pub expiry: u64,
    pub generation: u64,
    pub withdrawn_at_offer: u128,
    pub live: bool,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum Op {
    Create,
    Withdraw,
    Cancel,
    Transfer,
    Offer,
    Accept,
    Reclaim,
    List,
}

pub const SIG_DOMAIN: felt252 = 'NAGARE_SIG:V1';

pub const MAX_OFFER_DURATION: u64 = 86_400;

pub fn op_code(op: Op) -> felt252 {
    match op {
        Op::Create => 0,
        Op::Withdraw => 1,
        Op::Cancel => 2,
        Op::Transfer => 3,
        Op::Offer => 4,
        Op::Accept => 5,
        Op::Reclaim => 6,
        Op::List => 7,
    }
}

pub fn signing_hash(
    chain_id: felt252,
    contract: felt252,
    stream_id: u64,
    op: Op,
    note_id: felt252,
    arg: felt252,
    nonce: felt252,
) -> felt252 {
    core::poseidon::poseidon_hash_span(
        [SIG_DOMAIN, chain_id, contract, stream_id.into(), op_code(op), note_id, arg, nonce].span(),
    )
}

pub fn streamed_amount(s: @Stream, now: u64) -> u128 {
    if now < *s.cliff {
        return 0;
    }
    if now >= *s.end {
        return *s.total;
    }
    let total: u256 = (*s.total).into();
    let elapsed: u256 = (now - *s.start).into();
    let duration: u256 = (*s.end - *s.start).into();
    (total * elapsed / duration).try_into().expect(errors::ACCRUAL_OVERFLOW)
}

#[starknet::interface]
pub trait INagare<T> {
    fn privacy_invoke(
        ref self: T,
        op: Op,
        stream_id: u64,
        token: ContractAddress,
        total: u128,
        start: u64,
        cliff: u64,
        end: u64,
        sender_pk: felt252,
        recipient_pk: felt252,
        arg: felt252,
        note_id: felt252,
        sig_r: felt252,
        sig_s: felt252,
    ) -> Span<OpenNoteDeposit>;
    fn get_stream(self: @T, stream_id: u64) -> Stream;
    fn get_offer(self: @T, stream_id: u64) -> Offer;
    fn withdrawable(self: @T, stream_id: u64) -> u128;
    fn stream_count(self: @T) -> u64;
    fn liability(self: @T, token: ContractAddress) -> u128;
    fn allowed_token(self: @T) -> ContractAddress;
    fn chain_id(self: @T) -> felt252;
}

pub mod errors {
    pub const CALLER_NOT_POOL: felt252 = 'CALLER_NOT_POOL';
    pub const BAD_TOKEN: felt252 = 'BAD_TOKEN';
    pub const BAD_SCHEDULE: felt252 = 'BAD_SCHEDULE';
    pub const ZERO_TOTAL: felt252 = 'ZERO_TOTAL';
    pub const UNFUNDED: felt252 = 'UNFUNDED';
    pub const NO_STREAM: felt252 = 'NO_STREAM';
    pub const INVALID_SIG: felt252 = 'INVALID_SIG';
    pub const NOTHING_VESTED: felt252 = 'NOTHING_VESTED';
    pub const ALREADY_CANCELED: felt252 = 'ALREADY_CANCELED';
    pub const NOTHING_TO_REFUND: felt252 = 'NOTHING_TO_REFUND';
    pub const ZERO_KEY: felt252 = 'ZERO_KEY';
    pub const ZERO_PRICE: felt252 = 'ZERO_PRICE';
    pub const BAD_EXPIRY: felt252 = 'BAD_EXPIRY';
    pub const OFFER_LIVE: felt252 = 'OFFER_LIVE';
    pub const OFFER_CLEARED: felt252 = 'OFFER_CLEARED';
    pub const OFFER_EXPIRED: felt252 = 'OFFER_EXPIRED';
    pub const STALE_GENERATION: felt252 = 'STALE_GENERATION';
    pub const STREAM_CANCELED: felt252 = 'STREAM_CANCELED';
    pub const STREAM_DEPLETED: felt252 = 'STREAM_DEPLETED';
    pub const POSITION_MOVED: felt252 = 'POSITION_MOVED';
    pub const NOT_FOR_SALE: felt252 = 'NOT_FOR_SALE';
    pub const ACCRUAL_OVERFLOW: felt252 = 'ACCRUAL_OVERFLOW';
}

#[starknet::contract]
pub mod Nagare {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use privacy::objects::OpenNoteDeposit;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address, get_tx_info,
    };
    use super::{
        INagare, MAX_OFFER_DURATION, Offer, Op, Stream, errors, signing_hash, streamed_amount,
    };


    #[storage]
    struct Storage {
        pool: ContractAddress,
        allowed_token: ContractAddress,
        chain_id: felt252,
        next_id: u64,
        streams: Map<u64, Stream>,
        offers: Map<(u64, u64), Offer>,
        generations: Map<u64, u64>,
        liability: Map<ContractAddress, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Created: Created,
        Withdrawn: Withdrawn,
        Canceled: Canceled,
        Transferred: Transferred,
        Listed: Listed,
        Offered: Offered,
        Accepted: Accepted,
        Reclaimed: Reclaimed,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Created {
        #[key]
        pub stream_id: u64,
        pub token: ContractAddress,
        pub total: u128,
        pub start: u64,
        pub cliff: u64,
        pub end: u64,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Withdrawn {
        #[key]
        pub stream_id: u64,
        pub amount: u128,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Canceled {
        #[key]
        pub stream_id: u64,
        pub refunded: u128,
        pub vested: u128,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transferred {
        #[key]
        pub stream_id: u64,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Listed {
        #[key]
        pub stream_id: u64,
        pub sellable: bool,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Offered {
        #[key]
        pub stream_id: u64,
        pub generation: u64,
        pub price: u128,
        pub expiry: u64,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Accepted {
        #[key]
        pub stream_id: u64,
        pub generation: u64,
        pub price: u128,
        pub at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Reclaimed {
        #[key]
        pub stream_id: u64,
        pub generation: u64,
        pub price: u128,
        pub at: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, pool: ContractAddress, allowed_token: ContractAddress) {
        assert(pool.is_non_zero(), errors::CALLER_NOT_POOL);
        assert(allowed_token.is_non_zero(), errors::BAD_TOKEN);
        self.pool.write(pool);
        self.allowed_token.write(allowed_token);
        self.chain_id.write(get_tx_info().unbox().chain_id);
        self.next_id.write(1);
    }

    #[abi(embed_v0)]
    impl NagareImpl of INagare<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            op: Op,
            stream_id: u64,
            token: ContractAddress,
            total: u128,
            start: u64,
            cliff: u64,
            end: u64,
            sender_pk: felt252,
            recipient_pk: felt252,
            arg: felt252,
            note_id: felt252,
            sig_r: felt252,
            sig_s: felt252,
        ) -> Span<OpenNoteDeposit> {
            let pool = self.pool.read();
            assert(get_caller_address() == pool, errors::CALLER_NOT_POOL);
            match op {
                Op::Create => {
                    self.create(token, total, start, cliff, end, sender_pk, recipient_pk);
                    [].span()
                },
                Op::Withdraw => self.settle(pool, self.withdraw(stream_id, note_id, sig_r, sig_s)),
                Op::Cancel => self.settle(pool, self.cancel(stream_id, note_id, sig_r, sig_s)),
                Op::Transfer => {
                    self.reassign(stream_id, arg, sig_r, sig_s);
                    [].span()
                },
                Op::Offer => {
                    self.open_offer(stream_id, arg, total, end);
                    [].span()
                },
                Op::Accept => self.settle(pool, self.accept(stream_id, note_id, arg, sig_r, sig_s)),
                Op::Reclaim => self
                    .settle(pool, self.reclaim(stream_id, note_id, arg, sig_r, sig_s)),
                Op::List => {
                    self.set_sellable(stream_id, arg, sig_r, sig_s);
                    [].span()
                },
            }
        }

        fn get_stream(self: @ContractState, stream_id: u64) -> Stream {
            self.streams.read(stream_id)
        }

        fn get_offer(self: @ContractState, stream_id: u64) -> Offer {
            self.offers.read((stream_id, self.generations.read(stream_id)))
        }

        fn withdrawable(self: @ContractState, stream_id: u64) -> u128 {
            let s = self.streams.read(stream_id);
            assert(s.exists, errors::NO_STREAM);
            self.withdrawable_of(@s, get_block_timestamp())
        }

        fn stream_count(self: @ContractState) -> u64 {
            self.next_id.read() - 1
        }

        fn liability(self: @ContractState, token: ContractAddress) -> u128 {
            self.liability.read(token)
        }

        fn allowed_token(self: @ContractState) -> ContractAddress {
            self.allowed_token.read()
        }

        fn chain_id(self: @ContractState) -> felt252 {
            self.chain_id.read()
        }
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        fn settle(
            ref self: ContractState, pool: ContractAddress, d: OpenNoteDeposit,
        ) -> Span<OpenNoteDeposit> {
            IERC20Dispatcher { contract_address: d.token }.approve(pool, d.amount.into());
            [d].span()
        }

        fn load(self: @ContractState, stream_id: u64) -> Stream {
            let s = self.streams.read(stream_id);
            assert(s.exists, errors::NO_STREAM);
            s
        }

        fn withdrawable_of(self: @ContractState, s: @Stream, now: u64) -> u128 {
            let vested = if *s.canceled {
                *s.total - *s.refunded
            } else {
                streamed_amount(s, now)
            };
            vested - *s.withdrawn
        }

        fn reserve(ref self: ContractState, token: ContractAddress, amount: u128) {
            let owed = self.liability.read(token) + amount;
            let held: u256 = IERC20Dispatcher { contract_address: token }
                .balance_of(get_contract_address());
            assert(held >= owed.into(), errors::UNFUNDED);
            self.liability.write(token, owed);
        }

        fn release(ref self: ContractState, token: ContractAddress, amount: u128) {
            self.liability.write(token, self.liability.read(token) - amount);
        }

        fn require_sig(
            self: @ContractState,
            stream_id: u64,
            op: Op,
            note_id: felt252,
            arg: felt252,
            nonce: felt252,
            pk: felt252,
            r: felt252,
            s: felt252,
        ) {
            let h = signing_hash(
                self.chain_id.read(),
                get_contract_address().into(),
                stream_id,
                op,
                note_id,
                arg,
                nonce,
            );
            assert(check_ecdsa_signature(h, pk, r, s), errors::INVALID_SIG);
        }

        fn live_offer(self: @ContractState, stream_id: u64, now: u64) -> bool {
            let o = self.offers.read((stream_id, self.generations.read(stream_id)));
            o.live && now < o.expiry
        }

        fn create(
            ref self: ContractState,
            token: ContractAddress,
            total: u128,
            start: u64,
            cliff: u64,
            end: u64,
            sender_pk: felt252,
            recipient_pk: felt252,
        ) {
            assert(token == self.allowed_token.read(), errors::BAD_TOKEN);
            assert(total.is_non_zero(), errors::ZERO_TOTAL);
            assert(start <= cliff && cliff < end, errors::BAD_SCHEDULE);
            assert(sender_pk.is_non_zero() && recipient_pk.is_non_zero(), errors::ZERO_KEY);
            self.reserve(token, total);
            let id = self.next_id.read();
            self.next_id.write(id + 1);
            self
                .streams
                .write(
                    id,
                    Stream {
                        token,
                        total,
                        withdrawn: 0,
                        refunded: 0,
                        start,
                        cliff,
                        end,
                        sender_pk,
                        recipient_pk,
                        canceled: false,
                        nonce: 0,
                        sellable: false,
                        exists: true,
                    },
                );
            self
                .emit(
                    Created {
                        stream_id: id, token, total, start, cliff, end, at: get_block_timestamp(),
                    },
                );
        }

        fn withdraw(
            ref self: ContractState, stream_id: u64, note_id: felt252, r: felt252, s: felt252,
        ) -> OpenNoteDeposit {
            let mut st = self.load(stream_id);
            self.require_sig(stream_id, Op::Withdraw, note_id, 0, st.nonce, st.recipient_pk, r, s);
            let now = get_block_timestamp();
            let amount = self.withdrawable_of(@st, now);
            assert(amount.is_non_zero(), errors::NOTHING_VESTED);
            st.withdrawn += amount;
            st.nonce += 1;
            self.streams.write(stream_id, st);
            self.release(st.token, amount);
            self.emit(Withdrawn { stream_id, amount, at: now });
            OpenNoteDeposit { note_id, token: st.token, amount }
        }

        fn cancel(
            ref self: ContractState, stream_id: u64, note_id: felt252, r: felt252, s: felt252,
        ) -> OpenNoteDeposit {
            let mut st = self.load(stream_id);
            assert(!st.canceled, errors::ALREADY_CANCELED);
            self.require_sig(stream_id, Op::Cancel, note_id, 0, st.nonce, st.sender_pk, r, s);
            let now = get_block_timestamp();
            let vested = streamed_amount(@st, now);
            let refund = st.total - vested;
            assert(refund.is_non_zero(), errors::NOTHING_TO_REFUND);
            st.refunded = refund;
            st.canceled = true;
            st.nonce += 1;
            self.streams.write(stream_id, st);
            self.release(st.token, refund);
            self.emit(Canceled { stream_id, refunded: refund, vested, at: now });
            OpenNoteDeposit { note_id, token: st.token, amount: refund }
        }

        fn reassign(
            ref self: ContractState, stream_id: u64, new_pk: felt252, r: felt252, s: felt252,
        ) {
            let mut st = self.load(stream_id);
            assert(new_pk.is_non_zero(), errors::ZERO_KEY);
            let now = get_block_timestamp();
            assert(!self.live_offer(stream_id, now), errors::OFFER_LIVE);
            self.require_sig(stream_id, Op::Transfer, 0, new_pk, st.nonce, st.recipient_pk, r, s);
            st.recipient_pk = new_pk;
            st.nonce += 1;
            self.streams.write(stream_id, st);
            self.emit(Transferred { stream_id, at: now });
        }

        fn open_offer(
            ref self: ContractState, stream_id: u64, buyer_pk: felt252, price: u128, expiry: u64,
        ) {
            let st = self.load(stream_id);
            assert(!st.canceled, errors::STREAM_CANCELED);
            assert(st.withdrawn < st.total, errors::STREAM_DEPLETED);
            assert(st.sellable, errors::NOT_FOR_SALE);
            assert(price.is_non_zero(), errors::ZERO_PRICE);
            assert(buyer_pk.is_non_zero(), errors::ZERO_KEY);
            let now = get_block_timestamp();
            assert(expiry > now && expiry <= now + MAX_OFFER_DURATION, errors::BAD_EXPIRY);
            assert(!self.live_offer(stream_id, now), errors::OFFER_LIVE);
            self.reserve(st.token, price);
            let generation = self.generations.read(stream_id) + 1;
            self.generations.write(stream_id, generation);
            self
                .offers
                .write(
                    (stream_id, generation),
                    Offer {
                        buyer_pk,
                        price,
                        expiry,
                        generation,
                        withdrawn_at_offer: st.withdrawn,
                        live: true,
                    },
                );
            self.emit(Offered { stream_id, generation, price, expiry, at: now });
        }

        fn accept(
            ref self: ContractState,
            stream_id: u64,
            note_id: felt252,
            arg: felt252,
            r: felt252,
            s: felt252,
        ) -> OpenNoteDeposit {
            let mut st = self.load(stream_id);
            assert(!st.canceled, errors::STREAM_CANCELED);
            assert(st.sellable, errors::NOT_FOR_SALE);
            let generation = self.generations.read(stream_id);
            assert(arg == generation.into(), errors::STALE_GENERATION);
            let mut o = self.offers.read((stream_id, generation));
            assert(o.live, errors::OFFER_CLEARED);
            let now = get_block_timestamp();
            assert(now < o.expiry, errors::OFFER_EXPIRED);
            assert(st.withdrawn == o.withdrawn_at_offer, errors::POSITION_MOVED);
            self.require_sig(stream_id, Op::Accept, note_id, arg, 0, st.recipient_pk, r, s);
            o.live = false;
            self.offers.write((stream_id, generation), o);
            st.recipient_pk = o.buyer_pk;
            st.nonce += 1;
            self.streams.write(stream_id, st);
            self.release(st.token, o.price);
            self.emit(Accepted { stream_id, generation, price: o.price, at: now });
            OpenNoteDeposit { note_id, token: st.token, amount: o.price }
        }

        fn set_sellable(
            ref self: ContractState, stream_id: u64, arg: felt252, r: felt252, s: felt252,
        ) {
            let mut st = self.load(stream_id);
            self.require_sig(stream_id, Op::List, 0, arg, st.nonce, st.recipient_pk, r, s);
            st.sellable = arg.is_non_zero();
            st.nonce += 1;
            self.streams.write(stream_id, st);
            self.emit(Listed { stream_id, sellable: st.sellable, at: get_block_timestamp() });
        }

        fn reclaim(
            ref self: ContractState,
            stream_id: u64,
            note_id: felt252,
            arg: felt252,
            r: felt252,
            s: felt252,
        ) -> OpenNoteDeposit {
            let st = self.load(stream_id);
            let generation: u64 = arg.try_into().expect(errors::STALE_GENERATION);
            let mut o = self.offers.read((stream_id, generation));
            assert(o.live, errors::OFFER_CLEARED);
            self.require_sig(stream_id, Op::Reclaim, note_id, arg, 0, o.buyer_pk, r, s);
            o.live = false;
            self.offers.write((stream_id, generation), o);
            self.release(st.token, o.price);
            let now = get_block_timestamp();
            self.emit(Reclaimed { stream_id, generation, price: o.price, at: now });
            OpenNoteDeposit { note_id, token: st.token, amount: o.price }
        }
    }
}
