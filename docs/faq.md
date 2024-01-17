# FAQ

## Requirements

### Why is 10 Gbps uplink required?

**It's important to note that the 10 Gbps does NOT need to be dedicated, the uplink can be burstable/shared**

Saturn is a Content Delivery Network (CDN) that serves thousands of clients. With the increasing bandwidth of fixed home connections, some which exceed 1 Gbps, we want to avoid scenarios of slow downloads to clients. Keys points on this decision:

- We want to avoid scenarios where a handful of clients saturate a single L1 node.
- We started with a higher requirement and decrease it as we measure things and improve user-to-node routing. Better to allow more operators in the future when requirement is lowered, than to kick "slow" ones if it were to increase.

We are continuously looking at the requirements and multiple factors, such as geolocation, we'll be taking into consideration soon to allow emerging markets, where 10 Gbps is not common, to join Saturn.

## Payouts

### When can I claim my FIL earnings?

Each month, your node's earnings, in FIL, are calculated by the network based on various factors such as the amount of bandwidth it served, the number of requests it handled, its performance metrics like TTFB and upload speed, and its availaility and uptime. These earnings are then sent to a payout FVM smart contract by the 7th day of the following month, after which they can be claimed. For example, earnings for December 2022 would be transferred to a payout smart contract by January 7th, 2023. Once transferred to the payout smart contract, they can be claimed on [payouts.saturn.tech](https://payouts.saturn.tech).

### How do I claim my payout?

Once your earnings have been transferred to the monthly payout smart contract, which happens by the 7th day of the following month, they can be claimed on [payouts.saturn.tech](https://payouts.saturn.tech).

Triple check that the wallet address in `FIL_WALLET_ADDRESS` is correct; earnings earmarked under the wrong address in the payout smart contract can't be changed to be claimed by a different wallet address.

### I'm already a Filecoin storage provider, how does it work with my existing nodes, wallets, etc.?

Saturn runs independent of storage, we suggest a clean (virtual) server to run Saturn.

### How are payouts calculated?

The final earnings of a specific operator depend on the combination of the operator's performance and the overall performance of the network. There are three main sets of metrics that impact earnings:

1. Total bandwidth served during the payout period (in this case, the previous month)
2. TTFB and upload speed ratios. I.e., the percentage of requests where the operator was better than minimum threshold of TTFB and upload speed.
3. Uptime. I.e., the percentage of successful health checks.

At each payment window, the operators' performance is compared against the network's overall performance and a pre-defined pool of FIL is split among the participating operators. In general, the better the performance when compared with the network's average, the higher the share of rewards. However, this relationship is not linear! For more info on the exact formula, you can check the [documentation](https://hackmd.io/@cryptoecon/SJIJEUJbs/%2FMqxcRhVdSi2txAKW7pCh5Q).

We should note that the available pool of FIL to be distributed will depend on how much bandwidth is being served by the network. As the traffic grows and more operators join to meet that traffic, the higher the pot of FIL will be. This design is aimed to avoid a cannibalistic environment where network growth leads to a decrease in individual rewards. More info about the reward pool can be found [here](https://hackmd.io/@cryptoecon/SJIJEUJbs/%2FMqxcRhVdSi2txAKW7pCh5Q#Reward-pool1).

### What happens when a node commits fraud?

If a node commits fraud -- e.g. falsely reporting speed tests, node stats, logs, and/or committing any other fraudulent activity -- as detected by the network:

1. All earnings associated with that node's wallet address are immediately and automatically forfeited and returned the network.
2. All future earnings are halted.

## Penalties

These are the current penalties that affect both DNS weight and earned FIL:

- Slow time for first byte (TTFB)
- Slow uploads
- Failing health checks
- High error rate
- High CPU/Memory usage
- Fraudulent logging (e.g. self-dealing)
- Multi-noding (Running multiple nodes on the same host)

## Registration

### My Node fails to register with error ETIMEDOUT/EHOSTUNREACH

Please make sure your outgoing IP matches the incoming IP and ports 80 and 443 are open and public.

### My Node version is old and won't be registered

If your node falls under the minimum version, it will be kicked out and won't be registered on future attempts.
To avoid this, make sure you're running [Watchtower](https://containrrr.dev/watchtower/) as [per the instructions](https://github.com/filecoin-saturn/L1-node#update-a-node).

If you've fallen too far behind and can't register, make sure to run `docker pull ghcr.io/filecoin-saturn/l1-node:main`.

**You should update your node to the latest version within 4 hours of the last release.**

### Can I run multiple nodes?

Yes, multiple nodes can be ran pointing to the same wallet and email address, just follow the same setup instructions on each host.

⚠️ We do **NOT** allow multiple nodes on the same host. Each node should run on its own hardware. ⚠️

We don't recommend running multiple nodes in the same region (country) as cache will be fragmented, increasing the TTFB and error rate.
Also for the same region (country) the DNS weight will just compete with each other.

### How can I manually deregister my node?

If your node didn't gracefully shutdown and you need to manually deregister the node, from the host (same IP as the node):

Send an HTTP POST to https://orchestrator.strn.pl/deregister with the `Content-Type` header set to `application/json` and the following body:

```json
{ "nodeId": "<NODE ID>" }
```

If this returns `{"error":"Unable to deregister"}` then you may have used the "short" (8 character) instead of "long" (36 character) Node ID.
Note that the _Failed registration: Node ... cannot register with newer version 1044_4292ce7 without deregistering first. Please make sure to set up graceful version upgrades._
start-up error, which is what typically triggers having to do this, prints the short instead of the long Node ID.

If this returns `{"error":"Invalid nodeId"}` then the syntax is wrong for another reason.

Using [`curl`](https://curl.se) this can be done with `curl -X POST https://orchestrator.strn.pl/deregister -H 'Content-Type: application/json' -d '{ "nodeId": "12345678-a3fa-3a10-a123-987e6b543c21" }'`.

## Wallet

### What happens if I change my wallet address and restart?

Retrievals that have already been submitted will be paid to the configured wallet address at the end of every month.

### How can I change my wallet address?

1. Set the new wallet address in the `FIL_WALLET_ADDRESS` environment variable of your `$SATURN_HOME/.env` file
2. Gracefully stop your node
3. Restart your L1 node and check in the logs that the new wallet address is set

### When can I change my wallet address?

You can change your wallet address anytime before the end of the month, as payouts are processed next day (1st of next month)
