# Cache

## Permissions

If you have copied your cache from one node to another, you might end up with improper permissions on the files in the Nginx cache directory, located in `shared/nginx_cache`.

To check if your node has this problem:

```bash
cd ${SATURN_HOME:-$HOME}
grep 'Permission denied' shared/nginx_log/error.log
```

A problem is indicated if you see something like:

```
2023/03/06 20:01:15 [crit] 58#58: *2535 open() "/usr/src/app/shared/nginx_cache/1c/21/7d71433399699071d23d4037d1ff211c.0000002747" failed (13: Permission denied) while reading upstream ...
```

To fix this, simply run the following:

```bash
docker-compose exec saturn-node chown -R nginx.nginx shared/nginx_cache
```

This assumes your node is already running. If it has been stopped, then change the `exec` to `run`.

This is the _proper_ way to set your cache permissions. Do not set your cache folder to mode 777, as this makes your node vulnerable to security exploits.
