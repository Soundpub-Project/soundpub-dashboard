# Phase3E financial ledger contract

Agent C owns migration `0014_finance_ledger.sql`; royalty 0015, payout 0016, payment 0017.

Backend imports: `lockAccount`, `getBalance`, `postEvent`, `reconcileAccount`, `parseMoney`, `formatMoney`, `roundRatio` from `backend/src/finance/index.ts`.

All database functions take existing `PoolClient`. Caller MUST own a transaction and current locked authority. No internal pool/transaction, routes or server. Acquire authority locks first, then account locks in ascending owner UUID order, then business rows; use READ COMMITTED (default). Recheck trusted provider evidence in owning domain. Never bind raw posting to browser input.

`lockAccount(db, ownerId, currency='IDR')` creates/locks persistent `(owner_id,currency)` account; account contains no balance. `getBalance(db, ownerId, currency?)` returns `{currency,available,reserved,settled,charged,refunded}` as exact decimal strings. Read-only balance is one statement snapshot. Eligibility must lock first and separately establish verification, configured threshold, destination and reconciled provenance; ledger does not invent these rules.

`postEvent(db, {ownerId,currency?,kind,amount,businessReference,idempotencyKey,actorId? OR systemActor?,evidence?})` returns `{event,replayed}`. Amount is signed decimal string; positive except adjustment kinds. Event DB row includes `id,owner_id,currency,kind,amount_minor,business_reference,idempotency_key,actor_id,system_actor,evidence,created_at`. Currency IDR only. Evidence required for settlement/charge/refund, supplied only by trusted backend domain. Exactly one actor representation required.

Example royalty posting inside caller transaction: `await postEvent(db,{ownerId:beneficiaryId,kind:'ROYALTY_EARNING',amount:'700.00',businessReference:'royalty:'+entryId,idempotencyKey:'royalty:'+entryId,actorId:adminId})`. Only reconciled, explicitly mapped royalty entries may post. An unreconciled import stays unavailable. Corrections post negative `ROYALTY_ADJUSTMENT`; never delete original credit. Overspent correction fails for manual review; no negative available account.

Payout posts `PAYOUT_RESERVATION` using payout ID as business reference; release/settlement use exactly same owner, currency, amount and reference, distinct deterministic idempotency keys. Exactly one terminal event allowed. Settlement consumes reservation, never debits available twice. Owning payout row plus reservation plus audit/outbox must commit together. This primitive supports one beneficiary per payout; multi-beneficiary label allocation requires reviewed allocation contract and sorted account locks, not assumed legacy aggregation.

Payment charge/refund use invoice ID as business reference, unique trusted evidence. They track release-payment value separately and never credit withdrawable royalty balance. One full refund per charge; partial refund allocation unsupported until contract approved.

`finance_events` append-only. `finance_audit(event_id,old_state,new_state,outbox_id,created_at)` append-only; states contain exact minor-unit strings. DB trigger inserts canonical audit, general audit and `outbox_events(topic='finance.event',payload={eventId},idempotency_key='finance:'+eventId)` atomically. Existing generic worker must not execute a production provider effect; no provider connected here. Audit details obtained from ledger, never secrets.

Same account + idempotency key requires exact operation replay (normalized amount, kind, business reference, actor, evidence). Different key for same kind/business reference conflicts. Unique `(kind,evidence)` prevents provider settlement evidence reuse. Idempotency survives indefinitely with immutable events; generic expiring idempotency table is not finance authority.

RLS enabled; only backend runtime role gets SELECT/INSERT, plus account-column UPDATE privilege solely to permit row locking. Immutable triggers reject UPDATE/DELETE/TRUNCATE. No PUBLIC access. DB owner remains trusted migration authority; RLS is not browser authorization for runtime role.

Inputs reviewed: Phase3D final, Phase3C closeout, Phase3 final, Phase1F final, Phase1G extraction/function maps, legacy financial hardening migrations and frontend IDR invoice display. No legacy cached balance or migration opening adjustment imported. Unresolved provenance stays blocked.
