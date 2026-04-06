"""
services/questionnaire_engine.py — Dynamic, context-aware questionnaire for aquaponic farms.

Drives the voice/text survey pipeline:
  1. Returns the next question given current session state.
  2. Validates and parses answers.
  3. Updates session context.
  4. Detects completion.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)

INDIA_STATES_UT = {
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat",
    "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh",
    "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "punjab",
    "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh",
    "uttarakhand", "west bengal", "andaman and nicobar islands", "chandigarh",
    "dadra and nagar haveli and daman and diu", "delhi", "jammu and kashmir", "ladakh",
    "lakshadweep", "puducherry",
}


class QuestionType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    SELECT = "select"
    MULTISELECT = "multiselect"
    BOOLEAN = "boolean"
    DATE = "date"


@dataclass
class Question:
    id: str
    text: str
    type: QuestionType
    options: list[str] = field(default_factory=list)    # for select / multiselect
    unit: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    required: bool = True
    hint: str = ""
    follow_up_condition: Optional[dict] = None          # {"if": "answer == 'yes'", "then": "question_id"}
    category: str = "general"


# ── Master Question Bank ──────────────────────────────────────────────────────

QUESTION_BANK: list[Question] = [
    # ── Farm Setup ────────────────────────────────────────────────────────────
    Question(
        id="farm_name",
        text="What is the name of your farm or project?",
        type=QuestionType.TEXT,
        category="setup",
        hint="E.g. 'Green Valley Aquaponics'",
    ),
    Question(
        id="farm_location",
        text="Where is your farm located? (City, State)",
        type=QuestionType.TEXT,
        category="setup",
    ),
    Question(
        id="farm_area_sqm",
        text="What is the total area of your aquaponic system in square metres?",
        type=QuestionType.NUMBER,
        unit="m²",
        min_value=1,
        max_value=100000,
        category="setup",
    ),
    Question(
        id="experience_level",
        text="How would you describe your experience with aquaponics?",
        type=QuestionType.SELECT,
        options=["Beginner (0–1 year)", "Intermediate (1–3 years)", "Advanced (3–5 years)", "Expert (5+ years)"],
        category="setup",
    ),
    Question(
        id="system_type",
        text="What type of aquaponic system are you running?",
        type=QuestionType.SELECT,
        options=["Media Bed", "Nutrient Film Technique (NFT)", "Deep Water Culture (DWC / Raft)", "Hybrid"],
        category="setup",
    ),

    # ── Fish Data ─────────────────────────────────────────────────────────────
    Question(
        id="fish_species",
        text="Which fish species are you cultivating?",
        type=QuestionType.MULTISELECT,
        options=["Tilapia", "Catfish", "Trout", "Carp", "Barramundi", "Perch", "Salmon", "Other"],
        category="fish",
    ),
    Question(
        id="fish_count",
        text="How many fish are currently in your system?",
        type=QuestionType.NUMBER,
        unit="fish",
        min_value=1,
        category="fish",
    ),
    Question(
        id="tank_volume",
        text="What is the total volume of your fish tank(s)?",
        type=QuestionType.NUMBER,
        unit="litres",
        min_value=100,
        category="fish",
    ),
    Question(
        id="avg_fish_weight",
        text="What is the current average weight of your fish?",
        type=QuestionType.NUMBER,
        unit="kg",
        min_value=0.01,
        max_value=50,
        category="fish",
    ),
    Question(
        id="feed_kg_per_day",
        text="How much feed do you provide per day?",
        type=QuestionType.NUMBER,
        unit="kg/day",
        min_value=0.01,
        category="fish",
    ),
    Question(
        id="harvest_cycle_weeks",
        text="What is your expected harvest cycle for fish?",
        type=QuestionType.NUMBER,
        unit="weeks",
        min_value=4,
        max_value=104,
        category="fish",
    ),

    # ── Crop Data ─────────────────────────────────────────────────────────────
    Question(
        id="crop_types",
        text="What crops are you growing in your system?",
        type=QuestionType.MULTISELECT,
        options=["Lettuce", "Basil", "Spinach", "Tomatoes", "Cucumber", "Herbs", "Microgreens", "Other"],
        category="crops",
    ),
    Question(
        id="crop_area_sqm",
        text="What area is dedicated to crop production?",
        type=QuestionType.NUMBER,
        unit="m²",
        min_value=1,
        category="crops",
    ),
    Question(
        id="expected_yield_kg_monthly",
        text="What is your expected monthly crop yield?",
        type=QuestionType.NUMBER,
        unit="kg/month",
        min_value=0.1,
        category="crops",
    ),

    # ── Water Quality ─────────────────────────────────────────────────────────
    Question(
        id="has_iot_sensors",
        text="Do you have automated IoT water quality sensors installed?",
        type=QuestionType.BOOLEAN,
        category="water",
    ),
    Question(
        id="water_ph",
        text="What is your typical water pH level?",
        type=QuestionType.NUMBER,
        unit="pH",
        min_value=4.0,
        max_value=10.0,
        category="water",
        follow_up_condition={"if": "has_iot_sensors == false"},
    ),
    Question(
        id="water_temp_c",
        text="What is the typical water temperature in your system?",
        type=QuestionType.NUMBER,
        unit="°C",
        min_value=5.0,
        max_value=40.0,
        category="water",
    ),

    # ── Financial Inputs ──────────────────────────────────────────────────────
    Question(
        id="infrastructure_cost",
        text="What was your total infrastructure investment (tanks, pipes, grow beds)?",
        type=QuestionType.NUMBER,
        unit="₹",
        min_value=0,
        category="financial",
    ),
    Question(
        id="equipment_cost",
        text="What was the cost of equipment (pumps, lights, sensors, aerators)?",
        type=QuestionType.NUMBER,
        unit="₹",
        min_value=0,
        category="financial",
    ),
    Question(
        id="initial_stock_cost",
        text="What did you spend on initial fish fingerlings and plant seedlings?",
        type=QuestionType.NUMBER,
        unit="₹",
        min_value=0,
        category="financial",
    ),
    Question(
        id="monthly_feed_cost",
        text="What is your monthly fish feed expenditure?",
        type=QuestionType.NUMBER,
        unit="₹/month",
        min_value=0,
        category="financial",
    ),
    Question(
        id="monthly_labor_cost",
        text="What is your monthly labour cost (salaries, wages)?",
        type=QuestionType.NUMBER,
        unit="₹/month",
        min_value=0,
        category="financial",
    ),
    Question(
        id="monthly_utilities_cost",
        text="What are your monthly utility costs (electricity, water)?",
        type=QuestionType.NUMBER,
        unit="₹/month",
        min_value=0,
        category="financial",
    ),
    Question(
        id="monthly_fish_revenue",
        text="What is your expected monthly revenue from fish sales?",
        type=QuestionType.NUMBER,
        unit="₹/month",
        min_value=0,
        category="financial",
    ),
    Question(
        id="monthly_crop_revenue",
        text="What is your expected monthly revenue from crop sales?",
        type=QuestionType.NUMBER,
        unit="₹/month",
        min_value=0,
        category="financial",
    ),
    Question(
        id="planning_horizon",
        text="Over how many months would you like the financial plan to project?",
        type=QuestionType.SELECT,
        options=["6 months", "12 months", "24 months", "36 months", "60 months"],
        category="financial",
    ),

    # ── Goals ─────────────────────────────────────────────────────────────────
    Question(
        id="primary_goal",
        text="What is your primary goal for this aquaponic operation?",
        type=QuestionType.SELECT,
        options=["Maximize profit", "Sustainable food production", "Community / education", "Export market"],
        category="goals",
    ),
    Question(
        id="biggest_challenge",
        text="What is your biggest operational challenge right now?",
        type=QuestionType.SELECT,
        options=["Water quality management", "High feed costs", "Market access", "Labour", "Financing", "Technical knowledge"],
        category="goals",
    ),
]

QUESTION_INDEX: dict[str, Question] = {q.id: q for q in QUESTION_BANK}


# ── Engine ────────────────────────────────────────────────────────────────────

class QuestionnaireEngine:
    """
    Stateless engine — all state lives in the session context passed in.
    """

    def __init__(self, questions: list[Question] = QUESTION_BANK):
        self.questions = questions

    def get_next_question(self, context: dict[str, Any]) -> Optional[Question]:
        """Return the next unanswered question, respecting skip conditions."""
        answered_ids = set(context.get("answered", []))

        for q in self.questions:
            if q.id in answered_ids:
                continue
            # Skip if follow-up condition says so
            if q.follow_up_condition:
                condition = q.follow_up_condition.get("if", "")
                if not self._eval_condition(condition, context):
                    answered_ids.add(q.id)  # skip silently
                    continue
            return q
        return None  # all done

    def parse_answer(self, question: Question, raw_answer: str) -> Any:
        """
        Parse and validate raw text answer into the appropriate Python type.
        Raises ValueError on invalid input.
        """
        raw = raw_answer.strip()

        if question.type == QuestionType.NUMBER:
            value = self._extract_number(raw)
            if value is None:
                raise ValueError(f"Could not extract a number from: '{raw}'")

            # Unit-aware normalization for voice/text phrasing.
            value = self._normalize_number_units(question, value, raw)

            if question.min_value is not None and value < question.min_value:
                raise ValueError(f"Value {value} is below minimum {question.min_value}.")
            if question.max_value is not None and value > question.max_value:
                raise ValueError(f"Value {value} exceeds maximum {question.max_value}.")
            return value

        if question.type == QuestionType.BOOLEAN:
            positive = {"yes", "true", "1", "yeah", "yep", "correct", "affirmative"}
            negative = {"no", "false", "0", "nope", "nah", "negative"}
            lower = raw.lower()
            if any(p in lower for p in positive):
                return True
            if any(n in lower for n in negative):
                return False
            raise ValueError(f"Cannot determine yes/no from: '{raw}'")

        if question.type == QuestionType.SELECT:
            # Fuzzy match against options
            lower = re.sub(r'[^a-z0-9\s]', '', raw.lower())
            for opt in question.options:
                opt_lower = re.sub(r'[^a-z0-9\s]', '', opt.lower())
                if opt_lower in lower or lower in opt_lower:
                    return opt
            raise ValueError(f"Answer '{raw}' does not match any option: {question.options}")

        if question.type == QuestionType.MULTISELECT:
            matched = []
            lower = re.sub(r'[^a-z0-9\s]', '', raw.lower())
            for opt in question.options:
                opt_lower = re.sub(r'[^a-z0-9\s]', '', opt.lower())
                if opt_lower in lower:
                    matched.append(opt)
            return matched if matched else [raw]

        if question.id == "farm_location":
            return self._parse_india_city_state(raw)

        return raw  # TEXT / DATE — return as-is

    def record_answer(self, context: dict[str, Any], question: Question, parsed_value: Any) -> dict[str, Any]:
        """Update session context with the newly answered question."""
        context.setdefault("answered", [])
        context.setdefault("answers", {})
        if question.id not in context["answered"]:
            context["answered"].append(question.id)
        context["answers"][question.id] = parsed_value
        return context

    def is_complete(self, context: dict[str, Any]) -> bool:
        return self.get_next_question(context) is None

    def progress(self, context: dict[str, Any]) -> tuple[int, int]:
        """Returns (answered_count, total_applicable_questions)."""
        answered = len(context.get("answered", []))
        total = len(self.questions)
        return answered, total

    @staticmethod
    def _eval_condition(condition: str, context: dict) -> bool:
        """Minimal safe condition evaluator for skip logic."""
        try:
            # Only support: "key == 'value'" or "key == false"
            match = re.match(r"(\w+)\s*==\s*(.+)", condition)
            if not match:
                return True
            key, expected = match.group(1), match.group(2).strip().strip("'\"")
            actual = context.get("answers", {}).get(key)
            if expected.lower() == "false":
                return actual is False or actual == "false" or actual == "no"
            if expected.lower() == "true":
                return actual is True or actual == "true" or actual == "yes"
            return str(actual).lower() == expected.lower()
        except Exception:
            return True

    @staticmethod
    def _extract_number(raw: str) -> float | None:
        """Extract a numeric value from free-form text (digits first, words second)."""
        cleaned = raw.strip().lower().replace(",", "")

        # Primary path: direct digits in text, e.g. "small set of 50 square metres".
        digit_match = re.search(r"[-+]?\d*\.?\d+", cleaned)
        if digit_match:
            try:
                return float(digit_match.group())
            except ValueError:
                pass

        # Fallback path: basic spoken-number words (e.g. "fifty", "one hundred twenty").
        units = {
            "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
            "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
        }
        tens = {
            "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
            "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
        }
        scales = {
            "hundred": 100,
            "thousand": 1000,
            "lakh": 100000,
            "million": 1000000,
            "crore": 10000000,
        }

        tokens = re.findall(r"[a-z]+", cleaned)
        current = 0
        total = 0
        seen_number_word = False

        for token in tokens:
            if token in units:
                current += units[token]
                seen_number_word = True
            elif token in tens:
                current += tens[token]
                seen_number_word = True
            elif token == "and":
                continue
            elif token in scales:
                scale = scales[token]
                if current == 0:
                    current = 1
                if scale == 100:
                    current *= scale
                else:
                    total += current * scale
                    current = 0
                seen_number_word = True

        if seen_number_word:
            return float(total + current)

        return None

    @staticmethod
    def _normalize_number_units(question: Question, value: float, raw: str) -> float:
        """Normalize common spoken units into the expected question unit."""
        unit = (question.unit or "").lower()
        text = raw.lower()

        # For kg questions, users often answer in grams (e.g. "300 grams each").
        if unit.startswith("kg"):
            has_kg = re.search(r"\bkg\b|\bkilograms?\b", text) is not None
            has_grams = re.search(
                r"\bgrams?\b|\bgm\b|\b\d+(?:\.\d+)?\s*g\b|\d+(?:\.\d+)?g\b",
                text,
            ) is not None
            if has_grams and not has_kg:
                return value / 1000.0

        return value

    @staticmethod
    def _parse_india_city_state(raw: str) -> str:
        """Validate location as 'City, State' for India and return normalized text."""
        normalized = " ".join((raw or "").strip().split())
        if not normalized:
            raise ValueError("Please provide location in 'City, State' format (India).")

        # Strip common conversational prefixes from voice input.
        normalized = re.sub(
            r"^(i am|i'm|we are|we're|currently|presently|based|located|from|my farm is|our farm is)\b",
            "",
            normalized,
            flags=re.IGNORECASE,
        ).strip(" ,.-")
        normalized = re.sub(r"^(in|at)\s+", "", normalized, flags=re.IGNORECASE)

        city = ""
        state = ""

        if "," in normalized:
            city, state = [part.strip() for part in normalized.split(",", 1)]
        else:
            # Spoken input often omits the comma: "Bangalore Karnataka".
            lowered = re.sub(r"\s+", " ", normalized.lower()).strip()
            match_state = None
            for st in sorted(INDIA_STATES_UT, key=len, reverse=True):
                if lowered.endswith(f" {st}") or lowered == st:
                    match_state = st
                    break
            if match_state:
                state = match_state
                city_part = lowered[: -len(match_state)].strip(" ,.-")
                city = re.sub(r"^(in|at|from|located in|based in)\s+", "", city_part, flags=re.IGNORECASE).strip()

        if len(city) < 2 or len(state) < 2:
            raise ValueError("City and state are both required, e.g. 'Bengaluru, Karnataka'.")

        city_ok = re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,79}", city) is not None
        state_clean = re.sub(r"\s+", " ", state.lower()).strip()
        state_ok = state_clean in INDIA_STATES_UT

        if not city_ok or not state_ok:
            raise ValueError(
                "Please provide a valid India location in 'City, State' format, e.g. 'Mumbai, Maharashtra'."
            )

        return f"{city}, {state.title()}"


# Singleton instance
engine = QuestionnaireEngine()
