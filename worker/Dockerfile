# StudySpace Worker Dockerfile
#
# Built from the REPO ROOT, never from ./worker:
#   docker build -f worker/Dockerfile .
# The jobs import studyspace.* (config, db_service, services, security), so
# the backend package must be in the image — a ./worker-only build context
# cannot reach it, and the container died at import before this file
# changed. CI and docker-compose both pass the root context.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Root context: backend/ and worker/ land side by side so pip can install
# both projects (the root .dockerignore keeps .venv/.git/.env out).
COPY backend ./backend
COPY worker/pyproject.toml ./worker/
COPY worker/studyspace_worker ./worker/studyspace_worker
RUN pip install --upgrade pip && pip install ./backend ./worker

CMD ["arq", "studyspace_worker.main.WorkerSettings"]
