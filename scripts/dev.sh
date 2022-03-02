#!/bin/bash

build_and_run() {
    ./gateway build
    ./gateway run
}

watch() {
  build_and_run
  echo "watching container/ for changes"
  while sleep 2
  do
      files=`find container -type f -mtime -2s`
      if [[ $files != "" ]] ; then
          echo "restarting..."
          ./gateway kill
          build_and_run
      fi
  done
}

trap "echo \"stopping...\"; ./gateway kill" INT TERM

watch