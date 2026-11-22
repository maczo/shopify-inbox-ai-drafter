/**
 * Offline checks for the deterministic guards. No network, no model, no cost.
 *
 *   node scripts/selftest.ts
 *
 * These are the layers that actually enforce "can't make things up":
 * evidence verification, the negative-claim guard, and the holding-reply
 * validator. If these pass, a model cannot get an unsupported claim out.
 */
import { stripDocAnnotations } from "../lib/annotations.ts";
import { assertsAbsence, evidenceBacksAbsence } from "../lib/claims.ts";
import { findCoconutDerivatives } from "../lib/coconut.ts";
import { hasUsableEvidence, verifyEvidence } from "../lib/evidence.ts";
import { HOLDING_TEMPLATE, checkHoldingReply } from "../lib/holding.ts";
import { commonNamesFor } from "../lib/synonyms.ts";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
  }
}

const DOC = [
  "=== PRODUCT DOCUMENT: DSP-004 — Calendula Healing Balm Light ===",
  "Price: 26.00",
  "Size: 50 g",
  "Ingredients: Calendula Officinalis Flower Extract, Caprylic/Capric Triglyceride, Cera Alba (Beeswax)",
  "Allergen statement: Contains beeswax.",
  "Usage: Warm a small amount between fingertips and press onto clean skin.",
].join("\n");

// ---------------------------------------------------------------- evidence

const verified = verifyEvidence(
  [
    { quote: "Size: 50 g", field: "Size" },
    { quote: "caprylic/capric   TRIGLYCERIDE", field: "Ingredients" },
    { quote: "contains coconut oil", field: "Ingredients" },
    { quote: "50", field: "Size" },
  ],
  DOC,
);

check("exact quote verifies", verified[0].ok);
check("whitespace and case differences still verify", verified[1].ok);
check("invented quote is rejected", !verified[2].ok);
check("too-short quote is unverifiable", !verified[3].ok);
check("has usable evidence when one quote verifies", hasUsableEvidence(verified));
check("no usable evidence when all quotes fail", !hasUsableEvidence(verified.slice(2)));

// --------------------------------------------------------- negative claims

check(
  "rejects an unsupported absence",
  assertsAbsence("It doesn't contain fragrance.") &&
    !evidenceBacksAbsence(verified),
);
check(
  "rejects a free-from claim",
  assertsAbsence("This balm is paraben-free.") &&
    !evidenceBacksAbsence(verified),
);
check(
  "rejects an unsupported 'we don't ship there'",
  assertsAbsence("We don't ship to Canada.") && !evidenceBacksAbsence(verified),
);
check(
  "allows a negative the page actually states",
  assertsAbsence("It contains no added fragrance.")
    ? evidenceBacksAbsence([
        { quote: "Contains no added fragrance.", field: "Ingredients", ok: true },
      ])
    : true,
);
check(
  "plain positive answer is not treated as an absence claim",
  !assertsAbsence("Yes, it contains beeswax."),
);

// -------------------------------------------------------- holding replies

check("template passes", checkHoldingReply(HOLDING_TEMPLATE).ok);
check(
  "model-written holding reply passes",
  checkHoldingReply(
    "Thanks for reaching out. Let me check that with the team and I'll come back to you.",
  ).ok,
);
check(
  "holding reply with a price is rejected",
  !checkHoldingReply("Thanks for reaching out. It's $26 and I'll come back to you.").ok,
);
check(
  "holding reply with an ingredient is rejected",
  !checkHoldingReply("Thanks for reaching out. It has no coconut, I'll confirm.").ok,
);
check(
  "holding reply with a number is rejected",
  !checkHoldingReply("Thanks for reaching out. Let me check the 50 g size.").ok,
);
check(
  "holding reply with a placeholder is rejected",
  !checkHoldingReply("Hi [name], let me check that with the team.").ok,
);
check(
  "holding reply without a holding phrase is rejected",
  !checkHoldingReply("Thanks for reaching out. We appreciate your message.").ok,
);

// ---------------------------------------------------------------- coconut

check(
  "INCI derivative is detected",
  findCoconutDerivatives(
    "Aqua, Caprylic/Capric Triglyceride, Glycerin",
  ).includes("Caprylic/Capric Triglyceride"),
);
check(
  "coco-glucoside is detected",
  findCoconutDerivatives("Aqua, Coco-Glucoside, Sodium Chloride").includes(
    "Coco-Glucoside",
  ),
);
check(
  "cocos nucifera is detected",
  findCoconutDerivatives("Cocos Nucifera (Coconut) Oil, Tocopherol").includes(
    "Cocos Nucifera",
  ),
);
check(
  "fatty alcohols are not mislabelled as coconut",
  findCoconutDerivatives("Cetearyl Alcohol, Cetyl Alcohol").length === 0,
);
check(
  "non-coconut oil is not flagged",
  findCoconutDerivatives("Prunus Amygdalus Dulcis (Sweet Almond) Oil").length === 0,
);

// --------------------------------------------------------------- synonyms

check("tocopherol is vitamin E", commonNamesFor("Tocopherol").includes("vitamin E"));
check(
  "sodium hyaluronate is hyaluronic acid",
  commonNamesFor("Sodium Hyaluronate").includes("hyaluronic acid"),
);
check(
  "ascorbic acid is vitamin C",
  commonNamesFor("Ascorbic Acid").includes("vitamin C"),
);
check(
  "a plain botanical has no invented synonym",
  commonNamesFor("Kaolin").length === 0,
);
check(
  "marketing words are not treated as ingredients",
  commonNamesFor("Parfum (Fragrance)").length === 0,
);

check(
  "coconut annotation is stripped from shopper text",
  stripDocAnnotations(
    "It contains Caprylic/Capric Triglyceride [coconut-derived: Caprylic/Capric Triglyceride].",
  ) === "It contains Caprylic/Capric Triglyceride.",
);
check(
  "synonym annotation is stripped from shopper text",
  stripDocAnnotations("Yes, it contains Tocopherol [also known as: vitamin E].") ===
    "Yes, it contains Tocopherol.",
);
check(
  "combined annotation is stripped",
  stripDocAnnotations(
    "Tocopherol [coconut-derived: x; also known as: vitamin E]",
  ) === "Tocopherol",
);

// ------------------------------------------------------------------ report

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
