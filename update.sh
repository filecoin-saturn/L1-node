#!/bin/bash

set -ex

: "${SATURN_NETWORK:=test}"
: "${SATURN_HOME:=$HOME}"

if pidof -o %PPID -x "update.sh" > /dev/null; then
  exit
fi

target=$SATURN_HOME/update.sh

echo -n "$(date -u) Checking for auto-update script ($target) updates... "

if wget -O "$target.tmp" -T 10 -t 3 "https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/update.sh" && [[ -s "$target.tmp" ]] && [ "$(stat -c %s "$target.tmp")" -ne "$(stat -c %s "$target")" ]
then
  mv -f "$target.tmp" "$target"
  chmod +x "$target"
  echo "updated $target script successfully!"
  exit
else
  echo "$target script up to date"
  rm -f "$target.tmp"
fi

echo -n "$(date -u) Checking for Saturn $SATURN_NETWORK network L1 node updates... "

out=$(sudo docker pull ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK)

if [[ $out != *"up to date"* ]]; then
  echo "$(date -u) New Saturn $SATURN_NETWORK network L1 node version found!"

  random_sleep="$(( RANDOM % 3600 ))"
  echo "$(date -u) Waiting for $random_sleep seconds..."
  sleep "$random_sleep"

  echo -n "$(date -u) Draining $SATURN_NETWORK network L1 node... "
  sudo docker kill --signal=SIGTERM saturn-node >> /dev/null
  sleep 600
  echo "restarting...."

  sudo docker pull ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK || true
  sudo docker stop saturn-node || true
  sudo docker rm -f saturn-node || true
  sudo docker run --name saturn-node -it -d \
    --restart=on-failure \
    -v "$SATURN_HOME/shared:/usr/src/app/shared" \
    -e "FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS" \
    -e "NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL" \
    --network host \
    --ulimit nofile=1000000 \
    ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK
  sudo docker image prune -f

  echo "Updated to latest version successfully!"
else
  echo "Saturn $SATURN_NETWORK network L1 node up to date"
fi
