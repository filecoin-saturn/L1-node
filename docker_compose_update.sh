#!/bin/sh

# keeps docker-compose.yml and itself up to date
set -ex

env="$1"

tags="$(curl -fs https://api.github.com/repos/filecoin-saturn/l1-node/tags | grep name | cut -f2 -d ':' | tr -d ',' | tr -d '\"' | tr -d ' ')"

# default to main net
ref="$(echo "$tags" | grep "^[[:digit:]]" | head -n1)"
if [ "$env" = "test" ]; then
    ref="main"
elif [ "$env" = "canary" ]; then
    ref="$(echo "$tags" | grep "canary-" | head -n1)"
fi

repo="https://raw.githubusercontent.com/filecoin-saturn/L1-node/$ref"

curl -Lfs "$repo/docker_compose_update.sh" -o docker_compose_update.sh

curl -Lfs "$repo/docker-compose.yml" -o docker-compose.yml.curl
if ! diff docker-compose.yml.curl docker-compose.yml >/dev/null; then
    mv -f docker-compose.yml.curl docker-compose.yml
    sudo docker compose up -t 10800 -d
fi
