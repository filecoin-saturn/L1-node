#!/bin/bash

# Start the docker image
docker run -p 3001:3001 -p 8443:8443 -it gateway
