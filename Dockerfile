# Use the official Python 3.13 slim image
FROM python:3.13-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package installer and resolver)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set the working directory
WORKDIR /app

# Increase uv network timeout for large packages
ENV UV_HTTP_TIMEOUT=300

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies using uv sync
ENV UV_HTTP_TIMEOUT=300
RUN uv sync --frozen --no-dev

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application using uv and uvicorn
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
