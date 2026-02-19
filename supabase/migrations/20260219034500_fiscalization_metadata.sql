-- Normalize and validate fiscalization metadata for Stage 1 (Uzum autofiscalization).

-- Backfill plans.metadata.fiscalization.spic from legacy top-level metadata.spic.
update payments.plans
set metadata = jsonb_set(
  coalesce(metadata::jsonb, '{}'::jsonb),
  '{fiscalization,spic}',
  to_jsonb((metadata::jsonb ->> 'spic')),
  true
)
where (metadata::jsonb ? 'spic')
  and not (
    (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'spic'
  );

-- Backfill plans.metadata.fiscalization.packageCode from legacy keys.
update payments.plans
set metadata = jsonb_set(
  coalesce(metadata::jsonb, '{}'::jsonb),
  '{fiscalization,packageCode}',
  to_jsonb(
    coalesce(
      metadata::jsonb ->> 'packageCode',
      metadata::jsonb ->> 'package_code'
    )
  ),
  true
)
where (
    (metadata::jsonb ? 'packageCode')
    or (metadata::jsonb ? 'package_code')
  )
  and not (
    (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'packageCode'
  );

-- Backfill org-provider fiscal tax identity from legacy metadata keys.
update payments.org_provider_accounts
set metadata = jsonb_set(
  coalesce(metadata::jsonb, '{}'::jsonb),
  '{fiscalization,taxIdentity}',
  jsonb_build_object('type', 'TIN', 'value', metadata::jsonb ->> 'TIN'),
  true
)
where provider_id = 'uzum'
  and (metadata::jsonb ? 'TIN')
  and not (
    (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'taxIdentity'
  );

update payments.org_provider_accounts
set metadata = jsonb_set(
  coalesce(metadata::jsonb, '{}'::jsonb),
  '{fiscalization,taxIdentity}',
  jsonb_build_object('type', 'TIN', 'value', metadata::jsonb ->> 'tin'),
  true
)
where provider_id = 'uzum'
  and (metadata::jsonb ? 'tin')
  and not (
    (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'taxIdentity'
  );

update payments.org_provider_accounts
set metadata = jsonb_set(
  coalesce(metadata::jsonb, '{}'::jsonb),
  '{fiscalization,taxIdentity}',
  jsonb_build_object('type', 'PINFL', 'value', metadata::jsonb ->> 'PINFL'),
  true
)
where provider_id = 'uzum'
  and (metadata::jsonb ? 'PINFL')
  and not (
    (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'taxIdentity'
  );

update payments.org_provider_accounts
set metadata = jsonb_set(
  coalesce(metadata::jsonb, '{}'::jsonb),
  '{fiscalization,taxIdentity}',
  jsonb_build_object('type', 'PINFL', 'value', metadata::jsonb ->> 'pinfl'),
  true
)
where provider_id = 'uzum'
  and (metadata::jsonb ? 'pinfl')
  and not (
    (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'taxIdentity'
  );

-- Validate plans fiscalization shape.
do $$
begin
  alter table payments.plans
    add constraint plans_fiscalization_metadata_check
    check (
      jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb)) = 'object'
      and (
        not (coalesce(metadata::jsonb, '{}'::jsonb) ? 'fiscalization')
        or (
          jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') = 'object'
          and (
            not ((coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'spic')
            or jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' -> 'spic') = 'string'
          )
          and (
            not ((coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'packageCode')
            or jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' -> 'packageCode') = 'string'
          )
        )
      )
    );
exception when duplicate_object then null;
end $$;

-- Validate org provider fiscalization shape.
do $$
begin
  alter table payments.org_provider_accounts
    add constraint org_provider_accounts_fiscalization_metadata_check
    check (
      jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb)) = 'object'
      and (
        provider_id <> 'uzum'
        or (
          not (coalesce(metadata::jsonb, '{}'::jsonb) ? 'fiscalization')
          or (
            jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') = 'object'
            and (
              not ((coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization') ? 'taxIdentity')
              or (
                jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' -> 'taxIdentity') = 'object'
                and jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' -> 'taxIdentity' -> 'type') = 'string'
                and jsonb_typeof(coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' -> 'taxIdentity' -> 'value') = 'string'
                and (
                  (coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' -> 'taxIdentity' ->> 'type') in ('TIN', 'PINFL')
                )
              )
            )
          )
        )
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists plans_fiscal_spic_idx
  on payments.plans ((coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' ->> 'spic'));

create index if not exists plans_fiscal_package_code_idx
  on payments.plans ((coalesce(metadata::jsonb, '{}'::jsonb) -> 'fiscalization' ->> 'packageCode'));
