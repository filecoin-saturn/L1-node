#!/bin/bash

echo "[container] starting shim and nginx"

# Start the shim process
node index.js &

# Start the nginx process with no output
nginx -g "daemon off;" &

# Wait for any process to exit
wait -n

# Capture exit code
EXIT_CODE=$?

echo "[container] exited with code ${EXIT_CODE}"

# Exit with status of process that exited first
exit $EXIT_CODE
