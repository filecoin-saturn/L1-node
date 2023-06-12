#!/bin/bash
set -eou pipefail

if [ ! -f "/usr/src/app/shared/nodeId.txt" ]; then
  cat /proc/sys/kernel/random/uuid > /usr/src/app/shared/nodeId.txt
fi

export LASSIE_TEMP_DIRECTORY=/usr/src/app/shared/lassie
mkdir -p $LASSIE_TEMP_DIRECTORY

if [ "${LASSIE_ORIGIN:-}" != "" ]; then
  if [ "${NETWORK:-}" = "main" ]; then
    lassie daemon 2>&1 1>/dev/null &
  else
    lassie daemon &
  fi
  LASSIE_PID=$!

  node --max-old-space-size=4096 /usr/src/app/src/bin/shim.js &
  SHIM_PID=$!

  _quit() {
    kill -INT "$SHIM_PID" 2>/dev/null # trigger shutdown

    wait "$SHIM_PID" # let shim exit itself

    exit $?
  }

  _term() {
    trap _quit SIGINT SIGQUIT # handle next wave of signals

    kill -TERM "$SHIM_PID" 2>/dev/null # trigger deregistration

    wait "$SHIM_PID" # keep shim alive while draining
  }

  trap _term SIGTERM

  wait -n $LASSIE_PID $SHIM_PID
else
  exec node --max-old-space-size=4096 /usr/src/app/src/bin/shim.js
fi
