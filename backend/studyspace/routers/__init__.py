"""API routers.

Each router is imported on demand by ``main.py``, which is the single registry
of what the app serves. This module deliberately does *not* re-import them.

The previous version of this file eagerly imported every router into
``__init__``, which cost more than it looked:

* importing one router meant importing all of them, so a single missing package
  anywhere in the graph — litellm, langgraph, the Redis job queue — took every
  router down with it, including ones being unit-tested in isolation.
* it kept a second list to keep in sync with ``main.py``. Add a router, forget
  one of the two, and the app still starts while the import in a test fails.

Do not add eager imports here.
"""
