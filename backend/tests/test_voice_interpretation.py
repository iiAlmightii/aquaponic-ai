import os

import pytest

from services.voice_interpretation import (
    extract_farm_name_candidates,
    interpret_transcript,
    post_process_transcript,
)


def test_post_process_transcript_removes_fillers():
    text = "um, Green Ridge Pilot Farm"
    cleaned = post_process_transcript(text)
    assert "Green Ridge Pilot Farm" in cleaned
    assert "um" not in cleaned.lower()


def test_extract_farm_name_basic_title_case():
    interp = extract_farm_name_candidates("Green Ridge Pilot Farm")
    assert interp.best == "Green Ridge Pilot Farm"
    assert interp.confidence > 0.6


def test_extract_farm_name_with_prefix_phrase():
    interp = extract_farm_name_candidates("the name is Green Ridge Pilot Farm")
    assert interp.best == "Green Ridge Pilot Farm"


def test_extract_farm_name_with_noise_words_and_lowercase():
    interp = extract_farm_name_candidates("um green ridge pilot farm thank you")
    assert interp.best == "Green Ridge Pilot Farm"


def test_interpret_transcript_sets_needs_confirmation_for_low_stt_confidence(monkeypatch):
    monkeypatch.setenv("FARM_NAME_ENTITY_CONF_THRESHOLD", "0.65")
    monkeypatch.setenv("FARM_NAME_STT_CONF_THRESHOLD", "0.45")

    res = interpret_transcript("farm_name", "Green Ridge Pilot Farm", stt_confidence=0.2)
    assert res["farm_name"]["needs_confirmation"] is True


def test_interpret_transcript_no_confirmation_for_high_stt_confidence(monkeypatch):
    monkeypatch.setenv("FARM_NAME_ENTITY_CONF_THRESHOLD", "0.65")
    monkeypatch.setenv("FARM_NAME_STT_CONF_THRESHOLD", "0.45")

    res = interpret_transcript("farm_name", "Green Ridge Pilot Farm", stt_confidence=0.95)
    assert res["farm_name"]["needs_confirmation"] is False

