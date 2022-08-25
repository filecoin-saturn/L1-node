#!/bin/bash

set -ex

: "${SATURN_NETWORK:=test}"
: "${SATURN_HOME:=$HOME}"

if pidof -o %PPID -x "update.sh" > /dev/null; then
  exit
fi

echo -n $(date -u) "Checking for update.sh script updates... "

target=$SATURN_HOME/update.sh
if wget -O "$target.tmp" -T 10 -t 3 "https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/update.sh" && [[ -s "$target.tmp" ]] && [ $(stat -c %s "$target.tmp") -ne $(stat -c %s "$target") ]
then
  mv -f "$target.tmp" "$target"
  chmod +x "$target"
  echo "updated update.sh script successfully!"
  exit
else
  echo "update.sh script up to date"
  rm -f "$target.tmp"
fi

grep "504 Gateway Timeout" -lr $SATURN_HOME/shared/nginx_cache | xargs rm

echo -n $(date -u) "Checking for Saturn L1 node updates... "

out=$(sudo docker pull ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK)

if [[ $out != *"up to date"* ]]; then
  echo $(date -u) "New Saturn L1 node version found!"
  random_sleep=$[ ( $RANDOM % 60 ) ]
  echo -n $(date -u) "Restarting L1 node in $random_sleep seconds... "
  sleep $random_sleep
  echo "restarting...."

  sudo docker stop --time 120 saturn-node || true
  sudo docker rm -f saturn-node || true
  sudo docker run --name saturn-node -it -d --restart=unless-stopped -v $SATURN_HOME/shared:/usr/src/app/shared -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS -e NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL --network host ghcr.io/filecoin-saturn/l1-node:$SATURN_NETWORK
  sudo docker image prune -f

  echo "Updated to latest version successfully!"
else
  echo "Saturn L1 node up to date"
fi