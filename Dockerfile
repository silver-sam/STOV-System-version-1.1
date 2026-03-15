FROM python:3.10-slim

WORKDIR /code

# Install postgres dependencies
RUN apt-get update && apt-get install -y libpq-dev gcc \
    cmake build-essential \
    libjpeg-dev zlib1g-dev libglib2.0-0 libgl1

COPY requirements.txt .
RUN pip install --upgrade pip setuptools==68.2.2 wheel
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
