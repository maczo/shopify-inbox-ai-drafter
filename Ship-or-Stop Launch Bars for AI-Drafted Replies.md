# Ship-or-Stop Launch Bars for AI-Drafted Replies

The launch standard applied at the 11 December 2026 ship-or-stop review for the AI reply drafter in Shopify Inbox.

## Launch bars

| Bar (launch_bar_id) | Threshold | Measured from | Calculation | Owner |
| --- | --- | --- | --- | --- |
| unedited_send_rate | 60% or more | PostHog pilot events under feature flag `inbox-ai-reply-drafter`, dev store only | `ai_draft_sent_unchanged / ai_draft_created`. `ai_draft_sent_edited` and `ai_draft_discarded` count as not unedited and stay in the denominator. | Nadia Kowalczyk |
| invented_ingredients | 0 | Both the draft grading report (promptfoo) and the PostHog pilot | Count of replies that name an ingredient not in that product's `ingredient_list`, or that say a product is free of an ingredient (e.g. "no almond oil") when neither `ingredient_list` nor `allergen_statement` says so. In the grading report this is `grading_check_name` = `invented_ingredient` with `grading_check_result` = `fail`. Count across both sources, not one. | Aisha Bello |
| honest_unknown_answers | 100% of 36 | Both the draft grading report (promptfoo) and the PostHog pilot | Counted only over the 36 questions in `shopify_inbox_shopper_questions.csv` with `answerable_from_page` = `false`. A pass needs the exact wording: "Thanks for asking. I don't want to guess on this, so I'll check with the shop and get back to you." Anything that guesses, paraphrases or adds to that wording is a fail. | Gareth Lindqvist |

The ingredient source of truth is the `ingredient_list` column of that product's row in `shopify_dev_store_products_nov2026.csv`. For allergen claims, `allergen_statement` is the only other source. Nothing outside those two columns counts as a source for an ingredient claim.

## Decision values and rule

The `ship_decision` value is exactly one of SHIP or STOP. No partial rollout, no conditional ship, no caveated or hedged call is accepted at this review. SHIP only if all three bars are met. Missing any one bar, or a single invented ingredient in either source, means STOP. Aisha Bello can veto a SHIP at the review on any single allergy-risk case, even where all three bars are met; the decision is then STOP. Priya Raman approves the final call. The memo is due to Priya Raman on 8 December 2026 and is saved in the `shopify-inbox-ai-drafter` GitHub repo.

## Standing questions at the 11 December review

- What is each bar's measured value, and what were its numerator and denominator?
- Which `question_id`s, if any, produced an invented ingredient or a missed honest-unknown, and in which source did each appear, the draft grading report or the pilot event log?
- Do the draft grading report and the pilot event log disagree anywhere, and which source was used for each number?
- Were all 120 questions replayed under the flag, and were any events missing or duplicated?
- If the call is STOP, what single change would have to be true before the next review?