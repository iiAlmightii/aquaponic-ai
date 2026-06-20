"""Land farm voice survey engine: guided short-answer state machine."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional


SHORT_ANSWER_MAX_WORDS = 10
GENERIC_NON_ANSWERS = {
    "thank you", "thanks", "ok", "okay", "hello", "hi", "hii", "hmm", "huh",
    "can you repeat", "repeat", "sorry", "pardon", "what", "yes", "no",
}

# Phrases that are clearly NOT crop names (STT noise, filler phrases)
_NON_CROP_PHRASES = {
    "thank you for watching", "thanks for watching", "thank you for listening",
    "please subscribe", "like and subscribe", "see you next time",
    "have a nice day", "have a good day", "goodbye", "bye bye",
    "i don't know", "i do not know", "not sure", "no idea",
    "none of the above", "that is all", "that's all",
}

# Words that strongly indicate this is NOT a crop name
_NON_CROP_WORDS = {
    "watching", "subscribe", "channel", "video", "please", "goodbye",
    "listening", "podcast", "episode", "tutorial", "lesson",
}


def _is_valid_crop_name(name: str) -> bool:
    """Return False if the name looks like STT noise rather than a real crop."""
    lower = name.lower().strip()
    if lower in _NON_CROP_PHRASES:
        return False
    words = lower.split()
    # Reject if any word is a known non-crop indicator
    if any(w in _NON_CROP_WORDS for w in words):
        return False
    # Reject names longer than 3 words (most crop names are 1-3 words)
    if len(words) > 3:
        return False
    return True


@dataclass
class Prompt:
    id: str
    text: str
    kind: str = "text"  # text | number | select | confirm
    options: list[str] | None = None
    example: str | None = None


def _word_count(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def _clean_crop_name(raw: str) -> str:
    """
    Strip STT punctuation artifacts from a crop name and deduplicate repeated words.
    E.g. "beans! beans!" → "beans", "toma-to, tomato" → "tomato".
    """
    # Keep only letters, digits, spaces, and hyphens (for names like "bitter-gourd")
    cleaned = re.sub(r"[^a-z0-9\s\-]", " ", raw.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
    if not cleaned:
        return ""
    # Deduplicate consecutive repeated words: "beans beans" → "beans"
    words = cleaned.split()
    deduped: list[str] = []
    for w in words:
        if not deduped or w != deduped[-1]:
            deduped.append(w)
    return " ".join(deduped)


def _is_generic_non_answer(text: str) -> bool:
    t = re.sub(r"[^a-z\s]", "", str(text or "").lower()).strip()
    return t in GENERIC_NON_ANSWERS


def _extract_number(raw: str) -> float | None:
    cleaned = str(raw or "").lower().replace(",", " ")
    m = re.search(r"[-+]?\d*\.?\d+", cleaned)
    if not m:
        # Fallback for spoken numbers and common STT homophones.
        units = {
            "zero": 0, "oh": 0,
            "one": 1, "won": 1,
            "two": 2, "to": 2, "too": 2, "cool": 2,
            "three": 3, "tree": 3, "free": 3, "study": 3,
            "four": 4, "for": 4, "fore": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8, "ate": 8,
            "nine": 9,
            "ten": 10,
            "eleven": 11,
            "twelve": 12,
            "thirteen": 13,
            "fourteen": 14,
            "fifteen": 15,
            "sixteen": 16,
            "seventeen": 17,
            "eighteen": 18,
            "nineteen": 19,
        }
        tens = {
            "twenty": 20,
            "thirty": 30,
            "forty": 40,
            "fifty": 50,
            "sixty": 60,
            "seventy": 70,
            "eighty": 80,
            "ninety": 90,
        }
        scales = {
            "hundred": 100,
            "thousand": 1000,
            "lakh": 100000,
            "million": 1000000,
            "crore": 10000000,
        }

        words = re.findall(r"[a-z]+", cleaned)
        if not words:
            return None

        current = 0
        total = 0
        seen_number_word = False

        for w in words:
            if w in units:
                current += units[w]
                seen_number_word = True
            elif w in tens:
                current += tens[w]
                seen_number_word = True
            elif w in scales:
                scale = scales[w]
                if current == 0:
                    # Allow standalone phrases like "thousand" to resolve to 1000.
                    current = 1
                if scale == 100:
                    current *= scale
                else:
                    total += current * scale
                    current = 0
                seen_number_word = True
            elif w in {"and", "point"}:
                continue

        if seen_number_word:
            return float(total + current)
        return None
    try:
        return float(m.group())
    except ValueError:
        return None


def _normalize_choice(raw: str, options: list[str]) -> str | None:
    lower = re.sub(r"[^a-z0-9\s]", "", raw.lower()).strip()
    for opt in options:
        o = re.sub(r"[^a-z0-9\s]", "", opt.lower()).strip()
        if lower == o or lower in o or o in lower:
            return opt
    return None


def _is_yes(raw: str) -> Optional[bool]:
    t = str(raw or "").strip().lower()
    # Normalize punctuation so "yes.", "no!" are handled.
    norm = re.sub(r"[^a-z\s]", " ", t)
    norm = re.sub(r"\s+", " ", norm).strip()

    yes = {"yes", "y", "yeah", "yep", "correct", "right", "true", "ok", "okay"}
    no = {"no", "n", "nope", "wrong", "false", "incorrect"}

    if norm in yes or any(f" {x} " in f" {norm} " for x in yes):
        return True
    if norm in no or any(f" {x} " in f" {norm} " for x in no):
        return False
    return None


class LandFarmSurveyEngine:
    """State-machine based guided survey for land-based farming financial planning."""

    linear_questions: list[Prompt] = [
        Prompt("farm_name", "What is the name of your farm or project?", "text", example="Green Valley Farm"),
        Prompt("farm_location", "Where is your farm located? Please mention city and state.", "text", example="Tumkur, Karnataka"),
        Prompt("land_area_sqm", "Enter total land area in square meters.", "number", example="5000"),
        Prompt("water_cost_month", "Monthly water cost in rupees (borewell/tanker/canal charges).", "number", example="1500"),
        Prompt("electricity_units_per_month", "Electricity usage per month in units (for pumps, motors, lighting).", "number", example="350"),
        Prompt("fertilizer_cost_month", "Monthly fertilizer cost in rupees (all types: urea, DAP, organic, etc.).", "number", example="3500"),
        Prompt("worker_count", "Number of workers.", "number", example="4"),
        Prompt("salary_per_worker_month", "Monthly salary per worker in rupees.", "number", example="12000"),
        Prompt("land_rent_month", "Monthly land rent in rupees. Say zero if owned.", "number", example="0"),
        Prompt("machines_cost_total", "Total machine cost in rupees.", "number", example="250000"),
        Prompt("setup_cost_total", "Initial farm setup cost in rupees.", "number", example="150000"),
        Prompt("seed_cost_per_cycle", "Cost of seeds per crop cycle in rupees.", "number", example="4500"),
        Prompt("electricity_cost_per_unit", "Electricity cost per unit in rupees.", "number", example="8"),
        Prompt("maintenance_cost_month", "Monthly maintenance cost in rupees.", "number", example="5000"),
        Prompt("post_harvest_spoilage_percent", "Estimated post-harvest spoilage percentage. Out of 100 kg harvested, how many kg usually get wasted before sale? Example answer: 8 (means 8%).", "number", example="8"),
        Prompt("seasonal_labor_cost_month", "Temporary seasonal labor cost per month in rupees.", "number", example="6000"),
        Prompt("pesticide_cost_month", "Pesticide cost per month in rupees.", "number", example="2500"),
        Prompt("fuel_cost_month", "Fuel cost per month in rupees.", "number", example="3500"),
        Prompt("transport_cost_month", "Transport cost to market per month in rupees.", "number", example="4000"),
        Prompt("farm_state", "State where the farm operates.", "text", example="Karnataka"),
        Prompt("farm_district", "District where the farm operates.", "text", example="Bengaluru Urban"),
        Prompt("market_name", "Primary mandi or market name. Say unknown if not sure.", "text", example="Yeshwanthpur"),
        Prompt("market_type", "Market type.", "select", options=["local", "mandi", "export"], example="mandi"),
        Prompt("demand_level", "Demand level.", "select", options=["low", "medium", "high"], example="high"),
    ]

    def init_context(self, validation_enabled: bool = True) -> dict[str, Any]:
        return {
            "module": "land_farm_voice",
            "answers": {},
            "crops": [],
            "collecting_crops": True,
            "awaiting_more_crops_decision": False,
            "current_crop_index": None,
            "crop_field": None,
            "pending_confirmation": None,
            "validation_enabled": bool(validation_enabled),
            "market_prices": {},
            "market_price_source": {},
            "warnings": [],
        }

    def get_current_prompt(self, context: dict[str, Any]) -> Prompt | None:
        pending = context.get("pending_confirmation")
        if pending:
            said = pending.get("display")
            return Prompt(
                id="confirm_current",
                text=f"You said {said}. Is that correct?",
                kind="confirm",
                options=["yes", "no"],
            )

        collecting = bool(context.get("collecting_crops", True))
        crops: list[dict[str, Any]] = context.get("crops", [])

        if "farm_name" not in context.get("answers", {}):
            return self.linear_questions[0]

        if collecting:
            idx = context.get("current_crop_index")
            field = context.get("crop_field")
            if idx is None:
                if context.get("awaiting_more_crops_decision"):
                    return Prompt(
                        id="add_another_crop",
                        text="Do you want to add another crop?",
                        kind="confirm",
                        options=["yes", "no"],
                    )
                return Prompt(
                    id="crop_name",
                    text="Tell crop name.",
                    kind="text",
                    example="tomato",
                )
            crop_name = crops[idx]["name"]
            if field == "cycles_per_year":
                return Prompt(
                    id=f"crop_cycles_{idx}",
                    text=f"For {crop_name}, how many times do you grow it in one year?",
                    kind="number",
                    example="3",
                )
            if field == "months_to_harvest":
                return Prompt(
                    id=f"crop_months_{idx}",
                    text=f"For {crop_name}, months from planting to harvest.",
                    kind="number",
                    example="4",
                )
            if field == "yield_kg_per_harvest":
                return Prompt(
                    id=f"crop_yield_{idx}",
                    text=f"For {crop_name}, expected total yield per harvest in kilograms.",
                    kind="number",
                    example="1200",
                )

        answers = context.get("answers", {})
        for q in self.linear_questions[1:]:
            if q.id not in answers:
                return q

        return None

    def parse_prompt_answer(self, prompt: Prompt, raw_answer: str) -> Any:
        raw = str(raw_answer or "").strip()
        if not raw:
            raise ValueError("I didn't catch that. Please say your answer clearly.")

        if prompt.kind == "confirm":
            yn = _is_yes(raw)
            if yn is None:
                raise ValueError("Please say 'yes' to confirm or 'no' to re-answer.")
            return yn

        if prompt.kind == "number":
            num = _extract_number(raw)
            if num is None:
                raise ValueError(
                    f"I heard '{raw}' but could not find a number. "
                    f"Please say just the number{' (e.g. ' + prompt.example + ')' if prompt.example else ''}."
                )
            if num < 0:
                raise ValueError("Please provide a non-negative number.")
            return num

        if prompt.kind == "select":
            matched = _normalize_choice(raw, prompt.options or [])
            if not matched:
                opts = ", ".join(prompt.options or [])
                raise ValueError(f"I heard '{raw}'. Please choose one of: {opts}.")
            return matched

        if prompt.id == "crop_name":
            # Validate that the cleaned name is meaningful
            cleaned = _clean_crop_name(raw)
            if not cleaned or len(cleaned) < 2:
                raise ValueError("I didn't catch the crop name. Please say a clear crop name like 'tomato' or 'wheat'.")
            return raw  # return raw; apply_confirmed_answer will clean it

        if _is_generic_non_answer(raw):
            raise ValueError("I could not capture a valid answer. Please say the value clearly.")

        if _word_count(raw) > SHORT_ANSWER_MAX_WORDS:
            raise ValueError("Please keep the answer short — a single word or short phrase.")
        return raw

    def apply_confirmed_answer(self, context: dict[str, Any], prompt: Prompt, parsed_value: Any) -> dict[str, Any]:
        context.setdefault("answers", {})
        context.setdefault("crops", [])

        if prompt.id == "add_another_crop":
            if bool(parsed_value):
                context["collecting_crops"] = True
                context["awaiting_more_crops_decision"] = False
                context["current_crop_index"] = None
                context["crop_field"] = None
            else:
                context["collecting_crops"] = False
                context["awaiting_more_crops_decision"] = False
                context["current_crop_index"] = None
                context["crop_field"] = None
            return context

        if prompt.id == "crop_name":
            # Open-ended crop capture: accept multiple crops in one short phrase.
            raw = str(parsed_value).strip().lower()
            chunks = re.split(r",|\band\b|\b&\b|/", raw)
            _STOPWORDS = {"crop", "crops", "and", "or", "done", "finish", "finished", "stop", "nothing", "none"}
            _seen_names: set[str] = set()
            parsed_names: list[str] = []
            for chunk in chunks:
                c = _clean_crop_name(chunk)
                if not c:
                    continue
                if c in _STOPWORDS:
                    continue
                # Reject implausibly long crop names and known non-crop phrases
                if len(c) > 40 or not _is_valid_crop_name(c):
                    continue
                # Deduplicate within this call
                if c in _seen_names:
                    continue
                _seen_names.add(c)
                parsed_names.append(c)

            if not parsed_names:
                raise ValueError("Please provide a crop name.")

            existing = {str(c.get("name", "")).strip().lower() for c in context["crops"]}
            new_names = [n for n in parsed_names if n not in existing]
            if not new_names:
                # If all already exist, continue with first existing crop missing fields.
                for idx, c in enumerate(context["crops"]):
                    if c.get("cycles_per_year") is None or c.get("months_to_harvest") is None or c.get("yield_kg_per_harvest") is None:
                        context["current_crop_index"] = idx
                        context["crop_field"] = "cycles_per_year"
                        context["awaiting_more_crops_decision"] = False
                        return context
                context["awaiting_more_crops_decision"] = True
                return context

            for name in new_names:
                context["crops"].append(
                    {
                        "name": name,
                        "cycles_per_year": None,
                        "months_to_harvest": None,
                        "yield_kg_per_harvest": None,
                        "price_per_kg": None,
                    }
                )

            # Ask follow-up for first newly added crop.
            first_new = new_names[0]
            context["current_crop_index"] = next(
                (i for i, c in enumerate(context["crops"]) if c.get("name") == first_new),
                len(context["crops"]) - 1,
            )
            context["crop_field"] = "cycles_per_year"
            context["awaiting_more_crops_decision"] = False
            return context

        if prompt.id.startswith("crop_cycles_"):
            idx = int(prompt.id.split("_")[-1])
            context["crops"][idx]["cycles_per_year"] = max(0, int(parsed_value))
            context["crop_field"] = "months_to_harvest"
            return context

        if prompt.id.startswith("crop_months_"):
            idx = int(prompt.id.split("_")[-1])
            context["crops"][idx]["months_to_harvest"] = max(0, int(parsed_value))
            context["crop_field"] = "yield_kg_per_harvest"
            return context

        if prompt.id.startswith("crop_yield_"):
            idx = int(prompt.id.split("_")[-1])
            context["crops"][idx]["yield_kg_per_harvest"] = max(0.0, float(parsed_value))
            context["current_crop_index"] = None
            context["crop_field"] = None
            context["awaiting_more_crops_decision"] = True
            return context

        if prompt.id.startswith("crop_price_"):
            idx = int(prompt.id.split("_")[-1])
            context["crops"][idx]["price_per_kg"] = max(0.0, float(parsed_value))
            return context

        context["answers"][prompt.id] = parsed_value
        return context


engine = LandFarmSurveyEngine()
