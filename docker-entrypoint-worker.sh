#!/bin/bash
set -e

echo "Starting Document Extract Worker..."
echo "Environment: $(env | grep -E 'AZURE|COSMOS|STORAGE|SERVICE_BUS|OPENAI' | head -5)..."

# Create a heartbeat file to indicate the worker is alive
touch /tmp/worker_alive

# Run the worker with heartbeat updates
while true; do
    python -u document_extract/__init__.py &
    WORKER_PID=$!
    
    # Update heartbeat every 30 seconds
    while kill -0 $WORKER_PID 2>/dev/null; do
        touch /tmp/worker_alive
        sleep 30
    done
    
    # Worker exited, restart it after a delay
    echo "Worker process exited with code $?"
    sleep 5
done
