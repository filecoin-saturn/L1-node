#!/bin/bash

echo "[container] starting shim"

# If we have a cert, start the shim and nginx, else just the shim
if [ -f "/etc/nginx/ssl/node.crt" ]; then
  node index.js &
  echo "SSL config available, starting nginx";
  exec nginx -g "daemon off;"
else
  exec node index.js
fi
