# Manual CID Bans

Occasionally, you might need to ban a particular CID from being served (e.g. because of phishing).
To do this, you should open a PR targeting `container/nginx/denylist.conf` and add a new entry for that CID.
This is the preferred way to go, as it benefits everyone in the network from serving faulty content.

Note that the update process can take up to 1.5 hours.
If that's too long, you should go ahead and ban those CIDs from your node(s) manually.

1. Ssh into your machine(s)
2. Create a file containing the CIDs to ban (e.g. `cids_to_ban`). For example:

```
QmeYDGLpQXPQvVk1DiHyoqt7ft7eavkLZhC9rRoV58wZYU
QmaHAW65Gqx3pUW44aDnRM18mDjEu2uGaunriUL3sgA87d
```

3. From your current directory run:

```bash
cat cids_to_ban | xargs -I{} docker exec -t $(docker ps -q) /bin/sh -c 'echo "location ~ \"{}\" { return 410; }" >> /etc/nginx/denylist.conf && kill -s HUP $(cat /var/run/nginx.pid)'
```

This command fills in the `denylist.conf` file and gracefully reloads nginx.

Note that these changes won't outlast a version update. You should always open a PR, so your future self and the rest of network can benefit from your effort.

4. Check the target CIDs are indeed blocked. For e.g.:

```bash
curl -skw '%{http_code}\n' https://$YOUR_NODE_IP/ipfs/QmeYDGLpQXPQvVk1DiHyoqt7ft7eavkLZhC9rRoV58wZYU --output /dev/null
```

This should return 410 if the ban was successful.
