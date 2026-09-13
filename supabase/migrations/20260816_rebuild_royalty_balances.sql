create or replace function Soundpub.rebuild_royalty_balances()
returns void
language sql
security definer
set search_path = Soundpub, public
as $$
  with allocations as (
    select artist_user_id as profile_id, artist_revenue as artist_amount, 0::numeric as label_amount
    from Soundpub.royalties
    where artist_user_id is not null
    union all
    select label_user_id as profile_id, 0::numeric as artist_amount, label_revenue as label_amount
    from Soundpub.royalties
    where label_user_id is not null
  ), totals as (
    select profile_id, sum(artist_amount) as artist_revenue, sum(label_amount) as label_revenue
    from allocations
    group by profile_id
  )
  update Soundpub.profiles profile
  set
    artist_revenue = coalesce(totals.artist_revenue, 0),
    label_revenue = coalesce(totals.label_revenue, 0),
    balance = coalesce(totals.artist_revenue, 0) + coalesce(totals.label_revenue, 0)
  from totals
  where profile.id = totals.profile_id;

  update Soundpub.profiles profile
  set artist_revenue = 0, label_revenue = 0, balance = 0
  where not exists (
    select 1
    from Soundpub.royalties royalty
    where royalty.artist_user_id = profile.id or royalty.label_user_id = profile.id
  );
$$;

revoke all on function Soundpub.rebuild_royalty_balances() from public;
grant execute on function Soundpub.rebuild_royalty_balances() to service_role;
