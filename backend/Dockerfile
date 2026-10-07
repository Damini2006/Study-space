# StudySpace Backend Dockerfile

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e ".[dev]"

COPY studyspace ./studyspace

EXPOSE 8000

# --no-access-log: the app writes its own request line — method, path,
# status, duration, request id — via studyspace.request_log. Two logs per
# request means twice the noise and half the clarity.
CMD ["uvicorn", "studyspace.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]