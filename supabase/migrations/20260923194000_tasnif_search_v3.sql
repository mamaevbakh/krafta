-- tasnif: search v3 — read less of the disk per search, understand sizes and
-- grades, and let an exact product match beat its category.
--
-- WHY THIS EXISTS
-- ---------------
-- 1. A first search took seconds. kraftabase has well under 1 GB of memory for
--    everything it serves, and tasnif's search documents alone are ~650 MB with
--    their indexes, so a query nobody has asked recently reads its pages from
--    disk at ~2 ms a page. Measured: the words leg for «цемент М400» read 545
--    pages cold and took 1.16 s; the same query warm took 35 ms. Speed is
--    therefore about how many distinct pages a search touches, and v2 touched
--    far too many:
--      * every document containing ANY query word was read to count how many
--        words it covered: «osh» as a prefix matched 5,954 documents (3-4 s);
--      * every candidate code was joined to tasnif.codes (a second 384 MB
--        table) just to read its kind and brand flag, which search_documents
--        already has;
--      * a category hit read every code in its range to pick six.
--    v3 reads, per search, at most: the category documents that share a word
--    with the query (a ~25k-document subset with its own small index), 300
--    codes containing every term (plus 300 containing every word when the
--    query has a size), 200 generic codes per category hit, and the catalog
--    rows of the results actually returned.
-- 2. Specific codes must now contain every query word. Leaving one word out is
--    still allowed, but only for category documents (headings, category-level
--    codes, service and cafe codes), which is what that rule was for: letting
--    "Шампунь (всех видов)" answer «шампунь для волос».
-- 3. Sizes, grades and models are matched the way the catalog writes them. The
--    catalog spells the same thing many ways ("М-400", "1,5 л", "1,5л",
--    "50,5г") and the search text turns punctuation into spaces, so «М400»
--    never met "m 400" and «1,5 л» lost its "1" and "5" as one-letter noise.
--    tasnif.query_terms() now reads a number together with a letter before it
--    and a unit after it and accepts the spaced and joined spellings. A size
--    ranks the products that have it first; products of other sizes still show.
-- 4. An exact product match beats its category when the query names a
--    product. «сигареты Winston Blue» showed four generic cigarette codes before
--    the Winston Blue code. When a query of two or more terms has a word no
--    category uses (a brand, a model), codes matching every term count twice.
--    And a code now gets credit once for its best category hit, not once per
--    level: a hit on both a sub-position and its position counted twice, so the
--    hookah device outranked the cafe's hookah service that «кальян» matched
--    best by words.
-- 5. Only the last word may match as a prefix, and only from four letters.
--    «osh» as a prefix was every word starting with "osh" (oshxona, oshqozon…).
-- 6. Typo matching is strict: a query must resemble whole words of the
--    document, not any stretch of it. With the loose rule «капучино» scored 0.5
--    against "kapitalnogo" (capital repairs) and showed it second; strictly it
--    is 0.28. Every typo in the benchmark that passed before still passes
--    («подгузнеки» 0.57, «ремонт тилифона» 0.52).
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Touches schema `tasnif` only. Two new partial indexes (~25k and ~195k
-- entries, built in seconds), a new function tasnif.query_terms, and a new
-- body for tasnif.search with the same signature and result shape, so the
-- website and the benchmark need no change. No document rebuild. Rollback:
-- `supabase/rollback/20260923194000_tasnif_search_v3.down.sql`.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Words on category documents. The predicate must match the one in
-- tasnif.search() exactly, or the planner won't use it.
create index if not exists search_documents_category_tsv_idx
  on tasnif.search_documents using gin (doc_tsv)
  where (entity = 'node' or kind <> 'goods' or is_category_level);

-- The generic (unbranded) codes of a category, in code order, without reading
-- the branded ones: cigarettes are one sub-position with thousands of brands.
create index if not exists search_documents_generic_key_idx
  on tasnif.search_documents (key)
  where entity = 'code' and not is_branded;

-- ---------------------------------------------------------------------------
-- search_stem v3: the -ия family of endings
-- ---------------------------------------------------------------------------
-- Same as v2 plus -ия, -ии, -ию, -ией, -иям, -иями, -иях. «стоматология» was cut
-- to "stomatologi", which misses "стоматолог" and "стоматолога", the words the
-- dental service codes actually use; it is now "stomatolog".
create or replace function tasnif.search_stem(p_token text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when length(p_token) >= 5 and p_token !~ '[0-9]' then coalesce((
      select left(p_token, length(p_token) - length(e))
      from unnest(array[
        'iyami', 'iyam', 'iyax', 'iya', 'iyu', 'iey', 'ii',
        'yami', 'yaya', 'yuyu', 'ami', 'imi', 'ogo', 'ego', 'omu', 'emu', 'aya', 'uyu', 'yam', 'yax',
        'ov', 'ev', 'ie', 'iy', 'oy', 'ey', 'oe', 'ee', 'am', 'ax', 'om', 'em', 'im', 'ix', 'ya', 'yu',
        'a', 'i', 'u', 'e', 'o'
      ]) as e
      where right(p_token, length(e)) = e and length(p_token) - length(e) >= 4
      order by length(e) desc
      limit 1), p_token)
    else p_token
  end;
$$;

-- ---------------------------------------------------------------------------
-- query_terms: a normalised query as full-text terms
-- ---------------------------------------------------------------------------
-- Takes search_text() output. Returns one tsquery per word (at most 6) and per
-- number (at most 3), in query order.
--
-- Words: connecting words and single letters are dropped. Words of five
-- letters or more lose their case ending and match as a prefix, so «телефона»
-- finds "телефоны". A stem of only four letters is too short for that («самса»
-- as "sams" found "самшит" and Samsung), so it matches with the endings a word
-- takes instead. The last word may still be being typed, so from four letters
-- it matches as a prefix too; anything shorter matches whole (as prefixes,
-- «кока» matched "кокамидопропил…" and «osh» 5,954 documents).
--
-- Numbers: a token with a digit, together with a single letter just before it
-- (the "М" of «М 400»), the digit groups after it (the "5" of «1,5») and a unit
-- after those, is one term. It accepts the tokens as typed, fully apart, and
-- with the letter or the unit joined to the digits, because the catalog writes
-- "m 400", "m400", "1 5 l", "1 5l" and "50 5g" for the same kinds of things.
-- When a unit was typed, the digits alone are a second, looser term: «сникерс
-- 50 г» should still rank the bar the catalog calls "50,5г" above other sizes,
-- and a product that also has the unit ranks above that.
create or replace function tasnif.query_terms(p_text text)
returns table (term tsquery, is_number boolean)
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_stop constant text[] := array[
    'na', 'dlya', 'so', 'po', 'iz', 'ot', 'do', 'bez', 'ili', 'ob', 'za', 'pri', 'vo',
    'va', 'uchun', 'bilan', 'ham', 'yoki',
    'the', 'an', 'for', 'of', 'and', 'with', 'to', 'in'];
  v_units constant text[] := array[
    'l', 'ml', 'g', 'gr', 'kg', 'mg', 't', 'sm', 'mm', 'm', 'sht', 'vt', 'kvt', 'v', 'gb', 'tb', 'mb', 'mah'];
  -- Russian case endings as search_text() spells them (search_stem's list) and
  -- the Uzbek plural, for stems too short to match as a prefix.
  v_endings constant text[] := array[
    '', 'a', 'i', 'u', 'e', 'o', 'y', 'ov', 'ev', 'ie', 'iy', 'oy', 'ey', 'oe', 'ee', 'am', 'ax', 'om', 'em',
    'im', 'ix', 'ya', 'yu', 'ami', 'imi', 'ogo', 'ego', 'omu', 'emu', 'aya', 'uyu', 'yam', 'yax', 'yami',
    'lar', 'lari'];
  v_stem text;
  v_tokens text[] := string_to_array(nullif(btrim(coalesce(p_text, '')), ''), ' ');
  v_n integer := coalesce(cardinality(string_to_array(nullif(btrim(coalesce(p_text, '')), ''), ' ')), 0);
  v_words integer := 0;
  v_numbers integer := 0;
  i integer := 1;
  v_group text[];
  v_atoms text[];
  v_k integer;
  v_variants text[];
  v_unit boolean;
begin
  while i <= v_n loop
    if v_tokens[i] ~ '[0-9]' or (length(v_tokens[i]) = 1 and i < v_n and v_tokens[i + 1] ~ '^[0-9]') then
      v_group := array[v_tokens[i]];
      v_unit := false;
      i := i + 1;
      loop
        exit when i > v_n;
        if v_tokens[i] ~ '^[0-9]' and v_group[cardinality(v_group)] ~ '[0-9]$' then
          v_group := v_group || v_tokens[i];
          i := i + 1;
        elsif v_tokens[i] = any (v_units) and v_group[cardinality(v_group)] ~ '[0-9]$' then
          v_group := v_group || v_tokens[i];
          i := i + 1;
          v_unit := true;
          exit;
        else
          exit;
        end if;
      end loop;
      continue when v_numbers >= 3;
      v_numbers := v_numbers + 1;

      v_atoms := string_to_array(regexp_replace(regexp_replace(array_to_string(v_group, ' '),
        '([a-z])([0-9])', '\1 \2', 'g'), '([0-9])([a-z])', '\1 \2', 'g'), ' ');
      v_k := cardinality(v_atoms);
      v_variants := array[
        array_to_string(v_group, ' <-> ') || ':*',
        array_to_string(v_atoms, ' <-> ') || ':*'];
      if v_k >= 2 and v_atoms[1] ~ '^[a-z]+$' then
        v_variants := v_variants || (array_to_string(
          array[v_atoms[1] || v_atoms[2]] || v_atoms[3:v_k], ' <-> ') || ':*');
      end if;
      if v_k >= 2 and v_atoms[v_k] ~ '^[a-z]+$' and v_atoms[v_k - 1] ~ '^[0-9]+$' then
        v_variants := v_variants || (array_to_string(
          v_atoms[1:v_k - 2] || array[v_atoms[v_k - 1] || v_atoms[v_k]], ' <-> ') || ':*');
        if v_k >= 3 and v_atoms[1] ~ '^[a-z]+$' then
          v_variants := v_variants || (array_to_string(
            array[v_atoms[1] || v_atoms[2]] || v_atoms[3:v_k - 2] || array[v_atoms[v_k - 1] || v_atoms[v_k]],
            ' <-> ') || ':*');
        end if;
      end if;
      term := to_tsquery('simple',
        (select string_agg(distinct '(' || v || ')', ' | ') from unnest(v_variants) as v));
      is_number := true;
      return next;
      if v_unit or v_atoms[v_k] = any (v_units) and v_atoms[v_k - 1] ~ '^[0-9]+$' then
        term := to_tsquery('simple', array_to_string(v_atoms[1:v_k - 1], ' <-> ') || ':*');
        return next;
      end if;
    else
      if length(v_tokens[i]) >= 2 and not (v_tokens[i] = any (v_stop)) and v_words < 6 then
        v_words := v_words + 1;
        v_stem := tasnif.search_stem(v_tokens[i]);
        term := case
          when length(v_tokens[i]) >= 5 and length(v_stem) >= 5 then to_tsquery('simple', v_stem || ':*')
          when length(v_tokens[i]) >= 5 then to_tsquery('simple', v_tokens[i] || ':* | ' ||
            (select string_agg(v_stem || e, ' | ') from unnest(v_endings) as e))
          when i = v_n and length(v_tokens[i]) = 4 then to_tsquery('simple', v_tokens[i] || ':*')
          else to_tsquery('simple', v_tokens[i])
        end;
        is_number := false;
        return next;
      end if;
      i := i + 1;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- search v3
-- ---------------------------------------------------------------------------
create or replace function tasnif.search(
  p_query text,
  p_query_embedding extensions.halfvec(1536) default null,
  p_limit integer default 20
)
returns table (
  ikpu text,
  status text,       -- active | inactive
  match text,        -- text | ikpu | barcode | package | prefix | same_category
  kind text,         -- goods | service | catering
  is_branded boolean,
  name_ru text,
  name_uz_latn text,
  name_uz_cyrl text,
  subposition_code text,
  score double precision
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_digits text := regexp_replace(coalesce(p_query, ''), '[\s.-]', '', 'g');
  v_q text := tasnif.search_text(p_query);
  v_word_terms tsquery[];
  v_number_terms tsquery[];
  v_word_count integer;
  v_count integer;
  v_min_words integer;
  v_any tsquery;          -- any term: ranks
  v_recruit tsquery;      -- any word (any number if there are no words): finds category documents
  v_all tsquery;          -- every term
  v_all_words tsquery;    -- every word, when a size should rank rather than filter
  v_specific boolean;      -- names a product: counts exact matches twice
begin
  -- A pasted number: look it up as what it could be, most specific first.
  if v_digits ~ '^[0-9]{3,17}$' then
    return query
    with hits as (
      select c.ikpu, c.status, 'ikpu'::text as match, 1 as priority, 1.0::double precision as score
      from tasnif.codes c where length(v_digits) = 17 and c.ikpu = v_digits
      union all
      select i.ikpu, 'inactive', 'ikpu', 1, 1.0
      from tasnif.inactive_codes i where length(v_digits) = 17 and i.ikpu = v_digits
      union all
      -- Leading zeros are padding: a scanned UPC-A, a GTIN-14 and the stored
      -- EAN-13 are the same number.
      select c.ikpu, c.status, 'barcode', 2, 0.9
      from tasnif.codes c
      where length(v_digits) between 8 and 14 and c.barcode is not null
        and ltrim(c.barcode, '0') = ltrim(v_digits, '0')
      union all
      select p.ikpu, 'active', 'package', 3, 0.8
      from tasnif.packages p where length(v_digits) between 4 and 9 and p.package_code = v_digits::bigint
      union all
      select x.ikpu, 'active', 'prefix', 4, 0.5
      from (
        select c.ikpu from tasnif.codes c
        where length(v_digits) in (3, 5, 8, 11, 14) and c.status = 'active'
          and c.ikpu between rpad(v_digits, 17, '0') and rpad(v_digits, 17, '9')
        order by c.is_branded, right(c.ikpu, 6) <> '000000', c.ikpu
        limit v_limit
      ) x
    ), neighbours as (
      -- A switched-off code: offer the active generic codes of its sub-position.
      select c.ikpu, c.status, 'same_category'::text as match, 5 as priority, 0.4::double precision as score
      from tasnif.inactive_codes i
      join tasnif.codes c on c.subposition_code = i.subposition_code and c.status = 'active' and not c.is_branded
      where length(v_digits) = 17 and i.ikpu = v_digits
    ), ranked as (
      select h.*, row_number() over (partition by h.ikpu order by h.priority) as dup
      from (select * from hits union all select * from neighbours) h
    )
    select r.ikpu, r.status, r.match,
      coalesce(c.kind, tasnif.kind_of(r.ikpu)),
      coalesce(c.is_branded, false),
      coalesce(c.name_ru, i.name_ru), c.name_uz_latn, c.name_uz_cyrl,
      left(r.ikpu, 11), r.score
    from ranked r
    left join tasnif.codes c on c.ikpu = r.ikpu
    left join tasnif.inactive_codes i on i.ikpu = r.ikpu
    where r.dup = 1
    order by r.priority, r.ikpu
    limit v_limit;
    return;
  end if;

  select array_agg(t.term) filter (where not t.is_number), array_agg(t.term) filter (where t.is_number)
    into v_word_terms, v_number_terms
  from tasnif.query_terms(v_q) as t;
  v_word_count := coalesce(cardinality(v_word_terms), 0);
  v_count := v_word_count + coalesce(cardinality(v_number_terms), 0);
  if v_count = 0 and p_query_embedding is null then
    return;
  end if;
  if v_count > 0 then
    v_any := (select string_agg('(' || q::text || ')', ' | ')::tsquery
              from unnest(coalesce(v_word_terms, '{}') || coalesce(v_number_terms, '{}')) as q);
    v_all := (select string_agg('(' || q::text || ')', ' & ')::tsquery
              from unnest(coalesce(v_word_terms, '{}') || coalesce(v_number_terms, '{}')) as q);
    v_recruit := (select string_agg('(' || q::text || ')', ' | ')::tsquery
                  from unnest(coalesce(v_word_terms, v_number_terms)) as q);
    if v_word_count > 0 and v_count > v_word_count then
      v_all_words := (select string_agg('(' || q::text || ')', ' & ')::tsquery from unnest(v_word_terms) as q);
    end if;
    -- One word may be missing once there are two or more, on category
    -- documents only (see cat_words). Numbers never count towards this.
    v_min_words := case when v_word_count >= 2 then v_word_count - 1 else least(v_word_count, 1) end;
    -- A query that names a product: two or more terms, one of them a word no
    -- category document uses (a brand or a model: «winston», «nescafe»), and
    -- some code containing all of them. «un oliy nav» is all category words,
    -- so its branded matches don't jump ahead of "Пшеничная мука высшего сорта".
    v_specific := v_count >= 2
      and exists (
        select 1 from unnest(v_word_terms) as q
        where not exists (
          select 1 from tasnif.search_documents d
          where (d.entity = 'node' or d.kind <> 'goods' or d.is_category_level) and d.doc_tsv @@ q))
      and exists (select 1 from tasnif.search_documents d where d.entity = 'code' and d.doc_tsv @@ v_all);
  end if;

  -- Typos: a query must resemble whole words of a document, and closely when
  -- it is short (at 0.5, «плов» matched «полов»).
  perform set_config('pg_trgm.strict_word_similarity_threshold',
    case when length(v_q) <= 5 then '0.7' else '0.5' end, true);
  perform set_config('hnsw.ef_search', '100', true);

  return query
  with cat_words as (        -- A1: category documents sharing a word with the query
    -- Headings, category-level codes and service/cafe codes: ~25k documents
    -- behind their own index, so even a common word reads few pages. Here one
    -- word may be missing, which lets "Шампунь (всех видов)" answer «шампунь
    -- для волос».
    select x.key, x.entity, x.kind, x.is_branded, x.is_generic, x.words, x.cover, x.rank, x.len
    from (
      select d.key, d.entity, d.kind, d.is_branded, d.is_category_level or d.kind <> 'goods' as is_generic,
        (select count(*) from unnest(v_word_terms) q where d.doc_tsv @@ q)::integer as words,
        (select count(*) from unnest(coalesce(v_word_terms, '{}') || coalesce(v_number_terms, '{}')) q
          where d.doc_tsv @@ q)::integer as cover,
        ts_rank_cd(d.doc_tsv, v_any) as rank,
        length(d.doc) as len
      from tasnif.search_documents d
      where v_recruit is not null
        and (d.entity = 'node' or d.kind <> 'goods' or d.is_category_level)
        and d.doc_tsv @@ v_recruit
    ) x
    where x.words >= v_min_words
  ),
  code_words as (            -- A2: codes containing every term
    -- Each scan stops after 300: a common word («молоко») matches about a
    -- thousand codes, and reading them all is what made v2 slow. The
    -- category-level codes for such a word come from A1 and from category
    -- hits, so the cut only thins out the list of specific products. With a
    -- size in the query, codes with every word but another size come from the
    -- second scan, ranked below the ones that have the size.
    select x.key, 'code'::text as entity, x.kind, x.is_branded, x.is_generic, v_word_count as words,
      (select count(*) from unnest(coalesce(v_word_terms, '{}') || coalesce(v_number_terms, '{}')) q
        where x.doc_tsv @@ q)::integer as cover,
      ts_rank_cd(x.doc_tsv, v_any) as rank,
      length(x.doc) as len
    from (
      (select d.key, d.kind, d.is_branded, d.is_category_level or d.kind <> 'goods' as is_generic, d.doc_tsv, d.doc
       from tasnif.search_documents d
       where v_all is not null and d.entity = 'code' and d.doc_tsv @@ v_all
       limit 300)
      union all
      (select d.key, d.kind, d.is_branded, d.is_category_level or d.kind <> 'goods' as is_generic, d.doc_tsv, d.doc
       from tasnif.search_documents d
       where v_all_words is not null and d.entity = 'code' and d.doc_tsv @@ v_all_words
       limit 300)
    ) x
  ),
  words as (
    select distinct on (w.key) w.key, w.entity, w.is_branded, w.is_generic, w.cover, w.rank, w.len
    from (select * from cat_words union all select * from code_words) w
    order by w.key, w.cover desc
  ),
  lexical as (               -- A: codes, most terms first, general before branded
    -- "General" is a category-level code or a cafe/service code: the cafe menu
    -- has no category-level codes at all, and a skewer (goods) must not beat
    -- the dish (catering) on that alone.
    select w.key, v_specific and w.cover = v_count as exact,
      row_number() over (order by w.cover desc, w.is_generic desc, w.is_branded, w.rank desc, w.len, w.key) as r
    from words w
    where w.entity = 'code'
    order by w.cover desc, w.is_generic desc, w.is_branded, w.rank desc, w.len, w.key
    limit 200
  ),
  heading_words as (         -- A': headings, and cafe/service codes, containing every query word
    -- A goods category found by words stands for its generic codes; a cafe or
    -- service code found by words stands for itself, with the same weight.
    select w.key, w.entity,
      row_number() over (order by w.cover desc, w.rank desc, w.len, w.key) as r
    from cat_words w
    where (w.entity = 'node' or w.kind <> 'goods') and w.words = v_word_count
    order by w.cover desc, w.rank desc, w.len, w.key
    limit 30
  ),
  fuzzy as (                 -- B: typos, on categories and service/cafe codes
    select d.key, d.entity,
      row_number() over (order by extensions.strict_word_similarity(v_q, d.doc) desc, length(d.doc), d.key) as r
    from tasnif.search_documents d
    where v_word_count > 0
      and (entity = 'node' or kind <> 'goods' or is_category_level)
      and v_q operator(extensions.<<%) d.doc
    order by extensions.strict_word_similarity(v_q, d.doc) desc, length(d.doc), d.key
    limit 30
  ),
  semantic as (              -- C: meaning, on categories and service/cafe codes
    select d.key, d.entity,
      row_number() over (order by d.embedding operator(extensions.<=>) p_query_embedding) as r
    from tasnif.search_documents d
    where p_query_embedding is not null and d.embedding is not null
    order by d.embedding operator(extensions.<=>) p_query_embedding
    limit 30
  ),
  categories as (
    select x.key, x.entity, sum(1.0 / (60 + x.r)) as s
    from (
      select key, entity, r from heading_words
      union all select key, entity, r from fuzzy
      union all select key, entity, r from semantic
    ) x
    group by x.key, x.entity
  ),
  category_hits as (         -- the strongest categories, as ranges of codes
    select c.key, row_number() over (order by c.s desc, c.key) as cr,
      case when c.entity = 'code' then c.key else rpad(c.key, 17, '0') end as lo,
      case when c.entity = 'code' then c.key else rpad(c.key, 17, '9') end as hi
    from categories c
    where c.entity = 'code' or length(c.key) in (8, 11)
    order by c.s desc, c.key
    limit 12
  ),
  expanded as (              -- a category hit stands for its generic codes
    select e.key, (h.cr - 1) * 6 + e.wr as r
    from category_hits h
    cross join lateral (
      select g.key,
        row_number() over (order by g.is_category_level desc, extensions.strict_word_similarity(v_q, g.doc) desc, g.key) as wr
      from (
        -- The first 200 generic codes of the range, read in code order through
        -- their own index; most categories have far fewer.
        select d.key, d.is_category_level, d.doc
        from tasnif.search_documents d
        where d.key between h.lo and h.hi and d.entity = 'code' and not d.is_branded
        order by d.key
        limit 200
      ) g
      order by g.is_category_level desc, extensions.strict_word_similarity(v_q, g.doc) desc, g.key
      limit 6
    ) e
  ),
  fused as (                 -- rank fusion; an exact match on a product query counts twice
    -- A code is credited once for its best category hit: a sub-position and
    -- its position both hitting must not count it twice.
    select k.key, sum(k.weight / (60 + k.r))::double precision as score
    from (
      select key, r, case when exact then 2.0 else 1.0 end as weight from lexical
      union all select key, min(r), 1.0 from expanded group by key
    ) k
    group by k.key
  ),
  shaped as (                -- kind and brand flag from the pages already read
    select f.key, f.score, d.kind, d.is_branded, d.subposition_code,
      row_number() over (partition by d.subposition_code, d.is_branded order by f.score desc, f.key) as per_group,
      row_number() over (partition by d.kind order by f.score desc, f.key) as per_kind,
      max(f.score) over () as top_score
    from fused f
    join tasnif.search_documents d on d.key = f.key
  ),
  picked as (
    -- Branded variants are capped at two per sub-position, and the best result
    -- of each kind (goods / service / catering) is lifted to the top when it is
    -- at least half as strong as the leader.
    select s.key, s.score, s.kind, s.is_branded, s.subposition_code,
      (s.per_kind = 1 and s.score >= 0.5 * s.top_score) as lifted
    from shaped s
    where not s.is_branded or s.per_group <= 2
    order by (s.per_kind = 1 and s.score >= 0.5 * s.top_score) desc, s.score desc, s.key
    limit v_limit
  )
  -- Names come from the catalog, for the returned rows only.
  select p.key, 'active'::text, 'text'::text, p.kind, p.is_branded,
    c.name_ru, c.name_uz_latn, c.name_uz_cyrl, p.subposition_code, p.score
  from picked p
  join tasnif.codes c on c.ikpu = p.key and c.status = 'active'
  order by p.lifted desc, p.score desc, p.key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute rights: service role only
-- ---------------------------------------------------------------------------
revoke all on function tasnif.query_terms(text) from public, anon, authenticated;
revoke all on function tasnif.search(text, extensions.halfvec, integer) from public, anon, authenticated;
grant execute on function tasnif.query_terms(text) to service_role;
grant execute on function tasnif.search(text, extensions.halfvec, integer) to service_role;
