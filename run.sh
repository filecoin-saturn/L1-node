#!/bin/bash

set -ex


sudo docker rm -f saturn-node || true
sudo docker run --name saturn-node -it -d \
  --restart=unless-stopped \
  -v "$SATURN_HOME/shared:/usr/src/app/shared" \
  -e "FIL_WALLET_ADDRESS=" \
  -e "NODE_OPERATOR_EMAIL=" \
  -e "SPEEDTEST_SERVER_CONFIG=" \
  --network host \
  --ulimit nofile=1000000 \
  ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK
