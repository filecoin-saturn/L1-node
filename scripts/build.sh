#!/bin/bash

echo "Building docker image"

# Build the docker image and tag it
docker build -t saturn-node .

echo "Build done"