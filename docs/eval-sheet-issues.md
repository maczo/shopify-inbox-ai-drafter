# Why the 120-row eval sheet can't be used as ground truth

The product sheet (`Shopify Dev Store Product Pages…csv`) is clean and is what
the drafter runs on. The question sheet (`Shopify Inbox Shopper Questions…csv`)
is **not** a reliable label set. The two files look like they were generated
separately and joined on `product_id` without checking that the question text
describes that row.

Only **33 of 120 rows** are internally consistent. The rest are excluded from
`data/golden.json`.

## Error classes

### 1. The note asserts an ingredient is present that the row doesn't contain

23 of the 31 rows whose note says "… is present" are wrong for the product they
point at.

| Row | Product | Note claims | Reality |
|---|---|---|---|
| Q-001 | DSP-003 Baby Bottom Balm | contains almond | no almond in its ingredient list |
| Q-067 | DSP-014 Niacinamide Clarifying Serum | "coconut is present; reply must say so" | no coconut |
| Q-083 | DSP-001 Calendula Healing Balm | coconut confirmed | no coconut |
| Q-100 | DSP-007 Rose Lip Balm | coconut present | no coconut |
| Q-117 | DSP-033 Witch Hazel Toner | almond present | no almond |

These are allergy questions. A correct drafter says "no" or flags, and the
label punishes it.

### 2. Size and price contradict the document

13 of 14 `size_price` rows. Only Q-052 matches.

| Row | Product | Document says | Note says |
|---|---|---|---|
| Q-114 | DSP-006 Lavender Sleep Balm | 30 g / $20.00 | 50 ml / $42.00 |
| Q-035 | DSP-002 Arnica Muscle Balm | 60 g / $22.00 | 30 ml / $14.50 |
| Q-043 | DSP-027 Baby Massage Oil | 100 ml / $18.00 | 50 ml / $22.00 |
| Q-094 | DSP-024 Sensitive Skin Cream | 50 ml / $28.00 | asks about a 100 ml bottle |
| Q-017 | DSP-013 Rosehip Night Serum | 30 ml / $32.00 | 100 g jar |

### 3. The question names a different product category than the row

At least 27 rows. Examples: Q-073 asks about a serum, the row is Tinted Berry
Lip Balm. Q-012 asks about bar soap, the row is Vitamin C Serum. Q-084 asks
about a scalp oil, the row is Green Tea Gel Cleanser.

Some questions reference products that do not exist in the catalogue at all:
"lavender scrub", "retinol cream", "argan hand cream", "eye cream", "scalp
oil". Those are useful *out-of-catalogue* tests, but they cannot be pinned to a
product_id.

### 4. Notes quote page claims that appear nowhere

- `paraben` appears in **0** product rows, yet Q-023, Q-045 and Q-071 claim the
  page states paraben-free.
- `patch test` appears in **1** row (DSP-002), yet Q-014, Q-063 and Q-120 claim
  a patch-test instruction.
- `twice daily` and `pumps` appear in **0** rows, yet Q-003, Q-019, Q-055, Q-078,
  Q-091 and Q-111 quote them as usage text.
- `fragrance-free` appears in 4 rows; Q-040 points at DSP-005, which has no such
  statement.

### 5. Absence policy is applied inconsistently

Seven rows treat "not in the ingredient list" as *cannot confirm* (Q-072, Q-086,
Q-088, Q-090, Q-119 and others). Q-112 treats the same evidence as *answerable*
("no tree nut derivatives … so answer yes/no"). Same evidence, opposite label.

This app resolves it one way: **absence always flags**. That is stricter than
the sheet, so even a repaired sheet needs a policy pass.

## How this repo handles it

- `data/golden.json` contains the 33 rows that survive all checks, with an
  explicit expected verdict per row.
- `docs/eval-sheet-issues.md` is this file.
- `npm run eval` scores only the golden set.

## Repairing the sheet

Per row, decide one of:

1. **Re-key** — the question describes another product. Update `product_id` to
   the row the question actually describes, then regenerate the note from that
   row.
2. **Rewrite** — the question references a product that doesn't exist. Keep it
   as an out-of-catalogue test with `product_id` blank and `answerable = false`.
3. **Re-label** — the question is fine but the note is wrong. Regenerate the
   note from the product row.
4. **Delete** — the row is unsalvageable.

Then re-run `npm run ingest` and `npm run eval`.
