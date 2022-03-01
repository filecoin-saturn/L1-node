#!/bin/bash

echo "Starting shim and nginx"

# Start the shim process
node index.js &

# Start the nginx process with no output
nginx -g "daemon off;" > /dev/null 2>&1 &

# Output running address and test CID url
echo ""

# Wait for any process to exit
wait -n

EXIT_CODE=$?

echo "exited with code ${EXIT_CODE}"

# Exit with status of process that exited first
exit $EXIT_CODE
