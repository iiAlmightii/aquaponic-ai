# Survey Answer Validation Design

**Date:** 2026-04-08  
**Scope:** Land farm voice survey — per-question input validation  
**File changed:** `backend/services/land_farm_survey_engine.py`

---

## Problem

Text-type questions (`farm_state`, `farm_district`, `market_name`) accept any short phrase, including nonsense sentences like "And I have to go to sleep." This corrupts the financial plan data downstream.

---

## Architecture

All validation logic lives in `land_farm_survey_engine.py`. No router, DB, or frontend changes needed. The `parse_prompt_answer` method is extended with per-question-id checks for the three affected text fields.

---

## Components

### 1. Indian State List (`_INDIAN_STATES`)

A frozenset of all 28 states and 8 union territories, lowercased.

```
andhra pradesh, arunachal pradesh, assam, bihar, chhattisgarh,
goa, gujarat, haryana, himachal pradesh, jharkhand, karnataka,
kerala, madhya pradesh, maharashtra, manipur, meghalaya, mizoram,
nagaland, odisha, punjab, rajasthan, sikkim, tamil nadu, telangana,
tripura, uttar pradesh, uttarakhand, west bengal,
andaman and nicobar islands, chandigarh, dadra and nagar haveli and daman and diu,
delhi, jammu and kashmir, ladakh, lakshadweep, puducherry
```

### 2. `_validate_indian_state(raw: str) -> str`

Returns the matched canonical state name, or raises `ValueError`.

**Algorithm:**
1. Lowercase + strip punctuation from `raw`
2. Exact match against `_INDIAN_STATES`
3. Token match: tokenize the cleaned input into words; accept if any state name (also tokenized) is a subsequence of those tokens (handles "I am from Karnataka" → "Karnataka"). Word-boundary aware — "go" does NOT match "goa".
4. No match → raise `ValueError("Please say a valid Indian state name (e.g. Karnataka, Punjab).")`

Returns the matched state name (title-cased canonical form).

### 3. `_is_sentence_like(raw: str) -> bool`

Returns `True` if the input looks like a sentence rather than a place name.

**Rejects if any of:**
- Contains personal pronouns as whole words: `i`, `my`, `we`, `they`, `he`, `she`, `you`
- Contains filler verb phrases: `have to`, `going to`, `want to`, `need to`, `got to`
- Starts with a conjunction: `and`, `but`, `so`, `because`, `since`
- Word count > 5

### 4. Extended `parse_prompt_answer`

Add per-question-id handling inside the `text` kind branch:

```
if prompt.id == "farm_state":
    return _validate_indian_state(raw)

if prompt.id in ("farm_district", "market_name"):
    if prompt.id == "market_name" and raw.lower().strip() in ("unknown", "not known", "don't know"):
        return raw
    if _is_sentence_like(raw):
        raise ValueError("Please say a place name (e.g. Bengaluru Urban / Yeshwanthpur).")
    # falls through to existing generic text checks
```

---

## Error Messages

| Question | Bad input example | Error shown to user |
|---|---|---|
| `farm_state` | "And I have to go to sleep." | "Please say a valid Indian state name (e.g. Karnataka, Punjab)." |
| `farm_district` | "And I have to go to sleep." | "Please say a district name (e.g. Bengaluru Urban)." |
| `market_name` | "And I have to go to sleep." | "Please say a market or mandi name (e.g. Yeshwanthpur), or say 'unknown'." |

---

## What Is Not Changed

- `number`, `select`, `confirm` question kinds — already validate correctly
- Crop name validation — already handled separately
- Router, DB schema, frontend — no changes

---

## Testing

- Unit tests in `backend/tests/test_land_farm_survey_engine.py`
- Cases: valid state, typo state, sentence as state, sentence as district, "unknown" for market_name, valid district name
