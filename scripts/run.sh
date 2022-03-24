#!/bin/bash

: "${NGINX_PORT:=8443}" "${SHIM_PORT:=10361}" "${FIL_WALLET_ADDRESS:=dev}"

echo "running gateway station with nginx @ ${NGINX_PORT} and shim @ ${SHIM_PORT}"

# Start the docker image
docker run --name gateway -it --rm \
          -v $(pwd)/live/ssl:/etc/nginx/ssl \
          -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS \
          -e SHIM_PORT=$SHIM_PORT -e NGINX_PORT=$NGINX_PORT \
          -p $SHIM_PORT:$SHIM_PORT -p $NGINX_PORT:$NGINX_PORT \
          gateway
