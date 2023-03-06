#!/bin/bash

set -e

echo "$(date -u) [host] Building docker image"

# Build the docker image and tag it
docker build -t saturn-node --build-arg ORCHESTRATOR_URL=http://host.docker.internal:10365 .

echo "$(date -u) [host] Build done"
