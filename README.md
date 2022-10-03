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
- Root access / passwordless sudo user ([How to](https://askubuntu.com/questions/147241/execute-sudo-without-password))
- Ports 80 and 443 free
- Docker installed ([Instructions here](https://docs.docker.com/engine/install/#server))
- CPU with 6 cores (12+ cores recommended). [CPU Mark](https://www.cpubenchmark.net/cpu_list.php) of 8,000+ (20,000+ recommended)
- 10Gbps upload link minimum<sup>1</sup>
- 32GB RAM minimum (128GB+ recommended)
- 1TB SSD minimum (4x1TB+ NVMe SSD in RAID 5 or RAID 10 recommended)<sup>2</sup>

<sub>
<sup>1</sup> The more you can serve &rarr; greater FIL earnings<br>
<sup>2</sup> Bigger disk &rarr; bigger cache &rarr; greater FIL earnings
</sub>


## Running a node

<sub>If you are switching networks, please see the [Switching networks](#switching-networks) section below.</sub>

1. Install docker ([Instructions here](https://docs.docker.com/engine/install/#server))
2. Set FIL_WALLET_ADDRESS and NODE_OPERATOR_EMAIL env variables in `.bashrc` (user) and `/etc/environment` (global), and load them
   - If **Main network:** Set `SATURN_NETWORK` to `main` too
   - By default, Saturn volume is mounted from `$HOME`. It can be changed by setting `$SATURN_HOME` env variable

3. Change directory to $SATURN_HOME (default: `$HOME`) to download the `run.sh` and `update.sh` scripts in steps 4 and 8
4. Download the [`run.sh`](run.sh) script and make it executable

   ```bash
   curl -s https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/run.sh -o run.sh
   chmod +x run.sh
   ```

5. Run the script:

    ```bash
    ./run.sh
    ```

6. Check logs with `docker logs -f saturn-node`
7. Check there are no errors, registration will happen automatically and node will restart once it receives its TLS certificate
8. Download the [`update.sh`](update.sh) script and make it executable

   ```bash
   curl -s https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/update.sh -o update.sh
   chmod +x update.sh
   ```

9. Setup the cron to run every 5 minutes:

   ```bash
   crontab -e
   ```

   Add the following text replacing the path:
   ```
   */5 * * * * /path/to/saturn/home/update.sh >> /path/to/saturn/home/l1-cron.log 2>&1
   ```

   **Make sure to have env variables set in `/etc/environment` for auto-update to work**

## Running a node with [Ansible](https://docs.ansible.com/ansible/latest/index.html)

This playbook is meant as a bare-bones approach to running an L1. It simply automates running the steps described [above](## Running a node). A consequence of this is that when run this playbook will restart a crashed L1 node docker container.
Note: this does not cover server hardening and you should do your own research to ensure your server follows security best practices.

Currently, this playbook runs on the following Linux distros:
  - Ubuntu
  - Debian
  - CentOS

These instructions are to be run in a machine with [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html) >= 2.12 installed.
This machine is known as your control node and it should not be the one to run your L1 node.

Most commands are run as root and your ssh user should have root access on the target machine.

1. Ensure your control node has ssh access to your target machine.

  ```
  ansible -vvv -i <path_to_your_inventory> <host_label> -m ping
  ```

2. Clone this repository and `cd` into it.

3. Replace the env var values where appropriate and export them.
  - If **Main network:** Set `SATURN_NETWORK` to `main`

  ```
  export FIL_WALLET_ADDRESS=<your_fil_wallet_address>; export NODE_OPERATOR_EMAIL=<your_email>; export SATURN_NETWORK=test
  ```

4. Run the playbook
  - Make sure to specify which hosts you want to provision in your inventory file.
  - Feel free to use labels (modify the `targets` var) to filter them or to deploy incrementally.
  - We're skipping the bootstrap play by default, as it deals with setting authorized keys on the target machine.
  - Note that you can define a specific `SATURN_HOME` by setting `volume_root` on your inventory file.

  ```
  ansible-playbook -i <path_to_your_inventory> --extra-vars targets=all --skip-tags=bootstrap playbooks/l1.yaml
  ```

## Stopping a node

To gracefully stop a node a not receive a penalty, run:

```bash
  sudo docker kill --signal=SIGTERM saturn-node
  sleep 600 # wait for 10 minutes to drain all requests
  sudo docker stop saturn-node
```

## Switching networks

If you are switching networks, follow these steps:

1. Stop the node as explained in [Stopping a node](#stopping-a-node)
2. Set the network env variable `SATURN_NETWORK` to `main` or `test` in `/etc/environment` and `.bashrc`
3. Delete contents in `$SATURN_HOME/shared/ssl` (default: `$HOME/shared/ssl`)
4. Start the node again with `run.sh` script

## Developing

### Requirements
1. Run [orchestrator](https://github.com/filecoin-saturn/orchestrator) locally
2. Self-signed 256-bit ECC certificate ([Instructions here](docs/certificate.md)) in `shared/ssl`

### Build

Build the docker image with 
```bash
./node build
```

### Run

Run the docker container with 
```bash
./node run
```

### Build and run

```bash
./node build run
```

### Deployment

**Only changes to `container/` and `Dockerfile`** trigger a build

- To deploy to test network, just push to `main`.
- To deploy to main network, create a tag and push it, example:
  ```bash
  git checkout main
  git pull
  git tag $(date +%s)
  git push --follow-tags
  ```

In development, to avoid an automatic CI/CD deployment to the test network when any change is made to the `container/` directory, include `[skip ci]` in the `git commit` message. Like:

```bash
git commit -m "my commit message [skip ci]"
```

## Files

#### nginx configuration

`nginx/` contains the nginx configuration of the caching proxy

#### Shim

`shim/` contains the necessary code to fetch CIDs and CAR files for nginx to cache 


## License

Dual-licensed under [MIT](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-APACHE)
