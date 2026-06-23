from services.land_farm_survey_engine import LandFarmSurveyEngine, Prompt, _extract_number


def test_extract_number_handles_standalone_thousand_word() -> None:
    assert _extract_number("thousand") == 1000.0


def test_extract_number_handles_compound_scale_words() -> None:
    assert _extract_number("twenty three thousand") == 23000.0


def test_parse_prompt_answer_accepts_spoken_scale_word_numbers() -> None:
    engine = LandFarmSurveyEngine()
    prompt = Prompt(id="water_cost_month", text="Monthly water cost", kind="number", example="1500")
    assert engine.parse_prompt_answer(prompt, "thousand") == 1000.0
