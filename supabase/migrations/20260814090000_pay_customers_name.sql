-- Give Krafta Pay's customers a name.
--
-- payments.customers has only email, phone, external_id and metadata, so the
-- Customers page — the screen a merchant opens to answer "did Alisher's mother
-- pay" — can show an email address at best. In production today that is 24 of
-- 35 rows with an email, 0 with a phone, and 0 carrying a name anywhere, not
-- even in metadata. The page is a list of inboxes where it should be a list of
-- people.
--
-- WHY THIS CANNOT BE READ FROM commerce.customers INSTEAD. That table does have
-- given_name and family_name, but it belongs to Krafta, and Krafta Pay is a
-- standalone product that Krafta merely happens to be the first client of. A
-- merchant using Krafta Pay directly has no commerce row at all, so for them
-- the name lives here or nowhere. Reaching across the schema boundary would
-- also make Krafta Pay unsellable on its own, which is the whole point of it.
--
-- ONE FREE-TEXT COLUMN, NOT given_name/family_name. Uzbek names are commonly
-- written as a single string, order varies, and merchants type what they are
-- going to recognise later — "мама Алишера" is a perfectly good customer name
-- for a language school and does not decompose into two fields. Stripe made the
-- same call.
--
-- Nullable on purpose: every existing row has no name, and there is nothing to
-- backfill from. New customers carry one going forward.

alter table payments.customers
  add column if not exists name text;

comment on column payments.customers.name is
  'Display name for the payer, as the merchant would recognise them. Free text: names here are not reliably two-part. NULL for rows created before this column, and for API callers that do not send one — the UI falls back to email, then phone.';

-- The Customers page searches name alongside email and phone, and that search
-- is the feature: a merchant's question is almost always about one person.
create index if not exists customers_org_name_idx
  on payments.customers (org_id, name);
