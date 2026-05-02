# Oz Python code sandbox (run_python / future make_* in-container). Base and packages
# per P3-1 / docs §6.3 — Plotly is intentionally not installed in v1.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /opt/oz-sandbox

COPY requirements.txt .
RUN pip install -r requirements.txt

# Smoke-import heavier stacks at build time so a broken install fails CI early.
RUN python -c "import numpy, pandas, openpyxl, docx, reportlab, matplotlib, PIL"

CMD ["python", "-c", "print('oz-sandbox image OK')"]
