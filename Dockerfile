# Stage 1: Builder
# This stage installs all build-time dependencies and compiles the Python packages.
FROM python:3.10-slim as builder

# Set environment variables to prevent interactive prompts during build
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install OS-level dependencies needed for building face_recognition and other libraries
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

# Copy only the requirements file to leverage Docker's layer caching
COPY ./requirements.txt .

# Install python dependencies into a wheelhouse
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# Stage 2: Final Production Image
# This stage is smaller because it doesn't include the build tools from Stage 1.
FROM python:3.10-slim

WORKDIR /code

# Install the runtime OS-level dependencies required by dlib and face_recognition
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas-dev \
    liblapack-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built Python packages from the builder stage
COPY --from=builder /wheels /wheels

# Install the packages from the wheelhouse
RUN pip install --no-cache /wheels/*

# Copy the application code
COPY ./app ./app
COPY ./uploads ./uploads

# Expose the port the app runs on and run the application
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]