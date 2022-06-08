#!/bin/bash

set -ex

: "${SATURN_NETWORK:=test}"

if pidof -o %PPID -x "update.sh" > /dev/null; then
  exit
fi

if openssl x509 -noout -text -in shared/ssl/node.crt | grep cdn; then
  echo "Old certificate"
fi

echo $(date -u) "Checking for auto-update script updates..."

target=$HOME/update.sh
if wget -O "$target.tmp" -T 10 -t 3 "https://raw.githubusercontent.com/filecoin-project/saturn-node/main/update.sh" && [[ -s "$target.tmp" ]] && [ $(stat -c %s "$target.tmp") -ne $(stat -c %s "$target") ]
then
  mv -f "$target.tmp" "$target"
  chmod +x "$target"
  echo $(date -u) "Updated update.sh script successfully!"
  exit
else
  echo $(date -u) "update.sh script up to date"
  rm -f "$target.tmp"
fi

echo $(date -u) "Checking for Saturn node updates..."

out=$(sudo docker pull ghcr.io/filecoin-project/saturn-node:$SATURN_NETWORK)

if [[ $out != *"up to date"* ]]; then
  random_sleep=$[ ( $RANDOM % 240 ) ]
  echo $(date -u) "New Saturn node version found, restarting in $random_sleep seconds..."
  sleep $random_sleep
  echo $(date -u) "Restarting node...."

  sudo docker stop --time 60 saturn-node || true
  sudo docker rm -f saturn-node || true
  sudo docker run --name saturn-node -it -d --restart=unless-stopped -v $HOME/shared:/usr/src/app/shared -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS -e NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL --network host ghcr.io/filecoin-project/saturn-node:$SATURN_NETWORK
  sudo docker image prune -f

  echo $(date -u) "Updated to latest version successfully!"
else
  echo $(date -u) "Saturn node up to date"
fi