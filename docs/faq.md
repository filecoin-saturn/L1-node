# FAQ

## Payouts

### How am I going to receive payouts?

FIL will be sent to the registered wallet in the node, make sure to triple check it.

### How often do I receive FIL?

FIL is paid out at the end of every month. We hope to have this faster in the future.

### How are payouts calculated?

The final earnings of a specific operator depend on the combination of the operator's performance and the overall performance of the network. There are three main sets of metrics that impact earnings:

1. Total bandwidth served during the payout period (in this case, the previous month)
2. TTFB and upload speed ratios. I.e., the percentage of requests where the operator was better than minimum threshold of TTFB and upload speed.
3. Uptime. I.e., the percentage of successful health checks.

At each payment window, the operators' performance is compared against the network's overall performance and a pre-defined pool of FIL is split among the participating operators. In general, the better the performance when compared with the network's average, the higher the share of rewards. However, this relationship is not linear! For more info on the exact formula, you can check the [documentation](https://hackmd.io/@cryptoecon/SJIJEUJbs/%2FMqxcRhVdSi2txAKW7pCh5Q).

We should note that the available pool of FIL to be distributed will depend on how much bandwidth is being served by the network. As the traffic grows and more operators join to meet that traffic, the higher the pot of FIL will be. This design is aimed to avoid a cannibalistic environment where network growth leads to a decrease in individual rewards. More info about the reward pool can be found [here](https://hackmd.io/@cryptoecon/SJIJEUJbs/%2FMqxcRhVdSi2txAKW7pCh5Q#Reward-pool1).

## Penalties

These are the current penalties that affect both DNS weight and earned FIL:
- Slow TTFB
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

## Wallet

### What happens if I change my wallet address and restart?

Retrievals that have been already submitted will be to listed wallet at the end of every month.
