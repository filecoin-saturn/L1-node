#!/bin/bash

echo $(date -u) "[container] booting"

# If we have a cert, start the shim and nginx, else just the shim
if [ -f "/usr/src/app/shared/ssl/node.crt" ]; then
  echo $(date -u) "[container] SSL config available, starting nginx and node shim";
  nginx -g "daemon off;" &
  exec node src/index.js
else
  echo $(date -u) "[container] SSL config unavailable, starting node shim only";
  exec node src/index.js
fi
