#!/bin/bash
set -eu

curl -fs https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/docker_compose_update.sh -o docker_compose_update.sh

curl -fs https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/docker-compose.yml -o docker-compose.yml.curl
if ! diff docker-compose.yml.curl docker-compose.yml >/dev/null; then
				mv -f docker-compose.yml.curl docker-compose.yml
				sudo docker compose up -d
fi
