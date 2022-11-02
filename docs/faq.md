# FAQ

## Registration

### My Node fails to register with error ETIMEDOUT/EHOSTUNREACH

Please make sure your outgoing IP matches the incoming IP and ports 80 and 443 are open and public.

### My Node version is old and won't be registered

If your node falls under the minimum version, it will be kicked out and won't be registered on future attempts.
To avoid this, make sure to set up the auto-update [script](https://github.com/filecoin-saturn/L1-node/blob/main/update.sh)
as per the instructions or a tool like [Watchtower](https://containrrr.dev/watchtower/).

## Wallet

### What happens if I change my wallet address and restart?

Retrievals that have been already submitted would still be tied to the old wallet address. If there's been a security breach, please reach out to us.
