FROM python:3.12-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ensure ctranslate2/faster-whisper can find CUDA runtime libs installed via pip.
ENV LD_LIBRARY_PATH="/usr/local/lib/python3.12/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.12/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.12/site-packages/nvidia/cuda_runtime/lib:/usr/local/lib/python3.12/site-packages/nvidia/cuda_nvrtc/lib"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 600 -r requirements.txt

# Optional large dependency - disabled for now (causes network timeouts)
# To enable Whisper: change INSTALL_WHISPER=false to true and rebuild
ARG INSTALL_WHISPER=false
RUN if [ "$INSTALL_WHISPER" = "true" ]; then pip install --no-cache-dir --retries 10 --timeout 600 openai-whisper==20231117; fi

# Copy application
COPY . .

# Non-root user
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
