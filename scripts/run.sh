#!/bin/bash

set -e

: "${FIL_WALLET_ADDRESS:=f012356}"
: "${NODE_OPERATOR_EMAIL:=dev@strn.pl}"
: "${IPFS_GATEWAY_ORIGIN:=https://ipfs.io}"
: "${ORCHESTRATOR_REGISTRATION:=true}"
: "${HTTP_PORT:=80}"
: "${HTTPS_PORT:=443}"
: "${IS_CORE_L1:=false}"
: "${L2_FIRE_AND_FORGET:=true}"

mkdir -p "$(pwd)/shared"
echo "$(date -u) [host] Running Saturn node dev, with volume in $(pwd)/shared"

# Start the docker image
docker run --name saturn-node --rm $( [ "$CI" != "true" ] && echo -n "-it" ) \
          -v "$(pwd)/shared:/usr/src/app/shared:Z" \
          -e "FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS" \
          -e "NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL" \
          -e "IPFS_GATEWAY_ORIGIN=$IPFS_GATEWAY_ORIGIN" \
          -e "ORCHESTRATOR_REGISTRATION=$ORCHESTRATOR_REGISTRATION" \
          -e "SPEEDTEST_SERVER_CONFIG=$SPEEDTEST_SERVER_CONFIG" \
          -e "LASSIE_ORIGIN=$LASSIE_ORIGIN" \
          -e "IS_CORE_L1=$IS_CORE_L1" \
          -e "L2_FIRE_AND_FORGET=$L2_FIRE_AND_FORGET" \
          -p $HTTPS_PORT:443 -p $HTTP_PORT:80 \
          saturn-node
