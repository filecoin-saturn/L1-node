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

From [here](https://docs.ansible.com/ansible/latest/index.html#about-ansible):
> "Ansible is an IT automation tool. It can configure systems, deploy software, and orchestrate more advanced IT tasks such as continuous deployments or zero downtime rolling updates."

This playbook is meant as a bare-bones approach to running an L1. It simply automates running the steps described [above](#running-a-node). A consequence of this is that when run this playbook will restart a crashed L1 node docker container.

Note: this does not cover server hardening and you should do your own research to ensure your server follows security best practices.
If you want to cover server hardening, monitoring and logs check out https://github.com/hyphacoop/ansible-saturn-l1

Currently, this playbook runs on the following Linux distros:
  - Ubuntu
  - Debian
  - CentOS

These instructions are to be run in a machine with [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html) >= 2.12 installed.
This machine is known as your control node and it should not be the one to run your L1 node.

Most commands are run as root and your ssh user should have root access on the target machine.

1. Clone this repository and `cd` into it.

2. For target host connectivity, ssh keys are recommended and this playbook can help you with that.

    Note: Using the playbook for this is completely optional.
    1. Make sure you have configured `ansible_user` and `ansible_ssh_pass` for your target host in your inventory file. See more [here](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html#adding-variables-to-inventory).
    1. Setup an `authorized_keys` file with your public ssh keys in the cloned repository root.
    2. Run `ansible-playbook -i <path_to_your_inventory> -l <host_label> --skip-tags=config,run playbooks/l1.yaml`

3. Ensure your control node has ssh access to your target machine(s).
  - Make sure to specify which hosts you want to provision in your inventory file.

  ```
  ansible -vvv -i <path_to_your_inventory> <host_label> -m ping
  ```

4. Replace the env var values where appropriate and export them.
  - If **Main network:** Set `SATURN_NETWORK` to `main`
  - If you are switching networks check [Switching networks](#switching-networks) and rerun step 4 and 5.
  - You can define a host-specific `SATURN_HOME` by setting a `saturn_root` variable for that host on your inventory file. See more [here](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html#adding-variables-to-inventory).

  ```
  export FIL_WALLET_ADDRESS=<your_fil_wallet_address>; export NODE_OPERATOR_EMAIL=<your_email>; export SATURN_NETWORK=test
  ```

5. Run the playbook
  - Feel free to use host labels to filter them or to deploy incrementally.
  - We're skipping the bootstrap play by default, as it deals with setting authorized ssh keys on the target machine. See 2 for more info.

  ```
  ansible-playbook -i <path_to_your_inventory> -l <host_label> --skip-tags=bootstrap playbooks/l1.yaml
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

## Node operator guide

### Obtaining a Filecoin wallet address

You need to own a Filecoin wallet to receive FIL payments.

* [Official Filecoin wallet documentation](https://docs.filecoin.io/get-started/overview/#wallets)

* If you have an account on a Centralized Exchange (Coinbase, Binance, etc.) that supports Filecoin,
go through the steps to deposit Filecoin and you'll be given an wallet address. This is recommended
if you don't want to manage your wallet's seed phrase.

* Web wallets
  * [Filfox wallet](https://wallet.filfox.info/)
  * [Glif](https://wallet.glif.io/) - Supports Ledger
* Desktop wallets
  * [Exodus](https://www.exodus.com/)
* Mobile wallets
  * [FoxWallet](https://foxwallet.com/)

⚠️ Please follow crypto wallet best practices. Never share your seed phrase with anyone or enter it into websites.
The Saturn team will **never** DM you or ask you to verify/validate/upgrade your wallet. If you need assistance,
please ask in public channels such as the [#filecoin-saturn](https://filecoinproject.slack.com/archives/C03DH0BL02E)
Slack.

### Receiving FIL payments

When payments are scheduled to be sent out, your Filecoin wallet will receive a FIL payment.

### Node monitoring

* https://dashboard.strn.network - View historical data on your bandwidth contributions, FIL earnings, and more.
* https://orchestrator.strn.pl/stats - View detailed, realtime stats on every Saturn node.

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
