#!/bin/sh

# keeps docker-compose.yml and itself up to date
set -eux

branch="${1:-main}"
repo="https://raw.githubusercontent.com/filecoin-saturn/L1-node/$branch"

curl -fs "$repo/docker_compose_update.sh" -o docker_compose_update.sh

curl -fs "$repo/docker-compose.yml" -o docker-compose.yml.curl
if ! diff docker-compose.yml.curl docker-compose.yml >/dev/null; then
    mv -f docker-compose.yml.curl docker-compose.yml
    sudo docker compose up -d -t 10800
fi
