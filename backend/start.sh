#!/bin/bash
# Start interview agent in background
python interview_agent.py start &
AGENT_PID=$!
echo "Interview agent started (PID: $AGENT_PID)"

# Start FastAPI server in foreground
uvicorn main:app --host 0.0.0.0 --port $PORT