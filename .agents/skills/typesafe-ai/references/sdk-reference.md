# TypeSafe SDK & API Technical Reference

Complete technical specification for the JavaScript/TypeScript SDK, Python SDK, HTTP endpoint, and error handling protocols.

---

## 1. JavaScript / TypeScript SDK (`@typesafe-ai/sdk`)

### Installation
```bash
npm install @typesafe-ai/sdk
# Requirements: Node.js 20+
```

### Client Initialization & Configuration
```typescript
import { TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({
  // Defaults to process.env.TYPESAFE_API_KEY
  apiKey: process.env.TYPESAFE_API_KEY,
  
  // Custom base URL (default: "https://api.typesafe.ai")
  baseURL: "https://api.typesafe.ai",
  
  // Request timeout in milliseconds (default: 60000ms / 60s)
  timeout: 30000,
  
  // Retry options
  maxRetries: 3,
  retryPolicy: {
    maxRetries: 4,
    retryableStatuses: [408, 409, 429, 500, 502, 503, 504, 529],
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffFactor: 2
  }
});
```

### Helper Constructors
```typescript
import { choice, score, noul } from "@typesafe-ai/sdk";

// Choice: instructions + criteria map
const c = choice("Categorize document", {
  pdf: "PDF report format",
  spreadsheet: "CSV or Excel sheets",
  other: null
});

// Score: instructions + ordered array of levels (2 to 10 strings)
const s = score("Rate urgency", [
  "No rush",
  "Normal priority",
  "Urgent same-day"
]);

// Noul: instructions + optional { true, false } criteria
const n = noul("Is user authorized?", {
  true: "User is an administrator or owner",
  false: "User has standard view-only permissions"
});
```

---

## 2. Python SDK (`typesafe-sdk`)

### Installation
```bash
pip install typesafe-sdk
# Requirements: Python 3.9+
```

### Synchronous Client
```python
from typesafe_sdk import TypeSafeClient, Choice, Score, Noul

with TypeSafeClient(api_key=os.getenv("TYPESAFE_API_KEY"), timeout=30.0) as client:
    response = client.system_one(
        state={"message": "System down, need reboot."},
        questions={
            "is_outage": Noul(instructions="Does message report a total outage?"),
            "severity": Score(instructions="Rate impact", criteria=["Low", "Med", "Crit"]),
            "team": Choice(instructions="Assign team", criteria={"ops": "DevOps", "dev": "App Dev"})
        }
    )
    print(response.answers["is_outage"].noul)
```

### Asynchronous Client
```python
import asyncio
from typesafe_sdk import AsyncTypeSafeClient, Choice

async def main():
    async with AsyncTypeSafeClient() as client:
        response = await client.system_one(
            state="User question text",
            questions={
                "topic": Choice(instructions="Pick topic", criteria={"a": "Topic A", "b": "Topic B"})
            }
        )
        print(response.answers["topic"].choice)

asyncio.run(main())
```

---

## 3. Direct HTTP API

### Endpoint
```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### Request Payload
```json
{
  "model": "jev-latest",
  "state": {
    "user_id": "usr_9981",
    "text": "The transaction went through but my balance did not update."
  },
  "questions": {
    "has_discrepancy": {
      "type": "noul",
      "instructions": "Does the user report a balance ledger discrepancy?"
    },
    "severity": {
      "type": "score",
      "instructions": "Rate urgency of ledger update",
      "criteria": [
        "Normal latency, within standard banking window",
        "Delayed over 24 hours or causing bounce fees"
      ]
    }
  }
}
```

---

## 4. Error Codes & Resilience

| HTTP Status | Exception Class | Description | Resolution Strategy |
| :--- | :--- | :--- | :--- |
| `400` | `BadRequestError` | Malformed payload syntax | Fix client JSON payload structure. |
| `401` | `AuthenticationError` | Missing or invalid API key | Verify `TYPESAFE_API_KEY` credential in environment. |
| `404` | `NotFoundError` | Endpoint or model alias not found | Check URL and model name (use `"jev-latest"`). |
| `422` | `UnprocessableEntityError` | Schema validation error (e.g. invalid question type or <2 score criteria) | Read `error.details` for offending field name and correct schema. |
| `429` | `RateLimitError` | Token-per-second or RPM limit reached | Exponential backoff. SDK retries automatically; check `retry-after` header. |
| `529` | `APIError` (`Overloaded`) | Server infrastructure temporarily saturated | Exponential backoff retry with jitter. |

### Retry Protocol
When invoking raw HTTP, always implement exponential backoff with jitter:
$$t_{\text{wait}} = \min(t_{\text{max}}, t_{\text{base}} \times 2^{\text{attempt}}) \pm \text{jitter}$$
Honor any `Retry-After` HTTP header provided by the response.
