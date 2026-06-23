FROM python:3.12-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# INSTALL_WHISPER=true  → full requirements (faster-whisper + NVIDIA CUDA libs, needs GPU)
# INSTALL_WHISPER=false → light requirements (Sarvam STT via API, no GPU needed, <512MB RAM)
ARG INSTALL_WHISPER=false

COPY requirements.txt requirements-render.txt ./

RUN if [ "$INSTALL_WHISPER" = "true" ]; then \
      pip install --no-cache-dir --retries 10 --timeout 600 -r requirements.txt; \
    else \
      pip install --no-cache-dir --retries 10 --timeout 600 -r requirements-render.txt; \
    fi

# Only set CUDA paths when Whisper is installed
RUN if [ "$INSTALL_WHISPER" = "true" ]; then \
      echo 'export LD_LIBRARY_PATH="/usr/local/lib/python3.12/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.12/site-packages/nvidia/cudnn/lib"' >> /etc/environment; \
    fi

# Copy application
COPY . .

# Non-root user
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
