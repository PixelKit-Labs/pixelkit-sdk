# TypeSafe Primitives In-Depth Guide

This guide details the three fundamental System One primitives (`Choice`, `Score`, and `Noul`), their JSON schemas, criteria specifications, confidence derivation, and prompt engineering best practices.

---

## 1. Choice Primitive (`type: "choice"`)

A `Choice` question forces the System One model to distribute probability across a fixed set of mutually exclusive options.

### Request Shape
```json
{
  "type": "choice",
  "instructions": "Which department should handle this request?",
  "criteria": {
    "billing": "Invoice disputes, payment processing failures, refunds",
    "technical": "Software bugs, system outages, API integration errors",
    "sales": "New account upgrades, enterprise seat inquiries, pricing discounts",
    "other": "General inquiries or issues not covered by billing, technical, or sales"
  }
}
```

### Response Shape
```json
{
  "type": "choice",
  "choice": "technical",
  "confidence": 0.94,
  "probabilities": {
    "billing": 0.02,
    "technical": 0.94,
    "sales": 0.01,
    "other": 0.03
  }
}
```

### Key Rules for Choice
1. **Always Include a Fallback/No-Match Option**: If the input may not fit any defined category, add an `"other"` or `"none_of_the_above"` key. If omitted, the model is forced to pick the least-bad option, creating false positives.
2. **Mutually Distinct Rubrics**: Ensure options do not overlap in definition. Clearly state boundary exclusions (e.g. `"technical: Software bugs and API errors, but NOT billing issues caused by bugs"`).
3. **Structured Criteria**: When simple string descriptions are insufficient, pass structured JSON objects:
   ```json
   "criteria": {
     "tier_1": {
       "description": "Basic account issues",
       "includes": ["Password resets", "Email changes"],
       "excludes": ["Security lockouts", "Billing disputes"]
     }
   }
   ```

---

## 2. Score Primitive (`type: "score"`)

A `Score` question evaluates where the state falls along an ordered spectrum defined by 2 to 10 sequential levels.

### Request Shape
```json
{
  "type": "score",
  "instructions": "Assess the severity of the incident described in `incident_report`.",
  "criteria": [
    "Level 0: Minor cosmetic issue with zero business disruption",
    "Level 1: Degraded performance or non-critical feature outage with active workaround",
    "Level 2: Major core feature failure impacting multiple users with no workaround",
    "Level 3: Critical complete platform outage, severe data corruption, or security breach"
  ]
}
```

### Response Shape
```json
{
  "type": "score",
  "score": 1.74,
  "confidence": 0.86,
  "legend": {
    "0": "Level 0: Minor cosmetic issue with zero business disruption",
    "1": "Level 1: Degraded performance or non-critical feature outage with active workaround",
    "2": "Level 2: Major core feature failure impacting multiple users with no workaround",
    "3": "Level 3: Critical complete platform outage, severe data corruption, or security breach"
  },
  "probabilities": {
    "0": 0.01,
    "1": 0.28,
    "2": 0.67,
    "3": 0.04
  }
}
```

### Key Rules for Score
1. **Scores Are Continuous Numbers**: `score` is calculated as the probability-weighted expectation $\sum (\text{level\_index} \times P(\text{level}))$. A score of `1.74` indicates the model leans strongly toward Level 2, but recognizes elements of Level 1.
2. **Levels Must Be Ordered**: The levels must proceed monotonically from low intensity/quality to high intensity/quality.
3. **Concrete Level Descriptions**: Avoid vague labels like "Good", "Better", "Best". Describe concrete operational scenarios at each level.

---

## 3. Noul Primitive (`type: "noul"`)

A `Noul` question evaluates a single proposition or condition and returns the probability that the statement is true.

### Request Shape
```json
{
  "type": "noul",
  "instructions": "Does `customer_message` indicate that the customer has contacted support previously about this exact issue?",
  "criteria": {
    "true": "Customer explicitly references prior tickets, mentions calling before, or expresses repeat frustration",
    "false": "No mention or implication of previous contact"
  }
}
```

### Response Shape
```json
{
  "type": "noul",
  "noul": 0.96
}
```

### Key Rules for Noul
1. **No Separate Confidence**: `noul` is already a calibrated probability.
   - `noul > 0.85`: High-probability yes.
   - `noul < 0.15`: High-probability no.
   - `0.40 <= noul <= 0.60`: Genuine uncertainty.
2. **Do Not Conflate Probability with Intensity**:
   - "Is this candidate strong in Python?" -> If `noul = 0.5`, it does **not** mean medium skill. It means the model has a 50/50 probability that the candidate meets the criteria. To measure skill level, use a `Score`.
3. **Phrase Positively for Clarity**: Phrase the question so that `1.0` unequivocally means the condition holds.

---

## 4. State Referencing Syntax

When evaluating complex JSON states, instruct the model where to look using backticked path expressions:

```json
{
  "state": {
    "ticket": {
      "id": "T-1029",
      "author": { "name": "Alice", "role": "customer" },
      "thread": [
        { "sender": "Alice", "body": "I cannot download my invoice for March." },
        { "sender": "SupportAgent", "body": "Have you tried clearing your cookies?" },
        { "sender": "Alice", "body": "Yes, it still fails with error 403." }
      ]
    },
    "organization_policy": {
      "auto_refund_max": 50,
      "escalation_sla_hours": 2
    }
  },
  "questions": {
    "resolution_attempted": {
      "type": "noul",
      "instructions": "Did the customer follow the suggestion in `ticket.thread[1].body` as reported in `ticket.thread[2].body`?"
    },
    "eligible_for_auto_remedy": {
      "type": "noul",
      "instructions": "Does the issue in `ticket.thread[0].body` fall under standard invoice retrieval rather than a monetary dispute in `organization_policy`?"
    }
  }
}
```
