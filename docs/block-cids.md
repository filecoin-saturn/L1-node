# Block a CID

By default, Saturn L1s block all CIDs in the [Bad Bits List](https://badbits.dwebops.pub/).

Occasionally, you may need to block a particular CID from being served in addition to the Bad Bits List, e.g. because of phishing. To do this:

1. SSH into your machine(s).
2. Create a file containing the CIDs to block (e.g. `cids_to_block`). For example:

```
QmeYDGLpQXPQvVk1DiHyoqt7ft7eavkLZhC9rRoV58wZYU
QmaHAW65Gqx3pUW44aDnRM18mDjEu2uGaunriUL3sgA87d
```

3. From the current directory run:

```bash
cat cids_to_block | xargs -I{} docker exec -t $(docker ps -q) /bin/sh -c 'echo "location ~ \"{}\" { return 410; }" >> /etc/nginx/denylist.conf && kill -s HUP $(cat /var/run/nginx.pid)'
```

This command appends the CIDs to block to the existing `denylist.conf` file and gracefully reloads nginx. Your node will not go offline, and there will be no impact on your node's performance or earnings.

Please note that these changes will not outlast the next L1 version update and will thus need to be re-applied after an L1 version update. We plan to add persistent CID blocks in the future.

4. Verify that the intended CIDs are indeed blocked. For e.g.:

```bash
curl -skw '%{http_code}\n' https://{$YOUR_NODE_IP}/ipfs/QmeYDGLpQXPQvVk1DiHyoqt7ft7eavkLZhC9rRoV58wZYU --output /dev/null
```

This will return 410 if the block was successful.

Once blocked on your node, if this CID should also be blocked across the network, e.g. for phishing, please report the CID(s) to the Bad Bits List [here](https://badbits.dwebops.pub/#reporting).