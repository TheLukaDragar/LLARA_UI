FROM python:3.9-slim

WORKDIR /app

# Install system dependencies more efficiently
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create directory for Classla resources
RUN mkdir -p /root/classla_resources

COPY . .

# Performance optimizations - maximum threads
ENV PYTHONUNBUFFERED=1
ENV NUMBA_CACHE_DIR=/tmp/numba_cache
ENV OMP_NUM_THREADS=8
ENV MKL_NUM_THREADS=8
ENV OPENBLAS_NUM_THREADS=8
ENV VECLIB_MAXIMUM_THREADS=8

CMD ["celery", "-A", "tasks", "worker", "--loglevel=debug", "--concurrency=1", "--pool=prefork"] 