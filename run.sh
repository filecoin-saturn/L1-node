#!/bin/bash

set -ex

: "${SATURN_NETWORK:=test}"
: "${SATURN_HOME:=$HOME}"

echo "Running Saturn $SATURN_NETWORK network L1 Node on $SATURN_HOME"
sudo docker rm -f saturn-node || true
sudo docker run --name saturn-node -it -d \
  --restart=unless-stopped \
  -v "$SATURN_HOME/shared:/usr/src/app/shared" \
  -e "FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS" \
  -e "NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL" \
  -e "SPEEDTEST_SERVER_CONFIG=$SPEEDTEST_SERVER_CONFIG" \
  --network host \
  --ulimit nofile=1000000 \
  ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK
