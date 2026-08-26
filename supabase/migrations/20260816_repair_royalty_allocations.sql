-- Repair existing royalty rows after profile schema moved role to Soundpub.user_roles
-- and artist label ownership to Soundpub.profiles.parent_label_id.

begin;

with label_profiles as (
  select p.id, lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) as normalized_name
  from Soundpub.profiles p
  join Soundpub.user_roles ur on ur.user_id = p.id and ur.role = 'label'
), Soundpub_label as (
  select id
  from label_profiles
  where normalized_name in ('Soundpub', 'Soundpub music', 'Soundpub music ecosystem')
     or normalized_name like '%Soundpub%'
  order by case when normalized_name = 'Soundpub music' then 0 else 1 end
  limit 1
), artist_profiles as (
  select p.id, p.parent_label_id, lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) as normalized_name
  from Soundpub.profiles p
  join Soundpub.user_roles ur on ur.user_id = p.id and ur.role = 'artist'
), resolved as (
  select r.id,
    coalesce(
      case when lower(regexp_replace(trim(coalesce(r.label_name, '')), '\s+', ' ', 'g')) in ('Soundpub', 'Soundpub music', 'Soundpub music ecosystem') then (select id from Soundpub_label) end,
      rel.label_id,
      (
        select lp.id
        from label_profiles lp
        where lp.normalized_name = lower(regexp_replace(trim(coalesce(r.label_name, '')), '\s+', ' ', 'g'))
        limit 1
      )
    ) as resolved_label_id,
    coalesce(
      track.artist_user_id,
      rel.artist_user_id,
      (
        select ap.id
        from artist_profiles ap
        where ap.parent_label_id = coalesce(
          rel.label_id,
          (
            select lp.id
            from label_profiles lp
            where lp.normalized_name = lower(regexp_replace(trim(coalesce(r.label_name, '')), '\s+', ' ', 'g'))
            limit 1
          ),
          case when lower(regexp_replace(trim(coalesce(r.label_name, '')), '\s+', ' ', 'g')) in ('Soundpub', 'Soundpub music', 'Soundpub music ecosystem') then (select id from Soundpub_label) end
        )
        and ap.normalized_name = lower(regexp_replace(trim(coalesce(nullif(r.artist, ''), nullif(r.artist_name, ''), '')), '\s+', ' ', 'g'))
        limit 1
      )
    ) as resolved_artist_id
  from Soundpub.royalties r
  left join Soundpub.tracks track on upper(replace(track.isrc, '-', '')) = upper(replace(r.isrc, '-', ''))
  left join Soundpub.releases rel on rel.id = track.release_id
)
update Soundpub.royalties royalty
set
  label_user_id = resolved.resolved_label_id,
  artist_user_id = resolved.resolved_artist_id,
  Soundpub_revenue = round((royalty.net_revenue * 0.09)::numeric, 2),
  pendapatan_bersih_Soundpub = round((royalty.net_revenue * 0.09)::numeric, 2),
  artist_revenue = case when resolved.resolved_artist_id is null then 0 else round((royalty.net_revenue * 0.70)::numeric, 2) end,
  label_revenue = royalty.net_revenue - round((royalty.net_revenue * 0.09)::numeric, 2) - case when resolved.resolved_artist_id is null then 0 else round((royalty.net_revenue * 0.70)::numeric, 2) end,
  label_name = case when resolved.resolved_label_id = (select id from Soundpub_label) then 'Soundpub MUSIC' else royalty.label_name end
from resolved
where royalty.id = resolved.id;

select Soundpub.rebuild_royalty_balances();

update Soundpub.royalty_uploads
set status = 'success', inserted_records = total_records
where status = 'processing'
  and exists (select 1 from Soundpub.royalties r where r.upload_id = royalty_uploads.id);

commit;
