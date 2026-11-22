# Shopify Inbox AI Drafter

Drafts one merchant-ready reply to a shopper message, using **only the store
page for the product being asked about** — and flags the message to the merchant
when the page doesn't cover it.

No invented prices, no invented policies, no guesses dressed up as answers.

## How the guarantee works

Three layers, in order of severity:

1. **One document in context.** The request loads exactly one product row (plus
   its components, for gift sets). There is no store-wide catalogue in the
   prompt, no policy doc, no model world-knowledge to lean on.
2. **Verbatim evidence.** Every factual claim must come with a quote copied
   character-for-character from the document. The server re-checks each quote as
   a substring of the document. If an "answered" draft has no verifiable quote,
   it is downgraded to a flag and replaced with a holding reply — the model
   cannot certify its own grounding.
3. **A holding reply with no facts.** When the page is silent, the shopper gets
   a neutral holding reply and the merchant gets a note explaining exactly what
   is missing. The holding reply is validated in code (no digits, no prices, no
   ingredient names, approved phrasing) and falls back to a fixed template.

### The absence rule

If the shopper asks whether something is present and the page doesn't name it,
the drafter does **not** say no. It flags. A blank field is never a negative
answer.

A contradicted premise is different: if the shopper asks about "the 30 ml" and
the page says 50 g, the drafter corrects it and answers.

### Coconut

Coconut-derived INCI names count as coconut and are tagged in the document, so
"is there coconut in this?" gets a real answer for products that use
`Caprylic/Capric Triglyceride` or `Coco-Glucoside` without ever naming coconut
oil. The reply names the derivative so the shopper can judge for themselves.

### Common names

Shoppers ask for "vitamin E"; the label says `Tocopherol`. `lib/synonyms.ts` is a
small curated table that tags those links in the document
(`Tocopherol [also known as: vitamin E]`), so the drafter can answer without
reaching for outside knowledge. Only equivalences in the table are used — the
model is told never to supply its own. Every tag is stripped from output before
a shopper sees it.

## Quick start

```bash
npm install
cp .env.example .env.local     # then add your OpenRouter key
npm run ingest                 # CSVs -> data/products.json
npm run dev                    # http://localhost:3000
```

The app runs on **free models only**. `lib/ai.ts` throws at startup if any model
in the chain is missing the `:free` suffix, so a typo can never spend credit.

```
DRAFTER_MODEL=nvidia/nemotron-3.5-super-vl:free
FALLBACK_MODELS=baidu/ernie-5.5-flash-preview:free,inclusionai/ling-3.2-flash:free
```

Free endpoints get saturated. The route retries, then falls through to the next
model in the chain.

## Project layout

```
app/
  page.tsx                 workspace
  api/draft/route.ts       the only model endpoint
  api/detect/route.ts      deterministic product detection (no model)
components/
  Workspace.tsx            state, detection, drafting
  ProductPicker.tsx        searchable picker + auto-detect badge
  DraftCard.tsx            verdict banner, editable draft, evidence panel
lib/
  docs.ts                  loads products, builds the closed document bundle
  prompt.ts                system prompt and user prompt
  schema.ts                Zod contract for structured output
  evidence.ts              substring verification
  claims.ts                negative-claim guard
  holding.ts               holding-reply validator
  coconut.ts               coconut-derivative map
  synonyms.ts              common name -> INCI name table
  annotations.ts           strips internal document tags from output
  match.ts                 deterministic product matching
  ai.ts                    OpenRouter client + :free guard
  drafter.ts               fallback chain and post-checks
scripts/
  ingest.ts                CSV -> JSON (Node 24, no deps)
  selftest.ts              offline guard tests (no model, no cost)
  eval.ts                  golden-set evaluation over HTTP
  grade.ts                 all 120 rows: draft + independent judge
  report.ts                renders REPORT.md + ledger.csv, gated
  replay-pilot.ts          replays 120 through the gated endpoint
  verify-pilot.ts          validates the event log against the plan
  make-promptfoo.ts        generates the promptfoo harness from data
promptfoo/
  promptfooconfig.yaml     generated, 120 tests
pilot/
  events.jsonl             the pilot event log
  verification.txt         verifier output
reports/
  REPORT.md                generated grading report
  ledger.csv               one row per question, joinable on question_id
data/
  products.json            generated
  questions.json           generated
  golden.json              33 hand-verified eval rows
docs/
  eval-sheet-issues.md     why the other 87 eval rows are excluded
```

## Data

Both CSVs are exports from an **Inbox Pilot dev store** and are included as
sample data. `npm run ingest` regenerates `data/*.json` from them.

`data/golden.json` is the only trustworthy label set: 33 rows verified against
the product sheet and against this app's absence policy. The other 87 rows in the
question CSV are inconsistent — see
[`docs/eval-sheet-issues.md`](docs/eval-sheet-issues.md).

## Pilot (Phase 3)

The drafter is gated by a PostHog feature flag, scoped to the dev store.

- **Flag:** `inbox-ai-reply-drafter`, group type `store`, group key
  `inbox-ai-dev-store` at 100%, every other store at 0%.
- **Enforced server-side:** `app/api/draft/route.ts` checks the flag before the
  model call. Off, unreachable or missing key means `503`, no draft, no event.
  Hiding the UI in the browser is not the gate.
- **Fail closed:** `lib/flags.ts` treats any non-explicit "enabled" as off, so a
  PostHog outage cannot unlock the drafter.

```bash
npm run build && npm start   # terminal 1
npm run pilot                # terminal 2 — replays all 120, writes pilot/events.jsonl
npm run pilot:verify         # validates the log, refuses to pass on a bad one
```

`pilot/events.jsonl` holds the event log and `pilot/verification.txt` the check
result. The verifier enforces the tracking plan's schema and completeness rule:
120 `ai_draft_created`, one per question, with outcomes summing to the same 120.

**Outcomes are assigned by rule, not observed.** A replay has no merchant
sending anything, so each reply is marked `ai_draft_sent_unchanged` if it passes
the deterministic sendability checks, otherwise `ai_draft_discarded`. The event
schema forbids extra properties, so this is disclosed in the commit message and
here rather than encoded in the payload.

### Environment

| Variable | Purpose |
| --- | --- |
| `POSTHOG_API_KEY` | Project key. Read from the environment, never committed. |
| `POSTHOG_HOST` | `https://us.i.posthog.com` (US Cloud). |
| `OPENROUTER_DRAFTER_MODEL` | Model id recorded on every event. Not hardcoded. |

## Evaluation

```bash
npm run selftest     # offline: the deterministic guards, no model, no cost
npm run dev          # terminal 1
npm run eval         # terminal 2
npm run eval -- --limit=10 --resume
```

`selftest` exercises the layers that actually prevent invented answers — evidence
verification, the negative-claim guard, the holding-reply validator and the
coconut map — with no network calls.

`eval` scores the golden set, prints a confusion matrix and average latency, and
caches each result so a rate-limited run can be resumed.

## Grading report

The full 120-question grading run is separate from the golden-set eval.

```bash
npm run ingest
npm run build && npm start      # terminal 1
npm run grade                   # terminal 2 — 120 drafts + 120 judge calls
npm run report                  # renders reports/REPORT.md + ledger.csv
npm run promptfoo:gen           # regenerates the promptfoo harness
```

- `scripts/grade.ts` drafts every reply through the real HTTP endpoint, then
  audits each one with an independent judge (`recursive/flint-v1.0:free`, a
  different lab from the drafter). It is resumable and rate-limited, because
  free endpoints return 429 under load.
- `scripts/report.ts` renders the report and **refuses to write it** if the
  ledger does not reconcile: 120 rows, 33 verified, counts that tie to the
  verdict table.
- `reports/ledger.csv` is one row per question in spreadsheet order, joinable on
  `question_id`, with the physical `sheet_row` so any result traces back to the
  source CSV.
- `promptfoo/promptfooconfig.yaml` is generated from `questions.json` and
  `golden.json` so the harness cannot drift from the data. It is the canonical
  assertion set; `npm run grade` executes the same assertions with the
  per-row detail and resume behaviour the report needs.

Rows that error count as failures and stay in the denominator. The 87 rows
without a trustworthy label are graded for safety and grounding only — their
`expected` column is blank rather than given a pass they have not earned.

## Limitations

- English only, one message at a time, no thread history.
- No persistence: state lives in the browser.
- Product detection is deterministic and conservative. It returns nothing rather
  than guessing, and the merchant always has the final say.
- Gift sets resolve their components at ingest time by matching the component
  names in the `size` column.
