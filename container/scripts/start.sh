#!/bin/bash

echo "[container] starting shim"

# If we have a cert, start the shim and nginx, else just the shim
if [ -f "/usr/src/app/shared/ssl/node.crt" ]; then
  echo "SSL config available, starting node shim and nginx";
  node index.js &
  exec nginx -g "daemon off;"
else
  echo "SSL config unavailable, starting node shim only";
  exec node index.js
fi
