import pytest
from unittest.mock import AsyncMock, MagicMock
from services.farm_link_service import link_session_to_farm


def _make_sess(farm_id=None):
    sess = MagicMock()
    sess.farm_id = farm_id
    return sess


def _make_context(farm_name="Test Farm", extra=None):
    ctx = {"answers": {"farm_name": farm_name, "farm_location": "Bengaluru", "system_type": "aquaponics"}}
    if extra:
        ctx.update(extra)
    return ctx


@pytest.mark.asyncio
async def test_creates_new_farm_when_none_exists():
    """Should insert a new Farm and set sess.farm_id."""
    sess = _make_sess()
    context = _make_context("Brand New Farm")
    db = AsyncMock()

    # Simulate no existing farm found
    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=no_result)
    db.flush = AsyncMock()

    result = await link_session_to_farm(sess, context, "user-1", db)

    # Verify db.add was called
    db.add.assert_called_once()
    added_farm = db.add.call_args[0][0]

    # Verify the farm was created with correct attributes
    assert added_farm.owner_id == "user-1"
    assert added_farm.name == "Brand New Farm"
    assert added_farm.location == "Bengaluru"
    assert added_farm.system_type == "aquaponics"

    db.flush.assert_called()
    assert sess.farm_id == added_farm.id
    assert result == added_farm


@pytest.mark.asyncio
async def test_links_to_existing_farm_case_insensitive():
    """Should find 'test farm' when existing Farm.name = 'Test Farm'."""
    sess = _make_sess()
    context = _make_context("test farm")  # lowercase — should still match
    db = AsyncMock()

    existing_farm = MagicMock()
    existing_farm.id = "farm-existing"

    found_result = MagicMock()
    found_result.scalar_one_or_none.return_value = existing_farm
    db.execute = AsyncMock(return_value=found_result)

    result = await link_session_to_farm(sess, context, "user-1", db)

    db.add.assert_not_called()
    assert sess.farm_id == "farm-existing"
    assert result == existing_farm


@pytest.mark.asyncio
async def test_uses_untitled_project_when_name_missing():
    """Should fall back to 'Untitled Project' when farm_name is absent."""
    sess = _make_sess()
    context = {"answers": {}}
    db = AsyncMock()

    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=no_result)
    db.flush = AsyncMock()

    await link_session_to_farm(sess, context, "user-1", db)

    # Verify db.add was called
    db.add.assert_called_once()
    added_farm = db.add.call_args[0][0]

    # Verify the farm was created with "Untitled Project" name
    assert added_farm.name == "Untitled Project"
