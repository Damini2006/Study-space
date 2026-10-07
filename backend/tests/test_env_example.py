"""config.py and .env.example are two views of the same list of knobs.

Settings declares every environment variable the app reads; .env.example
is the only view a human reads when wiring a deployment. Each view drifts
on its own — a setting added and never documented, or a knob documented
after its setting was renamed away — so both directions are asserted.
ENV itself used to be exactly the first kind of drift: the docs gate
existed, and no file on disk said the variable's name.
"""

import re
from pathlib import Path

from studyspace.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"
KEY_LINE = re.compile(r"^([A-Z][A-Z0-9_]*)=", re.MULTILINE)
# Frontend build vars are declared in vite.config.js, not pydantic.
FRONTEND_PREFIX = "VITE_"


def _documented() -> set[str]:
    return set(KEY_LINE.findall(ENV_EXAMPLE.read_text(encoding="utf-8")))


def _declared() -> set[str]:
    return {name.upper() for name in Settings.model_fields}


def test_every_setting_has_a_line_in_env_example() -> None:
    missing = sorted(_declared() - _documented())
    assert not missing, f"settings with no .env.example line: {missing}"


def test_env_example_documents_no_setting_that_no_longer_exists() -> None:
    stale = sorted(key for key in _documented() - _declared()
                   if not key.startswith(FRONTEND_PREFIX))
    assert not stale, f".env.example documents settings that do not exist: {stale}"
