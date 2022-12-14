# How to block CIDs in the nginx denylist

1. Get both v0 and v1 version of the CID. You can read the [step 3 of operator manual](../block-cids.md) on blocking CIDs.
2. Create a new entry in [denylist.conf](../../container/nginx/denylist.conf) file at the end
3. Create a new release to testnet and mainnet following the [deployment process](./deployment.md)
4. Check that the build is successful and that nodes start to update to the new version
