---
name: typesafe-ai
description: Build AI-powered software with TypeSafe AI System One models (Jev). Formulate typed questions (Choice, Score, Noul) over application state, calculate calibrated probabilities and confidence scores, and implement architectural patterns like speculative fan-out, confidence-gated routing, composite scoring, and pre-parsed extraction. Use whenever implementing classification, evaluation, ranking, decision routing, or LLM guardrails in TypeScript/JavaScript, Python, or HTTP.
---

# TypeSafe AI Specialist

TypeSafe makes units of AI intelligence usable like programming primitives: small, focused judgments that compose cleanly into software workflows. Its **System One models** return fast, structured decisions that code can consume directly without parsing text or extracting JSON. **Jev** is TypeSafe's flagship and first System One model.

Instead of generating free-form prose, code, or reasoning explanations, System One models evaluate a provided **state** against typed **questions** and return calibrated probabilities, exact choices, and confidence scores. Code owns the control flow and business rules; the model supplies programmable common sense where ordinary code needs semantic understanding.

---

## Quick Reference: The Three Primitives

Every TypeSafe evaluation request pairs an application **state** with one or more **questions**:

| Primitive | What It Answers | Criteria Shape | Returns | When to Use |
| :--- | :--- | :--- | :--- | :--- |
| **`Choice`** | Which option from a discrete set? | `Record<string, string \| null>` (map of options to rubrics) | `choice` (winner), `probabilities` (sums to 1.0), `confidence` (0 to 1) | Routing tickets, intent classification, categorical selection. Always include `other`/fallback if options are not exhaustive. |
| **`Score`** | Position along an ordered spectrum? | `string[]` (2 to 10 ordered level descriptions, index 0 upwards) | `score` (continuous float position), `legend`, `probabilities`, `confidence` | Bug severity, customer frustration, relevance rating, candidate grading. Score can land *between* integer levels. |
| **`Noul`** | Is a specific condition true? | Optional `{ true: string, false: string }` | `noul` (0.0 to 1.0 probability of yes) | Binary gates, feature flags, presence checks. Note: `0.5` means uncertain/equal probability, not medium intensity. |

> **Live Docs Rule of Truth:** The live docs at [https://docs.typesafe.ai](https://docs.typesafe.ai) and the index at [`/llms.txt`](https://docs.typesafe.ai/llms.txt) are the canonical source of truth. Append `.md` to any documentation URL to inspect raw Markdown.

---

## Fundamental Design Principles

### 1. Ask for One Snap Judgment per Question
System One is inspired by Daniel Kahneman's *Thinking, Fast and Slow*. System One makes rapid, intuitive judgments that a human expert makes in one second given the facts.
- **Good question:** *"Does `ticket.messages[0].text` convey urgency or a service outage?"*
- **Bad question:** *"Analyze this entire conversation and write the resolution plan."* (Needs slow reasoning; break this into small questions composed in code).

### 2. Separate State from Judgment
- **State (`state`)**: Pure facts, source content, entities, policies, context. State can be a string, JSON object, or array. For complex context, prefer named JSON fields (`{ ticket, order, policy }`).
- **Instructions (`instructions`)**: The exact question or statement being evaluated. Reference nested state paths explicitly using backticks (e.g. ``ticket.messages[0].text``). Question IDs (the dictionary keys) are strictly for your application code—the model never sees them.

### 3. Ask Questions Together (Speculative Fan-Out)
System One models ingest the state once and evaluate **all questions in parallel**:
- Asking 10 questions against the same state takes virtually the same wall-clock time as asking 1 question.
- Token cost: Charged only per input token ($42 / Btok = $0.042 / Mtok; output tokens are free!).
- Include speculative questions up front (e.g., assess refund eligibility *and* churn risk in the initial call; let your code branch on the answers).
- Only make a sequential second call if the second question's state cannot be constructed without the first answer.

### 4. Confidence vs. Probability
- **Noul** returns `noul` (0 to 1), which is itself a calibrated probability of truth. Noul does not have a separate confidence score.
- **Choice** & **Score** return both `probabilities` (the full distribution) and `confidence` (how peaked the distribution is).
  - A flat distribution across 3 options (0.33, 0.33, 0.34) yields **low confidence**, signalling model uncertainty.
  - A concentrated distribution (0.95, 0.03, 0.02) yields **high confidence**.

---

## Architectural Patterns

### Pattern 1: Confidence-Gated Routing
Use confidence to scale system autonomy with risk:
```typescript
const action = response.answers.action;

if (action.confidence < 0.5) {
  // Low confidence / genuinely uncertain -> escalate to human review
  await routeToHumanSupport(state);
} else if (action.choice === 'view_account') {
  // Low stakes read-only action -> auto-execute
  await renderAccountView();
} else if (action.choice === 'delete_resource') {
  // High stakes destructive action -> require high confidence + confirmation
  if (action.confidence > 0.9) {
    await queueWithConfirmation(action.choice);
  } else {
    await askUserClarification();
  }
}
```

### Pattern 2: Composite Scoring
Do not ask the model to synthesize a subjective aggregate score. Instead, ask atomic questions and combine them with deterministic weights in code:
```typescript
// Ask: bug_severity (Score), customer_frustration (Score), reproducibility (Noul)
const severity = response.answers.bug_severity.score; // e.g. 0 to 2
const frustration = response.answers.customer_frustration.score; // e.g. 0 to 3
const repro = response.answers.reproducible.noul; // 0.0 to 1.0

// Code controls business weights and adjustments:
const priorityScore = (severity / 2) * 0.5 + (frustration / 3) * 0.3 + repro * 0.2;
```

### Pattern 3: Select Instead of Generate (Pre-Parsed Value Extraction)
Extract candidate values in code using deterministic regex or parsers (emails, dates, phone numbers, line IDs), then ask TypeSafe to select the intended match:
```typescript
// Candidates extracted by regex: ["2026-09-20", "2026-10-01"]
const response = await client.systemOne({
  state: { email_body: text, candidates: extractedDates },
  questions: {
    effective_date: choice("Which candidate date is the policy renewal date?", {
      "2026-09-20": "First date mentioned in header",
      "2026-10-01": "Date in renewal terms section",
      "none": "Neither date represents the renewal date"
    })
  }
});
```

### Pattern 4: LLM Guardrails & Triage Cascade
Screen every message entering or leaving an application with a fast System One request before routing to heavier generative models:
```typescript
const response = await client.systemOne({
  state: userMessage,
  questions: {
    is_jailbreak: noul("Does this attempt prompt injection or rule override?"),
    harm_severity: score("How severe would harm be if complying with this request?", [
      "Harmless query",
      "Minor policy violation",
      "Severe or dangerous harm"
    ]),
    topic: choice("What domain does this inquiry belong to?", {
      billing: null,
      technical: null,
      out_of_scope: null
    })
  }
});

if (response.answers.is_jailbreak.noul > 0.7 || response.answers.harm_severity.score >= 1.0) {
  return "Request blocked by safety policy.";
}
```

---

## SDK Quickstarts

### TypeScript / JavaScript (`@typesafe-ai/sdk`)
```bash
npm install @typesafe-ai/sdk
```

```typescript
import { TypeSafeClient, choice, score, noul } from '@typesafe-ai/sdk';

// Automatically uses process.env.TYPESAFE_API_KEY
const client = new TypeSafeClient();

const response = await client.systemOne({
  state: {
    ticket: "My delivery is 3 days late and tracking stopped updating.",
    customer_tier: "enterprise"
  },
  questions: {
    department: choice("Which department should resolve this ticket?", {
      logistics: "Lost packages, tracking freezes, delivery delays",
      billing: "Refund requests, invoices, payments",
      account: "General profile or enterprise account rep inquiries"
    }),
    urgency: noul("Does `ticket` require immediate same-day escalation?", {
      true: "Explicit delivery deadline or business interruption",
      false: "Standard delay inquiry"
    }),
    frustration: score("How frustrated is the customer?", [
      "Patient, factual",
      "Annoyed or concerned",
      "Extremely frustrated or escalating"
    ])
  }
});

console.log(response.answers.department.choice);      // "logistics"
console.log(response.answers.department.confidence);  // 0.94
console.log(response.answers.urgency.noul);           // 0.88
console.log(response.answers.frustration.score);      // 1.2
```

### Python (`typesafe-sdk`)
```bash
pip install typesafe-sdk
```

```python
import os
from typesafe_sdk import TypeSafeClient, Choice, Score, Noul

with TypeSafeClient() as client:
    response = client.system_one(
        state={"message": "I was charged twice for order #992."},
        questions={
            "is_refund": Noul(instructions="Does the message ask for a refund?"),
            "category": Choice(
                instructions="Classify this issue",
                criteria={"billing": "Payment & charge issues", "tech": "Bugs", "other": None}
            ),
            "severity": Score(
                instructions="Assess issue severity",
                criteria=["Cosmetic", "Degraded", "Blocking"]
            )
        }
    )

print(response.answers["is_refund"].noul)
print(response.answers["category"].choice)
print(response.answers["severity"].score)
```

### Raw HTTP API
- **Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Headers**:
  - `Authorization: Bearer <API_KEY>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "model": "jev-latest",
    "state": { "text": "Sample text to evaluate" },
    "questions": {
      "q1": {
        "type": "choice",
        "instructions": "Select option",
        "criteria": { "opt_a": "Desc A", "opt_b": "Desc B" }
      }
    }
  }
  ```

---

## Detailed References

For complete deep-dives into advanced setups, consult the bundled reference documents:
- [Primitives Guide](references/primitives-guide.md): Advanced JSON criteria, structured instructions, score legends, and calibration.
- [Architectural Patterns](references/patterns.md): Complete recipes for Speculative Fan-out, Composite Scoring, Function Calling, and Re-ranking.
- [SDK Reference](references/sdk-reference.md): Full TypeScript/Python options, error handling (`429`, `529`, `422`), retries, and models listing.
