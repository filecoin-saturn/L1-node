#!/bin/bash

: "${NGINX_PORT:=8443}" "${SHIM_PORT:=10361}" "${FIL_WALLET_ADDRESS:=dev}"

echo $(date -u) "[host] Running Saturn node dev"

# Start the docker image
docker run --name saturn-node -it --rm \
          -v $(pwd)/shared:/usr/src/app/shared \
          -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS \
          -p $SHIM_PORT:$SHIM_PORT -p $NGINX_PORT:$NGINX_PORT \
          saturn-node
