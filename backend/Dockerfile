# StudySpace Backend Dockerfile

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# The image's own default is the word that gates behavior: Settings.env
# turns the generated API reference (/docs, /openapi.json) off, and a
# shipped container still saying "development" would serve it. This is
# the only setting env drives today, but it is the one a deployment
# must not get wrong. Override with -e ENV=development to inspect a
# running container — docker-compose already does.
ENV ENV=production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e ".[dev]"

COPY studyspace ./studyspace

EXPOSE 8000

# Liveness only. The probe deliberately hits /api/health — static, no
# database — because a container that restarts on a database blip turns
# one outage into two. Whoever routes traffic and wants the truth asks
# /api/health/ready. (python is the shell-less way to fetch inside
# python:3.11-slim; a refused connection raises, which exits non-zero.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import sys, urllib.request as u; sys.exit(0 if u.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status == 200 else 1)"

# --no-access-log: the app writes its own request line — method, path,
# status, duration, request id — via studyspace.request_log. Two logs per
# request means twice the noise and half the clarity.
CMD ["uvicorn", "studyspace.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]