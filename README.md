# Saturn L1 Node 🪐

Saturn L1 nodes are CDN edge caches in the outermost layer of the
[Filecoin Saturn Network](https://strn.network/). L1 nodes serve CIDs
and CID byte ranges to retrieval clients. Cache misses are served by
Saturn [L2 nodes](https://github.com/filecoin-saturn/L2-node).

Saturn is under active development and not yet in production, but you
can still download and run a Saturn L1 to try it out for yourself in
Saturn's [test network](https://orchestrator.saturn-test.network/). We'd
love your feedback in
[#filecoin-saturn](https://filecoinproject.slack.com/archives/C03DH0BL02E)
on [Filecoin Slack](https://filecoinproject.slack.com/).

We're also looking for early L1 node operators to run L1 nodes and earn
Filecoin when Saturn enters private beta. Do you have server capacity
with considerable uplink and storage and want to get in early? If so,
please introduce yourself in
[#filecoin-saturn](https://filecoinproject.slack.com/archives/C03DH0BL02E)
on [Filecoin Slack](https://filecoinproject.slack.com/)!


## Requirements

### General requirements
- Filecoin wallet address
- Email address

### Node's host requirements
- Linux server with a public IPv4 address
- Root access / passwordless sudo user
- Ports 80, 8080 and 443 free
- Docker installed ([Instructions here](https://docs.docker.com/engine/install/#server))
- Modern CPU with 4 cores (8+ cores recommended)
- 1Gbps upload bandwidth minimum (10Gbps+ recommended)<sup>1</sup>
- 8GB RAM minimum (32GB+ recommended)
- 1TB SSD minimum (4x1TB+ NVMe SSD in RAID 5 or RAID 10 recommended)<sup>2</sup>

<sub>
<sup>1</sup> The more you can serve &rarr; greater FIL earnings<br>
<sup>2</sup> Bigger disk &rarr; bigger cache &rarr; greater FIL earnings
</sub>


## Running a node

1. Install docker ([Instructions here](https://docs.docker.com/engine/install/#server))
2. Authenticate docker with the GitHub Container Registry ([Instructions here](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry))
3. Set FIL_WALLET_ADDRESS and NODE_OPERATOR_EMAIL env variables in `.bashrc` (user) and `/etc/environment` (global), and load them
   - If **Main network:** Set `SATURN_NETWORK` to `main` too
4. Run the docker image:

   **Test network:**
    ```shell
    sudo docker run --name saturn-node -it -d --restart=unless-stopped \
      -v $HOME/shared:/usr/src/app/shared \
      -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS \
      -e NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL \
      --network host \
      ghcr.io/filecoin-saturn/l1-node:test
    ```

   **Main network (invitation only):**
    ```shell
    sudo docker run --name saturn-node -it -d --restart=unless-stopped \
      -v $HOME/shared:/usr/src/app/shared \
      -e FIL_WALLET_ADDRESS=$FIL_WALLET_ADDRESS \
      -e NODE_OPERATOR_EMAIL=$NODE_OPERATOR_EMAIL \
      --network host \
      ghcr.io/filecoin-saturn/l1-node:main
    ```
    
5. Check logs with `docker logs -f saturn-node`
6. Check there are no errors, registration will happen automatically and node will restart once it receives its TLS certificate
7. Download the [`update.sh`](update.sh) script

   ```shell
   wget -O $HOME/update.sh https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/update.sh && chmod +x $HOME/update.sh
   ```
8. Setup the cron to run every 5 minutes:

   ```shell
   crontab -e
   ```

   Add the following text:
   ```
   */5 * * * * $HOME/update.sh >> $HOME/cron.log
   ```

   **Make sure to have env variables set in `/etc/environment` or hardcoded in `update.sh` for auto-update to work**


## Developing

### Requirements
1. Run orchestrator locally
2. Self-signed certificate

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

### Deployment

**Only changes to `container/` and `Dockerfile`** trigger a build

- To deploy to test network, just push to `main`.
- To deploy to main network, create a tag and push it, example:
  ```
  git checkout main
  git pull
  git tag $(date +%s)
  git push --follow-tags
  ```

In development, to avoid an automatic CI/CD deployment to the test network when any change is made to the `container/` directory, include `[skip ci]` in the `git commit` message. Like:

```shell
git commit -m "my commit message [skip ci]"
```

## Files

#### nginx configuration

`nginx/` contains the nginx configuration of the caching proxy

#### Shim

`shim/` contains the necessary code to fetch CIDs and CAR files for nginx to cache 


## License

Dual-licensed under [MIT](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-APACHE)
