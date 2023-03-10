# Block a CID

By default, Saturn L1s block all CIDs in the [Bad Bits List](https://badbits.dwebops.pub/).

Occasionally, you may need to block a particular CID from being served in addition to the Bad Bits List, e.g. because of phishing. To do this:

1. SSH into your machine(s).
2. Create a file containing the CIDs to block (e.g. `cids_to_block`). For example:

```
QmeYDGLpQXPQvVk1DiHyoqt7ft7eavkLZhC9rRoV58wZYU
zdj7WmdTdmtFzs1oD3vxTFbgDigJ6K6JUAUS1bgXEC9taWTiQ
QmaHAW65Gqx3pUW44aDnRM18mDjEu2uGaunriUL3sgA87d
zdj7WhNQsX98KRehBoyoKBQHiqhPRvgcaKQTECPPGiih7j2HZ
```

3. Note that there are two [CID formats](https://docs.ipfs.tech/concepts/content-addressing/#cid-versions): [v0](https://docs.ipfs.tech/concepts/content-addressing/#version-0-v0) and [v1](https://docs.ipfs.tech/concepts/content-addressing/#version-1-v1). So, to be rigorous, you likely want to block both the CID v0 and CID v1 formats, as both formats represent to the same content. Luckily, it's trivial to derive one format from the other with the [js-cid](https://github.com/multiformats/js-cid) package:

   ```javascript
   // npm i --save cids
   const CID = require("cids");

   const cl = console.log;

   const cid = new CID("bafybeig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu");
   cl("v0", cid.toV0());
   cl("v1", cid.toV1());
   ```

4. Then, with the `cids_to_block` file populated with CIDs, one per line, in the current directory, run:

```bash
cat cids_to_block | xargs -I{} docker exec -t $(docker ps -qf "name=saturn-node") /bin/sh -c 'echo "location ~ \"{}\" { return 403; }" >> /etc/nginx/denylist.conf && kill -s HUP $(cat /var/run/nginx.pid)'
```

This command appends the CIDs to block to the existing `denylist.conf` file and gracefully reloads nginx. Your node will not go offline, and there will be no impact on your node's performance or earnings.

Please note that these changes will not outlast the next L1 version update and will thus need to be re-applied after an L1 version update. We plan to add persistent CID blocks in the future.

5. Verify that the intended CIDs are indeed blocked. For e.g.:

```bash
curl -skw '%{http_code}\n' https://{$YOUR_NODE_IP}/ipfs/QmeYDGLpQXPQvVk1DiHyoqt7ft7eavkLZhC9rRoV58wZYU --output /dev/null
```

This will return 403 if the block was successful.

Once blocked on your node, if this CID should also be blocked across the network, e.g. for phishing, please report the CID(s) to the Bad Bits List [here](https://badbits.dwebops.pub/#reporting).
