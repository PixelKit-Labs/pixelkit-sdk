# TypeSafe Architectural Patterns & Recipes

This document provides production-ready recipes for composing TypeSafe System One judgments into robust software systems.

---

## 1. Speculative Fan-Out

### Concept
Because Jev evaluates all questions in parallel over the ingested state, asking 10 questions takes the exact same wall-clock time as asking 1 question. Do not make sequential requests when candidate branch questions can be posed upfront.

### Implementation
```typescript
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

async function handleIncomingMessage(userMessage: string, accountContext: any) {
  // Fan-out: ask primary intent AND branch-specific speculative questions together
  const evalResult = await client.systemOne({
    state: { message: userMessage, account: accountContext },
    questions: {
      // Primary router
      intent: choice("What is the primary action requested?", {
        flight_change: "Change date, flight number, or destination",
        refund: "Request cash or credit refund",
        baggage_claim: "Lost or delayed luggage report",
        general_info: "Baggage allowance, check-in times, general FAQ"
      }),
      // Speculative for flight_change:
      is_same_day: noul("Does the user want to change to a flight departing today?"),
      fare_class_preference: choice("Does the user specify cabin class preference?", {
        economy: "Economy, coach, or standard seating",
        business: "Business class, first class, or premium",
        unspecified: "No cabin preference expressed"
      }),
      // Speculative for refund:
      refund_reason_medical: noul("Is the refund requested due to medical emergency, illness, or bereavement?"),
      // Universal sentiment:
      customer_frustration: score("How frustrated is the customer?", [
        "Calm and polite",
        "Mildly impatient",
        "Extremely agitated or threatening escalation"
      ])
    }
  });

  const { answers } = evalResult;

  // Code handles the deterministic branching:
  switch (answers.intent.choice) {
    case 'flight_change':
      return executeFlightChange({
        isSameDay: answers.is_same_day.noul > 0.7,
        cabin: answers.fare_class_preference.choice !== 'unspecified' ? answers.fare_class_preference.choice : null,
        priority: answers.customer_frustration.score >= 1.5
      });

    case 'refund':
      return processRefundRequest({
        medicalExemption: answers.refund_reason_medical.noul > 0.8,
        frustrationScore: answers.customer_frustration.score
      });

    default:
      return routeToStandardFaq(answers.intent.choice);
  }
}
```

---

## 2. Confidence-Gated Escalation

### Concept
Confidence indicates whether the probability distribution is concentrated (certain) or dispersed (uncertain). Combine confidence thresholds with risk profiles.

```typescript
async function processAutomatedAction(requestText: string) {
  const result = await client.systemOne({
    state: requestText,
    questions: {
      action: choice("Determine appropriate customer support action", {
        issue_credit: "Apply up to $25 goodwill credit to user wallet",
        reset_password: "Trigger password reset link email",
        cancel_subscription: "Immediately terminate active paid plan",
        human_intervention: "Complex or ambiguous request"
      })
    }
  });

  const answer = result.answers.action;

  // 1. Guard against genuine ambiguity across all actions
  if (answer.confidence < 0.55) {
    console.log(`Model uncertain (confidence ${answer.confidence}). Routing to human agent.`);
    return escalateToHumanSupport(requestText, answer);
  }

  // 2. Low-risk actions allow lower confidence thresholds
  if (answer.choice === 'reset_password' && answer.confidence >= 0.70) {
    return sendPasswordResetEmail();
  }

  // 3. Medium-risk actions requiring financial impact
  if (answer.choice === 'issue_credit') {
    if (answer.confidence >= 0.88) {
      return applyCredit(25);
    } else {
      return queueForSupervisorReview(25, answer);
    }
  }

  // 4. High-risk destructive actions require very high confidence + user confirmation
  if (answer.choice === 'cancel_subscription') {
    if (answer.confidence >= 0.95) {
      return presentConfirmationModal("Are you sure you want to cancel your plan?");
    } else {
      return routeToRetentionTeam();
    }
  }

  return escalateToHumanSupport(requestText, answer);
}
```

---

## 3. Composite Scoring

### Concept
Break subjective multi-criteria evaluations into independent dimensions, and combine using transparent mathematical formulas in code.

```typescript
interface LeadCandidate {
  companyName: string;
  employeeCount: number;
  pitchNotes: string;
  fundingStage: string;
}

async function rankSalesLead(lead: LeadCandidate): Promise<number> {
  const response = await client.systemOne({
    state: lead,
    questions: {
      problem_fit: score("How closely does the customer's problem match our developer observability platform?", [
        "Completely irrelevant domain (e.g. brick and mortar retail)",
        "Tangential interest (uses software, but has no microservices)",
        "Strong direct fit (manages high-scale distributed APIs)"
      ]),
      budget_indication: score("How clearly does `pitchNotes` signal available enterprise budget?", [
        "Mentions budget freezes or free tier inquiries only",
        "Standard commercial inquiry",
        "Explicitly allocated enterprise expansion budget"
      ]),
      urgency: noul("Does `pitchNotes` describe an active deadline, incident, or migration in the next 30 days?")
    }
  });

  const fitScore = response.answers.problem_fit.score / 2.0;       // Normalized 0 to 1
  const budgetScore = response.answers.budget_indication.score / 2.0; // Normalized 0 to 1
  const urgencyWeight = response.answers.urgency.noul;             // 0 to 1

  // Composite calculation owned 100% by code:
  const weightedLeadScore = (fitScore * 0.50) + (budgetScore * 0.30) + (urgencyWeight * 0.20);
  return Math.round(weightedLeadScore * 100);
}
```

---

## 4. Select Instead of Generate (Pre-Parsed Extraction)

### Concept
LLMs often hallucinate or distort formats during text generation. Instead, run fast regex/AST in code to extract raw candidate tokens, then have TypeSafe choose between them.

```typescript
function extractDatesFromEmail(emailBody: string): string[] {
  const dateRegex = /\b(?:\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?,? \d{4})\b/gi;
  return Array.from(new Set(emailBody.match(dateRegex) || []));
}

async function resolveContractEffectiveDate(emailText: string) {
  const candidates = extractDatesFromEmail(emailText);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple candidate dates found: let TypeSafe identify the role of each
  const criteriaMap: Record<string, string> = {
    none: "None of these dates represent the contract effective date"
  };
  candidates.forEach((c) => {
    criteriaMap[c] = `Date mentioned as: ${c}`;
  });

  const response = await client.systemOne({
    state: { text: emailText, candidates },
    questions: {
      effective_date: choice("Which date is explicitly stated as the effective start date of the agreement?", criteriaMap)
    }
  });

  const selected = response.answers.effective_date.choice;
  return selected === 'none' ? null : selected;
}
```

---

## 5. Re-Ranking and Context Selection

### Concept
When searching across hundreds of passages or documentation sections, retrieve candidate candidates using lightweight search (BM25 or embeddings), then use TypeSafe to evaluate exact query relevance.

```typescript
async function rerankSearchResults(query: string, passages: Array<{ id: string; text: string }>) {
  // Batch score relevance for top 10 candidates in a single TypeSafe call
  const questions: Record<string, any> = {};
  passages.forEach((p) => {
    questions[`rel_${p.id}`] = score(`How directly does passage ${p.id} answer the query: "${query}"?`, [
      "Irrelevant or off-topic",
      "Mentions keywords but does not answer the core question",
      "Directly and authoritatively answers the query"
    ]);
  });

  const evalResult = await client.systemOne({
    state: { query, passages },
    questions
  });

  return passages
    .map((p) => ({
      ...p,
      relevanceScore: evalResult.answers[`rel_${p.id}`].score,
      confidence: evalResult.answers[`rel_${p.id}`].confidence
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
```
