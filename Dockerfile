# ==============================================================================
# Stage 1: Build Frontend Assets with Node
# ==============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies using package-lock.json for reproducible builds
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy frontend source and build production bundle
COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Build Python Backend Image and Serve Frontend Static Files
# ==============================================================================
FROM python:3.11-slim AS runtime

# Set environment variables for Python runtime and static file paths
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/frontend/dist

WORKDIR /app

# Install Python backend dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application source code
COPY backend/ /app/backend/

# Copy built frontend static bundle from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose backend service port
EXPOSE 8000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start the unified backend server serving both API and frontend
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
