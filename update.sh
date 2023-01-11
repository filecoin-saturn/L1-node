#!/bin/bash

set -ex

: "${SATURN_NETWORK:=test}"
: "${SATURN_HOME:=$HOME}"

if pidof -o %PPID -x "update.sh" > /dev/null; then
  exit
fi

compose_file=$SATURN_HOME/docker-compose.yml
env_file=$SATURN_HOME/.env

echo -n "$(date -u) The auto-update script was deprecated to migrate to a docker compose setup."
echo -n "$(date -u) The run script was deprecated too."

if [ -f "$compose_file" ]; then
    echo "We have migrated to a docker compose setup to reduce risks caused by these update and run scripts. You can delete these scripts and use the Docker Compose workflow now."
else 
  wget -O "$compose_file" -T 10 -t 3 "https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/docker-compose.yml"
  if [[ -s "$compose_file" ]];
  then
    echo "Downloaded the docker compose file successfully!"
  else
    echo "Failed to download the docker compose file automagically. Please open a Github issue or migrate manually to the docker compose setup"
    exit
  fi

  wget -O "$env_file" -T 10 -t 3 "https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/.env"
  if [[ -s "$env_file" ]];
  then
    echo "Downloaded the .env file successfully!"
  else
    echo "Failed to download the .env file automagically. Please open a Github issue or migrate manually to the docker compose setup"
    exit
  fi

  echo "Testing compatibility with our Docker Compose workflow"
  sudo docker compose version
  if [ $? -ne 0 ];
  then
      echo 'docker compose might not be supported by your setup, or you are still using an old docker-compose version';
      exit
  fi
  echo "You have docker compose, proceeding."
  echo -n "$(date -u) Pulling Saturn $SATURN_NETWORK network L1 node updates."
  sudo docker compose -f $compose_file pull
  echo "$(date -u) New Saturn $SATURN_NETWORK network L1 node version found!"
  random_sleep="$(( RANDOM % 2000 ))"
  echo "$(date -u) Waiting for $random_sleep seconds..."
  sleep "$random_sleep"
  echo -n "$(date -u) Draining $SATURN_NETWORK network L1 node... "
  sudo docker kill --signal=SIGTERM saturn-node >> /dev/null
  sleep 900
  echo "restarting with docker compose now..."

  sudo docker compose -f $compose_file pull
  sudo docker stop saturn-node || true
  sudo docker rm -f saturn-node || true
  sudo docker compose -f $compose_file up -d
  if [ $? -ne 0 ];
  then
      echo 'Error while launching the docker compose setup';
      exit
  fi
  echo "Updated to the latest version successfully! You can now delete the run.sh and update.sh scripts."
fi

