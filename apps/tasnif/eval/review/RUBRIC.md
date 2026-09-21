# How the benchmark's answer key is reviewed

The 150 cases in `../cases.jsonl` decide when tasnif.krafta.uz is good enough to launch, so each
answer is reviewed the way a careful Uzbek accountant would pick a code for a client. This is
an AI review, not the opinion of a licensed accountant. Anything that genuinely depends on how
an inspector would read the situation is marked `ambiguous`, never guessed.

## What a correct code means

1. **The code describes what is actually sold.** Since 2023-03-01 the Tax Code (article 223)
   fines receipts and e-invoices whose IKPU doesn't match the nomenclature of the goods or
   services. The name of the code, read with its whole category path, must fit the sale.
2. **Made on the premises and served** (café, restaurant, canteen, tea house, fast-food stall,
   coffee point) → a catering code from class `10202` ("приготовленные в заведении общественного
   питания"), the most specific dish or drink type available. **Factory-packaged goods resold
   as they are** (a bottle of Coca-Cola, a packet of chips, wrapped ice cream), even inside a
   café → the goods code of that product, not a catering code.
3. **Goods in shops.**
   - A query that names a brand or model → that product's specific code(s).
   - A generic query ("молоко 1 литр", "подгузники") → the category-level code of the matching
     sub-position (brand and attribute digits all zero), plus unbranded attribute codes that
     match what the query says. The official catalog's own note: category ("root", ★) codes may
     be used when the catalog has no identical item with its attributes.
   - A product type that has **no generic code at all** in the catalog, only specific models or
     packs (the catalog has ~3,150 such headings: fridges, vodka, TVs, cigarettes…): the honest
     answer is "the right sub-position; the merchant then picks their exact model". Use
     `acceptable_prefix` = that 11-digit sub-position code instead of listing model codes.
4. **Services** → the service code for that activity. When the catalog holds two codes that
   mean the same service (there are duplicates, e.g. two beauty-salon codes), both are
   acceptable.
5. **No fitting code exists** → acceptable is the closest "прочие / other" code in the right
   class, verdict `ambiguous`, and the reason says a new code can be requested on
   tasnif.soliq.uz.
6. **Licensing and regulated activities** (medical massage, pharmacy, alcohol) change which code
   is lawful. If the right answer depends on a licence the merchant may or may not have, mark it
   `ambiguous` and say so.

## Acceptable sets are for grading a search

- `acceptable` lists every code a careful accountant would accept for the stated intent.
- `best` is the single most precise one.
- A code that would be wrong on the receipt is never acceptable just because a search might show
  it.
- Keep `intent` honest. If the query is really ambiguous (a café or a shop could both type it),
  the intent says which one this case assumes, and the acceptable set follows the intent.

## Evidence required for every case

- Read each acceptable code's full record: name, attribute, and the whole path (group › class ›
  position › sub-position).
- Look at its siblings in the same position and sub-position.
- Search the catalog for other plausible codes: key words and synonyms in Russian and Uzbek, the
  singular and plural forms, and neighbouring classes, so that a better or duplicate code isn't
  missed.
- Record the alternatives you considered and why each was rejected.

## Output

One JSON object per case, per line:

```json
{"id": "cafe-001", "verdict": "confirmed", "confidence": "high",
 "acceptable": ["10202001010000002"], "acceptable_prefix": null, "best": "10202001010000002",
 "intent": "A cafe owner adding cappuccino to the cash register menu",
 "reason": "Made by the barista and served on the premises, so the catering code for coffee drinks. A Torabika or Nescafe cappuccino sachet code would describe a packaged product the café doesn't sell.",
 "alternatives_considered": [{"code": "00901001001000000", "name": "Молотый (порошкообразный) кофе", "why_not": "Packaged ground coffee sold as goods, not a drink prepared on site."}]}
```

- `verdict`: `confirmed` (the original answer stands), `corrected` (acceptable, best, prefix or
  intent changed), or `ambiguous` (defensible answer recorded, but a practising accountant or the
  Tax Committee should decide).
- `confidence`: `high`, `medium` or `low`.
- `reason`: plain English, one to three sentences, the way you'd explain it to the merchant.
