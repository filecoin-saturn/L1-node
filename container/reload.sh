#!/bin/bash
set -eu

# Set a default value for PRE_UPDATE_WAIT_DIVISOR if it's not already set
: "${PRE_UPDATE_WAIT_DIVISOR:=3600}"

time=$((RANDOM % PRE_UPDATE_WAIT_DIVISOR))
echo "going to wait $time seconds before updating"
sleep "$time"
