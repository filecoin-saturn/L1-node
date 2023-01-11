#!/bin/bash

set -ex


sudo docker rm -f saturn-node || true
sudo docker compose up -d
