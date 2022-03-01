#!/bin/bash

: "${NGINX_PORT:=8443}" "${SHIM_PORT:=3001}"

echo "running gateway station with nginx @ ${NGINX_PORT} and shim @ ${SHIM_PORT}"

# Start the docker image
docker run --rm \
          -e SHIM_PORT=$SHIM_PORT -e NGINX_PORT=$NGINX_PORT \
          -p $SHIM_PORT:$SHIM_PORT -p $NGINX_PORT:$NGINX_PORT \
          -it gateway;

echo
echo "gateway shut down"

