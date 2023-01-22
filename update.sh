#!/bin/bash

set -ex

: "${SATURN_NETWORK:=test}"
: "${SATURN_HOME:=$HOME}"

if pidof -o %PPID -x "update.sh" > /dev/null; then
  exit
fi

compose_file=$SATURN_HOME/docker-compose.yml
env_file=$SATURN_HOME/.env

echo "$(date -u) Starting migration to docker compose setup."
echo "The auto-update script was deprecated to migrate to a docker compose setup. Updates are handled by a Watchtower container now."
echo "The run script was deprecated too. To start or stop your node use 'docker compose -f ${compose_file} up -d' or 'docker compose -f $compose_file down' respectively."

if [ -f "$compose_file" ]; then
    echo "We have migrated to a docker-compose setup to reduce risks caused by these update and run scripts. You can delete these scripts and use the Docker Compose workflow now."
else 
  wget -O "$compose_file" -T 10 -t 3 "https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/docker-compose.yml"
  if [[ -s "$compose_file" ]];
  then
    echo "Downloaded the docker-compose file successfully!"
  else
    echo "Failed to download the docker-compose file automagically. Please open a Github issue or migrate manually to the docker-compose setup"
    exit 1
  fi

  if [ ! -f "$env_file" ];
  then
    echo FIL_WALLET_ADDRESS=\"$FIL_WALLET_ADDRESS\" > $env_file
    echo NODE_OPERATOR_EMAIL=\"$NODE_OPERATOR_EMAIL\" >> $env_file
    echo SATURN_NETWORK=\"$SATURN_NETWORK\" >> $env_file
    echo SATURN_HOME=\"$SATURN_HOME\" >> $env_file
  fi
  if [[ -s "$env_file" ]];
  then
    echo "Downloaded the .env file migrated successfully!"
  else
    echo "Failed to download the .env file automagically. Please open a Github issue or migrate manually to the docker-compose setup"
    exit 1
  fi

  echo "Testing compatibility with our Docker-Compose workflow"
  if ! sudo docker-compose version;
  then
      echo "docker-compose might not be supported by your setup, or you are still using an old docker-compose version";
      exit 1
  fi
  echo "You have docker-compose, proceeding."
  printf "If any of the following steps fail, please edit the .env file to include the expected values and try running the commands:\n\t'sudo docker stop --time 900 saturn-node && sudo docker compose -f %s up -d'." "$compose_file"

  random_sleep="$(( RANDOM % 2000 ))"
  echo "Waiting for $random_sleep seconds to avoid stopping all nodes in the network at once..."
  sleep "$random_sleep"

  echo "Pulling Saturn $SATURN_NETWORK network L1 node updates."
  sudo -E docker-compose -f "$compose_file" pull

  echo "Draining $SATURN_NETWORK network L1 node... "
  sudo docker stop --time 900 saturn-node || true

  echo "Restarting with docker-compose now..."
  sudo docker rm -f saturn-node || true
  sudo -E docker-compose -f "$compose_file" pull
  
  if ! sudo -E docker-compose -f "$compose_file" up -d;
  then
      echo "Error while launching the docker-compose setup. Please try running 'docker-compose up -d' yourself or open an issue on Github."
      exit 1
  fi
  echo "Updated to the latest version successfully! You can now delete the run.sh and update.sh scripts."
fi

