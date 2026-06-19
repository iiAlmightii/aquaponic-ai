"""
farm_link_service.py — Links a completed session to a Farm record.

Called at session completion for both aquaponic and land surveys.
Deduplicates by (owner_id, LOWER(name)).
"""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Farm, Session


async def link_session_to_farm(
    sess: Session,
    context: dict,
    user_id: str,
    db: AsyncSession,
) -> Farm:
    """
    Find or create a Farm matching the farm_name in context answers,
    then set sess.farm_id.

    Mutates sess.farm_id in place. Caller must flush/commit.
    Returns the Farm record (existing or newly created).
    """
    answers = context.get("answers") or {}
    farm_name = str(answers.get("farm_name") or "Untitled Project").strip() or "Untitled Project"

    result = await db.execute(
        select(Farm).where(
            Farm.owner_id == user_id,
            func.lower(Farm.name) == farm_name.lower(),
        ).limit(1)
    )
    farm = result.scalar_one_or_none()

    if not farm:
        farm = Farm(
            owner_id=user_id,
            name=farm_name,
            location=str(answers.get("farm_location") or "").strip(),
            system_type=str(answers.get("system_type") or "aquaponics").strip() or "aquaponics",
            description="Auto-created from completed survey",
        )
        db.add(farm)
        await db.flush()

    sess.farm_id = farm.id
    return farm
