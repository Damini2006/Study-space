"""The golden eval dataset — one copy, inside the package.

It used to live at the repo root (`evals/dataset/`) and the route reached
it by walking three parents up from its own file, which works in a dev
checkout and resolves to nothing in any image: the backend build COPYs
`studyspace/` only, and the worker (which will run the evals job) installs
the package the same way. Keeping the file under `studyspace/data/` means
every process that can import this package can also read the dataset, and
the path is derived from `__file__` instead of the checkout layout.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATASET_FILENAME = "golden_dataset.json"


def dataset_path() -> Path:
    """Absolute path of the golden dataset (moves with the package)."""
    return Path(__file__).resolve().parents[1] / "data" / DATASET_FILENAME


def load_dataset() -> dict[str, Any]:
    """Parse the dataset document: {version, description, questions}.

    Raises FileNotFoundError if the file is absent (callers decide what
    that means for them) and ValueError if it exists but is not the
    document shape every consumer assumes.
    """
    data = json.loads(dataset_path().read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
        raise ValueError(f"golden dataset at {dataset_path()} is not a document with a questions list")
    return data


__all__ = ["DATASET_FILENAME", "dataset_path", "load_dataset"]
