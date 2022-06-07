#!/bin/bash

: "${FIL_WALLET_ADDRESS:=f012356}"

echo $(date -u) "[host] Running Saturn node dev"

# Start the docker image
docker run --name saturn-node -it --rm \
          -v $(pwd)/shared:/usr/src/app/shared \
          -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS \
          -p 443:443 -p 8080:8080 \
          saturn-node
