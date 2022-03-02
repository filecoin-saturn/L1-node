#!/bin/bash

: "${NGINX_PORT:=8443}" "${SHIM_PORT:=3001}"

echo "running gateway station with nginx @ ${NGINX_PORT} and shim @ ${SHIM_PORT}"

# Start the docker image
container_id=$(docker run --rm -d \
          -e SHIM_PORT=$SHIM_PORT -e NGINX_PORT=$NGINX_PORT \
          -p $SHIM_PORT:$SHIM_PORT -p $NGINX_PORT:$NGINX_PORT \
          gateway)

echo $container_id > gateway.dcid
