FROM python:3.11-slim-bookworm

WORKDIR /app

# Установка системных зависимостей для Docling
# Отключаем CDN-кеш apt чтобы получать актуальные пакеты без hash-mismatch
RUN printf 'Acquire::http::No-Cache "true";\nAcquire::http::Pipeline-Depth "0";\nAcquire::Retries "5";\n' \
      > /etc/apt/apt.conf.d/99no-cache
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    tesseract-ocr \
    tesseract-ocr-eng \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=300 --retries=10 \
    --trusted-host pypi.org \
    --trusted-host pypi.python.org \
    --trusted-host files.pythonhosted.org \
    -r requirements.txt

# NOTE: .env is intentionally NOT copied into the image — secrets (JWT key, DB
# passwords) must come from the runtime environment (docker-compose), never be
# baked into image layers.
COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "1800"]
