FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy inference script and model (model file should be placed manually)
COPY predict.py ./
COPY assam_landslide_xgb_model.json ./

# Default command (override with arguments as needed)
ENTRYPOINT ["python", "predict.py"]
