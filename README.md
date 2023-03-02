# Saturn L1 Node 🪐

Saturn L1 nodes are CDN edge caches in the outermost layer of the
[Filecoin Saturn](https://strn.network/) network. L1 nodes serve [CAR
files](https://ipld.io/specs/transport/car/) to retrieval clients as
requested by their [CID](https://docs.filebase.com/ipfs/ipfs-cids)s.
Cache misses are currently served by the [IPFS
Gateway](https://docs.ipfs.tech/concepts/ipfs-gateway/). In the future,
cache misses will be served by Saturn [L2
nodes](https://github.com/filecoin-saturn/L2-node) and Filecoin [Storage
Providers](https://sp.filecoin.io/).

Saturn is live. Do you have a server that meets the minimum [hardware
requirements](#node-hardware-requirements)? If so, follow the [setup
instructions](#set-up-a-node) below to get started. You can run an L1
node, contribute bandwidth to the network, and earn Filecoin (FIL)
today.

Beyond running a node, Saturn is a community run project and we'd love
for you to get involved. Come say hi in
[#filecoin-saturn](https://filecoinproject.slack.com/archives/C03DH0BL02E)
on [Filecoin Slack](https://filecoinproject.slack.com/)! 👋

### Table of Contents

- [Requirements](#requirements)
  - [General requirements](#general-requirements)
  - [Node hardware requirements](#node-hardware-requirements)
- [Set up a node](#set-up-a-node)
- [Set up a node with <a href="https://docs.ansible.com/ansible/latest/index.html" rel="nofollow">Ansible</a>](#set-up-a-node-with-ansible)
- [Stopping a node](#stopping-a-node)
- [Switch networks between test net and main net](#switch-networks-between-test-net-and-main-net)
- [Node operator guide](#node-operator-guide)
  - [Obtaining a Filecoin wallet address](#obtaining-a-filecoin-wallet-address)
  - [Receiving FIL payments](#receiving-fil-payments)
  - [Node monitoring](#node-monitoring)
- [License](#license)

## Requirements

### General requirements

- Filecoin wallet address
- Email address

### Node hardware requirements

- Linux server with a static public IPv4 address
- Root access / passwordless sudo user ([How to](https://askubuntu.com/questions/147241/execute-sudo-without-password))
- Ports 80 and 443 free and public to the internet
- [Docker](https://www.docker.com/) installed ([Instructions here](https://docs.docker.com/engine/install/#server)) with [Docker Compose v2](https://www.docker.com/blog/announcing-compose-v2-general-availability/)
- CPU with 6 cores (12+ cores recommended). [CPU Mark](https://www.cpubenchmark.net/cpu_list.php) of 8,000+ (20,000+ recommended)
- 10Gbps upload link minimum<sup>1</sup> ([Why 10Gbps?](https://github.com/filecoin-saturn/L1-node/blob/main/docs/faq.md#why-is-10-gbps-uplink-required))
- 32GB RAM minimum (128GB+ recommended)
- 2TB SSD storage minimum (16TB+ NVMe recommended)<sup>2</sup>

**Only one node per physical host is allowed. If you want to run multiple nodes, you need to run them on dedicated hardware.<br>
Multi-noding (Sharing CPU, RAM, Uplink or storage among nodes) is not allowed.**

<sub>
<sup>1</sup> The more you can serve &rarr; greater FIL earnings<br>
<sup>2</sup> Bigger disk &rarr; bigger cache &rarr; greater FIL earnings
</sub>

## Set up a node

<sub>If you want to switch your node from test net to main net, or vice versa, see [Switch networks](#switch-networks-between-test-net-and-main-net) below.</sub>

1. Install

   - Docker: [instructions here](https://docs.docker.com/engine/install/#server)
   - Docker compose v2: [instructions here](https://docs.docker.com/compose/install/linux/)

2. Change directory to `$SATURN_HOME` (default: `$HOME`) to download the required files

   ```bash
   cd ${SATURN_HOME:-$HOME}
   ```

3. Download the `.env` file

   Note: the `.env` file [does not take precedence](https://docs.docker.com/compose/envvars-precedence/) over env variables set locally.

   - Set the mandatory `FIL_WALLET_ADDRESS` and `NODE_OPERATOR_EMAIL` environment variables in the `.env` file.
   - Set the `SATURN_NETWORK` environment variable in the `.env` file.
     - To join Saturn's Main network and earn FIL rewards, make sure to set `SATURN_NETWORK` to `main`.
     - To join Saturn's Test network, which doesn't earn FIL rewards, set `SATURN_NETWORK` to `test`. Note that this is the default value!
   - By default, the Saturn volume is mounted from `$HOME`. It can be changed by setting the `$SATURN_HOME` environment variable.

   ```bash
   curl -s https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/.env -o .env
   ```

   You can use the text editor of your choice (e.g. `nano` or `vim` on Linux)

4. Download the docker-compose file

   ```bash
   curl -s https://raw.githubusercontent.com/filecoin-saturn/L1-node/main/docker-compose.yml -o docker-compose.yml
   ```

5. Launch it:

   ```bash
   sudo docker compose up -d
   ```

6. Check logs with `docker logs -f saturn-node`
7. Check for any errors. Registration will happen automatically and the node will restart once it receives its TLS certificate

In most instances speedtest does a good job of picking "close" servers but for small networks it may be incorrect.
If the speedtest value reported by speedtest seems low, you may want to configure SPEEDTEST_SERVER_CONFIG to point to a different public speedtest server. You will need to install [speedtest CLI](https://www.speedtest.net/apps/cli) in the host and fetch close servers' IDs by doing `speedtest --servers`, then setting `SPEEDTEST_SERVER_CONFIG="--server-id=XXXXX"`

## Update a node

We are using a Watchtower container to update the saturn-node container.
Your node will be updated automatically. You can see the update logs with `docker logs -f saturn-watchtower`.

## Set up a node with [Ansible](https://docs.ansible.com/ansible/latest/index.html)

From [here](https://docs.ansible.com/ansible/latest/index.html#about-ansible):

> "Ansible is an IT automation tool. It can configure systems, deploy software, and orchestrate more advanced IT tasks such as continuous deployments or zero downtime rolling updates."

This playbook is meant as a bare-bones approach to set up an L1. It simply automates running the steps described [above](#set-up-a-node). A consequence of this is that when run it will restart a crashed L1 node docker container.
It also presents a basic approach to server hardening which is by no means thorough.

**Note: The security of your servers is your responsibility. You should do your own research to ensure your server follows security best practices.**

If you're looking for a playbook which covers server hardening, monitoring and logging please check out https://github.com/hyphacoop/ansible-saturn-l1.

Currently, this playbook runs on the following Linux distros:

- Ubuntu
- Debian
- CentOS

These instructions are to be run in a machine with [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html) >= 2.14 installed.
This machine is known as your control node and it should not be the one to run your L1 node.

Most commands are run as root and your ssh user should have root access on the target machine.

1. Install the required Ansible modules

```
ansible-galaxy collection install community.docker
```

2. Clone this repository and `cd` into it.

3. For target host connectivity, ssh keys are recommended and this playbook can help you with that.

   Note: Using the playbook for this is completely optional.

   1. Make sure you have configured `ansible_user` and `ansible_ssh_pass` for your target host in your inventory file. See more [here](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html#adding-variables-to-inventory).
   1. Setup an `authorized_keys` file with your public ssh keys in the cloned repository root.
   1. Run `ansible-playbook -i <path_to_your_inventory> -l <host_label> --skip-tags=config,harden,run playbooks/l1.yaml`

4. Ensure your control node has ssh access to your target machine(s).

- Make sure to specify which hosts you want to provision in your inventory file.

```bash
ansible -vvv -i <path_to_your_inventory> <host_label> -m ping
```

5. Replace the environment varariable values where appropriate and export them.

- If **Main network:** Set `SATURN_NETWORK` to `main`
- If you are switching networks check [Switching networks](#switching-networks) and rerun step 4 and 5.
- You can define a host-specific `SATURN_HOME` by setting a `saturn_root` variable for that host on your inventory file. See more [here](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html#adding-variables-to-inventory).

```bash
export FIL_WALLET_ADDRESS=<your_fil_wallet_address>; export NODE_OPERATOR_EMAIL=<your_email>; export SATURN_NETWORK=test
```

6. Run the playbook

- Feel free to use host labels to filter them or to deploy incrementally.
- We're skipping the bootstrap play by default, as it deals with setting authorized ssh keys on the target machine. See 2 for more info.

```bash
ansible-playbook -i <path_to_your_inventory> -l <host_label> --skip-tags=bootstrap playbooks/l1.yaml
```

- To skip the hardening step run this instead:

```bash
ansible-playbook -i <path_to_your_inventory> -l <host_label> --skip-tags=bootstrap,harden playbooks/l1.yaml
```

## Stopping a node

To gracefully stop a node and not receive a penalty, run:

```bash
  sudo docker stop --time 1800 saturn-node
```

or if you are in your `$SATURN_HOME` folder with the Saturn `docker-compose.yml` file:

```bash
  sudo docker compose down
```

We are setting the `stop_signal` and the `stop_grace_period` in our Docker compose file to avoid issues.
If you have a custom setup, make sure to send a SIGTERM to your node and wait at least 30 minutes for it to drain.

## Switch networks between test net and main net

If you want to switch your node from Saturn's test network (aka `test`) to Saturn's main network (aka `main`), or vice versa, follow these steps:

1. Gracefully halt your node as explained in [Stopping a node](#stopping-a-node).
2. Set the network environment variable `SATURN_NETWORK` to `main`, or `test`, in your `$SATURN_HOME/.env` file (default: `$HOME/.env`).
3. Delete contents in `$SATURN_HOME/shared/ssl` (default: `$HOME/shared/ssl`).
4. Start the node again with `docker compose -f $SATURN_HOME/docker-compose.yml up -d`.
5. Check logs with `docker logs -f saturn-node`

## Node operator guide

For answers to common questions about operating a node, like about receiving your filecoin payouts, see the L1 node [FAQ](docs/faq.md) page.

### Obtaining a Filecoin wallet address

You need to own a Filecoin wallet to receive FIL payments.

- [Official Filecoin wallet documentation](https://docs.filecoin.io/get-started/overview/#wallets)

- If you have an account on a Centralized Exchange (Coinbase, Binance, etc.) that supports Filecoin,
  go through the steps to deposit Filecoin and you'll be given an wallet address. This is recommended
  if you don't want to manage your wallet's seed phrase.

- Web wallets
  - [Filfox wallet](https://wallet.filfox.info/)
  - [Glif](https://wallet.glif.io/) - Supports Ledger
- Desktop wallets
  - [Exodus](https://www.exodus.com/)
- Mobile wallets
  - [FoxWallet](https://foxwallet.com/)

⚠️ Please follow crypto wallet best practices. Never share your seed phrase with anyone or enter it into websites.
The Saturn team will **never** DM you or ask you to verify/validate/upgrade your wallet. If you need assistance,
please ask in public channels such as the [#filecoin-saturn](https://filecoinproject.slack.com/archives/C03DH0BL02E)
Slack.

### Receiving FIL payments

When payments are scheduled to be sent out, your Filecoin wallet will receive a FIL payment.

### Node monitoring

- https://dashboard.strn.network - View historical data on your bandwidth contributions, FIL earnings, and more.
- https://orchestrator.strn.pl/stats - View detailed, real-time stats on every Saturn node.

## License

Dual-licensed under [MIT](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-APACHE)
