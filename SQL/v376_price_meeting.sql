-- STUDIO v376. Keep all existing product data and relationships.
begin;
alter table public.utveckling add column if not exists price_meeting text not null default 'gray' check (price_meeting in ('gray','yellow','green','red'));
alter table public.utveckling add column if not exists price_meeting_slut_datum date;
grant select (price_meeting,price_meeting_slut_datum), update (price_meeting,price_meeting_slut_datum) on public.utveckling to authenticated;
-- Existing row-level permissions continue to apply.
commit;
