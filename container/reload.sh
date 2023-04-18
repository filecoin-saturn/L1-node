#!/bin/bash
set -eu

time=$((RANDOM % PRE_UPDATE_WAIT_DIVISOR))
echo "going to wait $time seconds before updating"
sleep "$time"
