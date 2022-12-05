#!/bin/bash

: "${FIL_WALLET_ADDRESS:=f012356}"
: "${NODE_OPERATOR_EMAIL:=dev@strn.pl}"
: "${IPFS_GATEWAY_ORIGIN:=https://ipfs.io}"
: "${ORCHESTRATOR_REGISTRATION:=true}"

mkdir $(pwd)/shared
echo "$(date -u) [host] Running Saturn node dev, with volume in $(pwd)/shared"

# Start the docker image
docker run --name saturn-node -it --rm \
          -v "$(pwd)/shared:/usr/src/app/shared:Z" \
          -e "FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS" \
          -e "NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL" \
          -e "IPFS_GATEWAY_ORIGIN=$IPFS_GATEWAY_ORIGIN" \
          -e "ORCHESTRATOR_REGISTRATION=$ORCHESTRATOR_REGISTRATION" \
          -e "SPEEDTEST_SERVER_CONFIG=$SPEEDTEST_SERVER_CONFIG" \
          -p 443:443 -p 80:80 \
          saturn-node
