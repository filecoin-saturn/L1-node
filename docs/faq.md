# FAQ

## Payouts

### How am I going to receive payouts?

FIL will be sent to the registered wallet in the node, make sure to triple check it.

### How often do I receive FIL?

FIL is paid out at the end of every month. We hope to have this faster in the future.

### How are payouts calculated?

They are based on the number of retrievals and the traffic served to end users. See an estimate [here](https://strn.network/#calculateyourearnings)

## Penalties

These are the current penalties that affect both DNS weight and earned FIL:
- Slow TTFB
- Slow uploads
- Failing health checks
- High error rate
- High CPU/Memory usage

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
