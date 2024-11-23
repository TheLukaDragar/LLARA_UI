FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories and set permissions
RUN mkdir -p /app/data && \
    mkdir -p /root/stanza_resources && \
    chmod 777 /app/data && \
    chmod 777 /root/stanza_resources

COPY ./app ./app
COPY .env .env

RUN mkdir -p /root/classla_resources

# Change the CMD to use reload mode
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"] 