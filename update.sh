#!/bin/bash
set -ex

if pidof -o %PPID -x "update.sh" > /dev/null; then
	exit
fi

out=$(sudo docker pull ghcr.io/filecoin-project/saturn-node:main)

if [[ $out != *"up to date"* ]]; then
  echo $(date -u) "Updating Saturn node..."

  sleep $((RANDOM % 60))
  sudo docker stop --time 30 node
  sudo docker rm -f node
  sudo docker run --name node -it -d --restart=unless-stopped -v $HOME/cache:/usr/src/app/cache -v $HOME/ssl:/etc/nginx/ssl -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS --network host ghcr.io/filecoin-project/saturn-node:main
  sudo docker image prune -f

  echo $(date -u) "Update done!"
else
  echo $(date -u) "Node up to date"
fi