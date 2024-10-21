# Use a Python base image
FROM python:3.10-slim

# Set the working directory
WORKDIR /usr/src/app

# Copy requirements.txt and install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install psycopg2-binary

# Copy the rest of your worker files
COPY . .




# Command to run your Python worker
CMD ["python", "worker.py"]
