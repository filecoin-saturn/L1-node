# Saturn Node 🪐

Saturn node is the general implementation for L1 and L2 nodes of Saturn.
It allows retrieval clients to request CIDs and byte ranges of CIDs.
The node returns CAR files from cache or falls back to inner level nodes.

**Saturn is still in v0, earnings have not been enable in test net, but you can run a node to help test the network today**

## Requirements

- Linux server with public IP
- Docker installed ([Instructions here](https://docs.docker.com/engine/install/#server))
- 100Mbps upload bandwidth minimum (1Gbps+ recommended)<sup>1</sup>
- 2GB RAM minimum (8GB+ recommended)
- 128GB SSD minimum (2TB+ NVMe SSD in RAID0 recommended)<sup>2</sup>

<sub>
<sup>1</sup> The more you can serve &rarr; greater FIL earnings<br>
<sup>2</sup> Bigger disk &rarr; bigger cache &rarr; greater FIL earnings
</sub>

## Running a node

1. Install docker ([Instructions here](https://docs.docker.com/engine/install/#server))
2. Authenticate docker with the GitHub Container Registry ([Instructions here](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry))
3. Set FIL_WALLET_ADDRESS env variable in `.bashrc` / `.zshrc` and `/etc/environment` for auto-update
4. Run the docker image:
    ```shell
    sudo docker run --name saturn-node -it -d --restart=unless-stopped \
      -v $HOME/cache:/usr/src/app/cache \
      -v $HOME/ssl:/etc/nginx/ssl \
      -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS \
      --network host \
      ghcr.io/filecoin-project/saturn-node:main
    ```
5. Check logs with `docker logs -f node`
6. Wait for the sign up to happen with the orchestrator and the registration to DNS (this may take several minutes)
7. Download the [`update.sh`](update.sh) script

   `wget https://raw.githubusercontent.com/filecoin-project/saturn-node/main/update.sh > $HOME/update.sh`
8. Setup the cron to run every 5 minutes:
   ```
   */5 * * * * $HOME/update.sh >> $HOME/cron.log
   ```
   **Make sure to have FIL_WALLET_ADDRESS set in `/etc/environment` or hardcoded in `update.sh` for auto-update to work**

## Developing

### Build

Build the docker image with 
```shell
./node build
```

### Run

Run the docker container with 
```shell
./node run
```

### Build and run

```shell
./node build run
```

## Files

#### nginx configuration

`node.conf` contains the nginx configuration of the caching proxy

#### Shim

`shim/` contains the necessary code to fetch CIDs and CAR files for nginx to cache 

## License

Dual-licensed under [MIT](https://github.com/filecoin-project/saturn-node/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-project/saturn-node/blob/master/LICENSE-APACHE)
