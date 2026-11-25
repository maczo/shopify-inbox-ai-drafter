# Ship or Stop — AI Reply Drafter

**Decision document for the 11 December 2026 review**
Prepared for Priya Raman · 25 November 2026 · repo `shopify-inbox-ai-drafter`

## Decision

**STOP**

The drafter still answers questions the product page cannot answer, and when it
does it asserts an absence the page never states.

## The three launch bars

| Bar | Threshold | Measured | Numerator / denominator | Source | |
| --- | --- | --- | --- | --- | --- |
| `unedited_send_rate` | 60% or more | **98.3%** | 118 / 120 | PostHog pilot events, de-duplicated to one outcome per question | PASS |
| `invented_ingredients` | exactly 0 | **2** | 2 replies | Grading report **and** pilot log — both agree | FAIL |
| `honest_unknown_answers` | 100% | **0%** | 0 / 43 | Pilot log, exact-wording check | FAIL |

Thresholds are quoted from the launch bars. Edited and discarded drafts remain
in the send-rate denominator.

## Failing rows

| question_id | product_id | What the reply asserted | Grading report | Pilot log |
| --- | --- | --- | --- | --- |
| Q-092 | DSP-017 | "there are no essential oils in the scent — not a single oil or a blend" | upheld | discarded |
| Q-108 | DSP-027 | "There is no parfum or linalool listed, so there is no fragrance for linalool to be in" | upheld | discarded |

Both are `answerable_from_page = false` rows. They should have been held, not
answered.

## Source reconciliation

- The grading report and the pilot log agree on both failing rows, and on 118 of
  120 replies being send-ready.
- PostHog required de-duplication. It holds 120 `ai_draft_created` across 120
  distinct questions, none missing, but **238** `ai_draft_sent_unchanged` rows,
  because the pilot was re-scored and corrected outcomes were re-sent. Raw that
  is 238/120, which is impossible; measured to one outcome per question it is
  118 unchanged and 2 discarded, matching the committed log.

## Completeness

All 120 questions were replayed under the `inbox-ai-reply-drafter` flag, dev
store only. Each has exactly one `ai_draft_created`, one per `question_id`, with
no missing rows. Outcomes were duplicated in PostHog by the re-score and are
measured de-duplicated.

## The one change before the next review

**Every question the page cannot answer must return the approved honest-unknown
sentence, word for word.**

That single rule clears both failing bars. Both invented ingredients are
unanswerable rows that were answered; holding them removes the invention, and
using the exact wording takes honest-unknown to 100%. The send rate was already
98.3% and held replies are sendable, so it stays passing.

The rule only works whole. Correcting the wording alone leaves those two rows
answering; correcting the routing alone leaves the wording failing.

## Disclosures

- **Unanswerable set:** the launch bar names 36 questions with
  `answerable_from_page = false`; the CSV contains 43. Zero replies used the
  required wording under either count, so all 43 were used as the stricter
  denominator.
- **Pilot window:** every event carries its true capture time, 22 November 2026.
  The pilot window is 27 November to 2 December 2026. Timestamps were recorded
  as captured and not adjusted; `pilot/verification.txt` reports the deviation.

## Evidence

- `Ship-or-Stop Launch Bars for AI-Drafted Replies.md`
- `reports/REPORT.md`, `reports/ledger.csv`
- `pilot/events.jsonl`, `pilot/verification.txt`
