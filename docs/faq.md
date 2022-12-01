# FAQ

## Requirements

### Why is 10 Gbps uplink required?

**It's important to note that the 10 Gbps does NOT need to be dedicated, the uplink can be burstable/shared**

Saturn is a Content Delivery Network (CDN) that serves thousands of clients. With the increasing bandwidth of fixed home connections, some which exceed 1 Gbps, we want to avoid scenarios of slow downloads to clients. Keys points on this decision:

- We want to avoid escenarios where a handful of clients saturate a single L1 node.
- We started with a higher requirement and decrease it as we measure things and improve user-to-node routing. Better to allow more operators in the future when requirement is lowered, than to kick "slow" ones if it were to increase.

We are continuously looking at the requirements and multiple factors, such as geolocation, we'll be taking into consideration soon to allow emerging markets, where 10 Gbps is not common, to join Saturn.

## Payouts

### How am I going to receive payouts?

FIL will be sent to the registered wallet in the node, make sure to triple check it.

### How often do I receive FIL?

FIL is paid out at the end of every month. We hope to have this faster in the future.

### I'm already a Filecoin storage provider, how does it work with my existing nodes, wallets, etc.?

Saturn runs independent of storage, we suggest a clean (virtual) server to run Saturn.

### How are payouts calculated?

The final earnings of a specific operator depend on the combination of the operator's performance and the overall performance of the network. There are three main sets of metrics that impact earnings:

1. Total bandwidth served during the payout period (in this case, the previous month)
2. TTFB and upload speed ratios. I.e., the percentage of requests where the operator was better than minimum threshold of TTFB and upload speed.
3. Uptime. I.e., the percentage of successful health checks.

At each payment window, the operators' performance is compared against the network's overall performance and a pre-defined pool of FIL is split among the participating operators. In general, the better the performance when compared with the network's average, the higher the share of rewards. However, this relationship is not linear! For more info on the exact formula, you can check the [documentation](https://hackmd.io/@cryptoecon/SJIJEUJbs/%2FMqxcRhVdSi2txAKW7pCh5Q).

We should note that the available pool of FIL to be distributed will depend on how much bandwidth is being served by the network. As the traffic grows and more operators join to meet that traffic, the higher the pot of FIL will be. This design is aimed to avoid a cannibalistic environment where network growth leads to a decrease in individual rewards. More info about the reward pool can be found [here](https://hackmd.io/@cryptoecon/SJIJEUJbs/%2FMqxcRhVdSi2txAKW7pCh5Q#Reward-pool1).

## Penalties

These are the current penalties that affect both DNS weight and earned FIL:
- Slow time fo first byte (TTFB)
- Slow uploads
- Failing health checks
- High error rate
- High CPU/Memory usage
- Fraudulent logging (e.g. self-dealing)

## Registration

### My Node fails to register with error ETIMEDOUT/EHOSTUNREACH

Please make sure your outgoing IP matches the incoming IP and ports 80 and 443 are open and public.

### My Node version is old and won't be registered

If your node falls under the minimum version, it will be kicked out and won't be registered on future attempts.
To avoid this, make sure to set up the auto-update [script](https://github.com/filecoin-saturn/L1-node/blob/main/update.sh)
as per the instructions or a tool like [Watchtower](https://containrrr.dev/watchtower/).

**You should update your node to the latest version within 24 hours of the last release.**

### How do I run multiple nodes?

Yes, multiple nodes can be ran pointing to the same wallet and email address, just follow the same setup instructions on each node. However, we don't recommended running multiple nodes in the same location as cache will be fragmented, increasing the TTFB and error rate. Also for the same region the DNS weight will just compete.

## Wallet

### What happens if I change my wallet address and restart?

Retrievals that have been already submitted will be to paid to the configured wallet address at the end of every month.

### How can I change my wallet address?

1. Set the new wallet address in the `FIL_WALLET_ADDRESS` environmental variable in `.bashrc` and `/etc/environment`
2. Load the new variable
3. Gracefully stop your node
4. Restart your L1 node and check in the logs that the new wallet address is set

### When I change my wallet address?

You can change your wallet address anytime before the end of the month, as payouts are processed next day (1st of next month)
