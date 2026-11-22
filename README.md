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

## Limitations

- English only, one message at a time, no thread history.
- No persistence: state lives in the browser.
- Product detection is deterministic and conservative. It returns nothing rather
  than guessing, and the merchant always has the final say.
- Gift sets resolve their components at ingest time by matching the component
  names in the `size` column.
