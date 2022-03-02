#!/bin/bash

echo "building docker image"

# Build the docker image and tag it
docker build -t gateway .

echo "done"