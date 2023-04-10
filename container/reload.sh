#!/bin/bash
set -eux

PRE_UPDATE_WAIT_DIVISOR="${1:-3600}"
time=$((RANDOM % PRE_UPDATE_WAIT_DIVISOR))
echo "going to wait $time seconds before updating"
sleep "$time"
