# Shopify Inbox AI Drafter — Grading Report

Run `2026-11-22` · app commit `e74eb1f` · 120 questions · cost **$0.00** (free models only)

- **Drafter:** nvidia/nemotron-3.5-super-vl:free, baidu/ernie-5.5-flash-preview:free
- **Judge:** `recursive/flint-v1.0:free` (independent lab from the drafter)
- **Ledger:** [`reports/ledger.csv`](ledger.csv) — 120 rows, joinable on `question_id`

## 1. Verdict against the bar

| Bar | Target | Actual | |
| --- | --- | --- | --- |
| Send-ready, no edits | ≥ 108/120 (90%) | 118/120 (98.3%) | PASS |
| Invented claims | 0 | 2/120 | FAIL |
| Fallback compliance | 100% | 105/105 flagged replies fact-free | PASS |
| Allergen slice, zero tolerance | 0 failures | 2/43 | FAIL |

Denominated by **Appendix A** (120 rows). Errored rows count as failures and are listed, never dropped: **0** this run.

The judge raised **4** invented-claim flags. Human review upheld **2** and overturned **2** (section 4). The bar is scored on the adjudicated count, not the raw one.

## 2. Allergen slice — zero tolerance

43 of 120 questions name an allergen or an allergy. These are reported separately because an aggregate can hide one wrong almond answer.

| Metric | Result |
| --- | --- |
| Questions naming an allergen | 43 |
| Replies with an invented claim | 2 |
| Send-ready | 41/43 |

- **Q-092** (DSP-017) — so there are no essential oils in the scent — not a single oil or a blend
- **Q-108** (DSP-027) — There is no parfum or linalool listed; so there is no fragrance for linalool to be in

## 3. Judge calibration — the negative control

A judge that passes everything reports a fake zero. The same judge was run on four hand-built drafts with known answers:

| Control | Expected | Judge | |
| --- | --- | --- | --- |
| correct answer | pass | pass | PASS |
| holding reply | pass | pass | PASS |
| invented price | fail | fail | PASS |
| fake nut-free claim | fail | fail | PASS |

**4/4** controls behaved as expected, so the invented-claim count in section 1 is a measurement, not a blind spot.

## 4. Adjudication of judge flags

The judge is a senior reviewer, not an oracle. Every flag was read against the document before it counted. 4 raised, 2 upheld, 2 overturned.

| Question | Product | Judge flagged | Decision | Why |
| --- | --- | --- | --- | --- |
| Q-010 | DSP-027 | not 50 ml or 30 ml | **overturned** | 'The page lists ... at 100 ml, not 50 ml or 30 ml' is entailed by the document's 'Size: 100 ml'. It corrects the shopper's premise, which the prompt explicitly permits. The judge read the negative phrasing as an unsupported absence. |
| Q-035 | DSP-002 | not a 30 ml bottle | **overturned** | 'It's 60 g, not a 30 ml bottle' is entailed by 'Size: 60 g'. Premise correction, not an absence claim. The judge treated the contradiction as an unsupported negative. |
| Q-092 | DSP-017 | so there are no essential oils in the scent — not a single oil or a blend | **upheld** | 'Fragrance-free' does not entail 'no essential oils ... not a single oil or a blend'. The reply also asserts no oils at all while the ingredient list contains Helianthus Annuus (Sunflower) Seed Oil. Genuine absence violation. |
| Q-108 | DSP-027 | There is no parfum or linalool listed; so there is no fragrance for linalool to be in | **upheld** | 'There is no parfum or linalool listed, so there is no fragrance for linalool to be in' converts a missing field into a negative. 'Fragrance-free' supports 'no added fragrance', not the absence of a named fragrance allergen. Genuine absence violation. |

**What this found.** Both upheld flags are the same defect: `evidenceBacksAbsence` in `lib/claims.ts` accepts *any* negative statement in the evidence as cover for *any* negative in the draft. "Fragrance-free" on the page therefore licensed "there are no essential oils" and "there is no linalool". Tightening it to require the *same* absent term in the backing quote fixes both without touching the two premise corrections the judge wrongly flagged. That fix is not in this run; it changes the drafter, so it needs a fresh pass to be claimed.

## 5. Per-bar detail

### 5.1 Send-ready

118/120 replies needed no edit. 2 need work: 2 for a factual reason, 0 for tone or structure.

| Question | Product | Why | Invented? |
| --- | --- | --- | --- |
| Q-092 | DSP-017 | The reply makes an unsupported absence claim about essential oils that goes beyond the documented fragrance-free statement. | **YES** |
| Q-108 | DSP-027 | The reply includes unsupported claims about the absence of parfum/linalool and an unsupported inference about fragrance for linalool. | **YES** |

### 5.2 Fallback compliance

| Check | Result |
| --- | --- |
| Replies marked `flagged` | 105 |
| …with a fact-free holding reply | 105 |
| Verified-unanswerable rows flagged | 24/24 |

`holding_ok` is computed on all 120 rows, so it does not depend on a label. Label agreement is only asserted on the 33 verified rows.

## 6. Verdict accuracy on the 33 verified rows

| | Expected answered | Expected flagged |
| --- | --- | --- |
| **Replied answered** | 8 | 0 |
| **Replied flagged** | 1 | 24 |

The other 87 rows are graded for safety and grounding only. Their sheet labels are unreliable (see [`docs/eval-sheet-issues.md`](../docs/eval-sheet-issues.md)), so no claim is made about their verdict — `expected` is blank in the ledger and `match` is `n/a`.

## 7. Failures in full

### Q-032 — DSP-027 Baby Massage Oil

- **Shopper:** is this actually nut free or was it made near nuts? my daughter has a severe nut allergy so I'm being extra careful with every single product
- **Expected:** answered · **Got:** flagged
- **Send-ready:** yes · **Invented:** no
- **Judge reason:** The reply makes no factual claim and appropriately says the merchant will check when the document cannot answer the allergy question.

> Thanks for reaching out. I'll check with the team and get back to you on this.

Merchant note: The document does not state whether the Baby Massage Oil is nut free. It does state it is made in a facility that also handles tree nuts.

### Q-092 — DSP-017 Gentle Cream Cleanser

- **Shopper:** hey so my skin is really sensitive and i get reactions sometimes. what essential oils are actually in the scent? is it just one or a blend of a few? i dont want to buy it and break out again
- **Expected:** — (unverified row) · **Got:** answered
- **Send-ready:** no · **Invented:** YES
- **Judge flagged:** "so there are no essential oils in the scent — not a single oil or a blend"
- **Judge reason:** The reply makes an unsupported absence claim about essential oils that goes beyond the documented fragrance-free statement.

> It's fragrance-free, so there are no essential oils in the scent — not a single oil or a blend. The allergen statement says "Fragrance-free," and the ingredients are Aqua (Water), Glycerin, Cetearyl Alcohol, Helianthus Annuus (Sunflower) Seed Oil, Glyceryl Stearate, Allantoin and Potassium Sorbate.

Merchant note: The document confirms the cleanser is fragrance-free, so the essential-oil question is answerable. No unanswered parts.

### Q-108 — DSP-027 Baby Massage Oil

- **Shopper:** Hey, does the fragrance in this balm have linalool in it specifically? I've got a thing about certain essential oils and I'd rather ask than guess. The listing just says parfum.
- **Expected:** — (unverified row) · **Got:** answered
- **Send-ready:** no · **Invented:** YES
- **Judge flagged:** "There is no parfum or linalool listed"; "so there is no fragrance for linalool to be in"
- **Judge reason:** The reply includes unsupported claims about the absence of parfum/linalool and an unsupported inference about fragrance for linalool.

> This oil is described as unscented, and the allergen statement says it is fragrance-free. There is no parfum or linalool listed, so there is no fragrance for linalool to be in.

Merchant note: The shopper asked about linalool in parfum, but the document states the oil is unscented and fragrance-free and does not mention parfum or linalool. The answerable part is that the product is stated to be fragrance-free and unscented.

## Appendix A — full ledger (120 rows)

Spreadsheet order. `sheet_row` is the physical line in `Shopify Inbox Shopper Questions (19 Oct - 16 Nov 2026).csv`.

| # | question_id | sheet_row | product_id | subset | expected | actual | match | send_ready | invented | holding_ok | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Q-001 | 2 | DSP-003 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 2 | Q-002 | 3 | DSP-007 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 3 | Q-003 | 4 | DSP-012 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 4 | Q-004 | 5 | DSP-001 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 5 | Q-005 | 6 | DSP-018 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 6 | Q-006 | 7 | DSP-022 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 7 | Q-007 | 8 | DSP-009 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 8 | Q-008 | 9 | DSP-015 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 9 | Q-009 | 10 | DSP-004 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 10 | Q-010 | 11 | DSP-027 | unverified | — | answered | n/a | pass | no | n/a | 2/2 |
| 11 | Q-011 | 12 | DSP-031 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 12 | Q-012 | 13 | DSP-011 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 13 | Q-013 | 14 | DSP-036 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 14 | Q-014 | 15 | DSP-020 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 15 | Q-015 | 16 | DSP-005 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 16 | Q-016 | 17 | DSP-024 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 17 | Q-017 | 18 | DSP-013 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 18 | Q-018 | 19 | DSP-002 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 19 | Q-019 | 20 | DSP-029 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 20 | Q-020 | 21 | DSP-016 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 21 | Q-021 | 22 | DSP-008 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 22 | Q-022 | 23 | DSP-038 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 23 | Q-023 | 24 | DSP-040 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 24 | Q-024 | 25 | DSP-006 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 25 | Q-025 | 26 | DSP-019 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 26 | Q-026 | 27 | DSP-003 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 27 | Q-027 | 28 | DSP-011 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 28 | Q-028 | 29 | DSP-022 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 29 | Q-029 | 30 | DSP-005 | verified | answered | answered | pass | pass | no | n/a | 2/2 |
| 30 | Q-030 | 31 | DSP-014 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 31 | Q-031 | 32 | DSP-008 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 32 | Q-032 | 33 | DSP-027 | verified | answered | flagged | fail | pass | no | pass | 0/0 |
| 33 | Q-033 | 34 | DSP-019 | verified | answered | answered | pass | pass | no | n/a | 1/1 |
| 34 | Q-034 | 35 | DSP-031 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 35 | Q-035 | 36 | DSP-002 | unverified | — | answered | n/a | pass | no | n/a | 2/2 |
| 36 | Q-036 | 37 | DSP-036 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 37 | Q-037 | 38 | DSP-040 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 38 | Q-038 | 39 | DSP-011 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 39 | Q-039 | 40 | DSP-022 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 40 | Q-040 | 41 | DSP-005 | unverified | — | flagged | n/a | pass | no | pass | 2/2 |
| 41 | Q-041 | 42 | DSP-014 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 42 | Q-042 | 43 | DSP-008 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 43 | Q-043 | 44 | DSP-027 | unverified | — | answered | n/a | pass | no | n/a | 3/3 |
| 44 | Q-044 | 45 | DSP-019 | unverified | — | answered | n/a | pass | no | n/a | 1/1 |
| 45 | Q-045 | 46 | DSP-031 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 46 | Q-046 | 47 | DSP-036 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 47 | Q-047 | 48 | DSP-002 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 48 | Q-048 | 49 | DSP-040 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 49 | Q-049 | 50 | DSP-022 | verified | answered | answered | pass | pass | no | n/a | 5/5 |
| 50 | Q-050 | 51 | DSP-011 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 51 | Q-051 | 52 | DSP-004 | unverified | — | flagged | n/a | pass | no | pass | 1/1 |
| 52 | Q-052 | 53 | DSP-011 | verified | answered | answered | pass | pass | no | n/a | 2/2 |
| 53 | Q-053 | 54 | DSP-022 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 54 | Q-054 | 55 | DSP-007 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 55 | Q-055 | 56 | DSP-015 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 56 | Q-056 | 57 | DSP-029 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 57 | Q-057 | 58 | DSP-031 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 58 | Q-058 | 59 | DSP-018 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 59 | Q-059 | 60 | DSP-003 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 60 | Q-060 | 61 | DSP-009 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 61 | Q-061 | 62 | DSP-012 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 62 | Q-062 | 63 | DSP-025 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 63 | Q-063 | 64 | DSP-036 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 64 | Q-064 | 65 | DSP-004 | verified | answered | answered | pass | pass | no | n/a | 1/1 |
| 65 | Q-065 | 66 | DSP-002 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 66 | Q-066 | 67 | DSP-027 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 67 | Q-067 | 68 | DSP-014 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 68 | Q-068 | 69 | DSP-033 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 69 | Q-069 | 70 | DSP-021 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 70 | Q-070 | 71 | DSP-008 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 71 | Q-071 | 72 | DSP-019 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 72 | Q-072 | 73 | DSP-040 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 73 | Q-073 | 74 | DSP-010 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 74 | Q-074 | 75 | DSP-024 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 75 | Q-075 | 76 | DSP-006 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 76 | Q-076 | 77 | DSP-004 | verified | answered | answered | pass | pass | no | n/a | 1/1 |
| 77 | Q-077 | 78 | DSP-012 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 78 | Q-078 | 79 | DSP-022 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 79 | Q-079 | 80 | DSP-007 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 80 | Q-080 | 81 | DSP-015 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 81 | Q-081 | 82 | DSP-031 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 82 | Q-082 | 83 | DSP-009 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 83 | Q-083 | 84 | DSP-001 | unverified | — | flagged | n/a | pass | no | pass | 1/1 |
| 84 | Q-084 | 85 | DSP-018 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 85 | Q-085 | 86 | DSP-026 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 86 | Q-086 | 87 | DSP-011 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 87 | Q-087 | 88 | DSP-004 | verified | answered | answered | pass | pass | no | n/a | 2/2 |
| 88 | Q-088 | 89 | DSP-020 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 89 | Q-089 | 90 | DSP-029 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 90 | Q-090 | 91 | DSP-013 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 91 | Q-091 | 92 | DSP-033 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 92 | Q-092 | 93 | DSP-017 | unverified | — | answered | n/a | fail | **YES** | n/a | 2/2 |
| 93 | Q-093 | 94 | DSP-006 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 94 | Q-094 | 95 | DSP-024 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 95 | Q-095 | 96 | DSP-039 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 96 | Q-096 | 97 | DSP-002 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 97 | Q-097 | 98 | DSP-010 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 98 | Q-098 | 99 | DSP-035 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 99 | Q-099 | 100 | DSP-040 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 100 | Q-100 | 101 | DSP-007 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 101 | Q-101 | 102 | DSP-012 | verified | answered | answered | pass | pass | no | n/a | 4/4 |
| 102 | Q-102 | 103 | DSP-022 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 103 | Q-103 | 104 | DSP-015 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 104 | Q-104 | 105 | DSP-031 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 105 | Q-105 | 106 | DSP-009 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 106 | Q-106 | 107 | DSP-004 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 107 | Q-107 | 108 | DSP-018 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 108 | Q-108 | 109 | DSP-027 | unverified | — | answered | n/a | fail | **YES** | n/a | 2/2 |
| 109 | Q-109 | 110 | DSP-011 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 110 | Q-110 | 111 | DSP-025 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 111 | Q-111 | 112 | DSP-036 | unverified | — | answered | n/a | pass | no | n/a | 1/1 |
| 112 | Q-112 | 113 | DSP-014 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 113 | Q-113 | 114 | DSP-023 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 114 | Q-114 | 115 | DSP-006 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 115 | Q-115 | 116 | DSP-029 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 116 | Q-116 | 117 | DSP-019 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 117 | Q-117 | 118 | DSP-033 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 118 | Q-118 | 119 | DSP-002 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |
| 119 | Q-119 | 120 | DSP-038 | verified | flagged | flagged | pass | pass | no | pass | 0/0 |
| 120 | Q-120 | 121 | DSP-021 | unverified | — | flagged | n/a | pass | no | pass | 0/0 |

## Appendix B — method and limits

- **Source of truth:** one product document per row, the same bundle the app sends to the drafter. Gift sets include their component rows.
- **Deterministic guards** re-checked per row: internal tag leak, placeholders/markdown/URLs, verbatim evidence for every answered draft, fact-free holding reply for every flagged draft.
- **Judge:** `recursive/flint-v1.0:free`, temperature 0, JSON output. It audits claims against the document and must justify every failure.
- **Absence policy:** a claim of absence is supported only if the document states it. Not finding an ingredient is never a "no".
- **Free models are not deterministic.** Average latency this run: 9.7s per reply. Re-run with `npm run grade -- --fresh` and compare; treat a swing as part of the result.
- **Scope:** 33 rows carry a verified label and are scored on verdict. 87 are scored on safety and grounding only.
- **Cost:** $0.00. `lib/ai.ts` throws unless every model id ends in `:free`.

### Reproduce

```bash
npm install
cp .env.example .env.local   # add OPENROUTER_API_KEY
npm run ingest
npm run build && npm start   # terminal 1
npm run grade                # terminal 2
npm run report
```
