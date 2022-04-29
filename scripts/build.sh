#!/bin/bash

echo "Building docker image"

# Build the docker image and tag it
docker build -t saturn-node --build-arg ORCHESTRATOR_URL=host.docker.internal:10365 .

echo "Build done"