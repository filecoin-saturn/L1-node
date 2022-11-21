#!/bin/bash

# patch DNS to use the ones the host passed to docker
# we grab the top two, so we don't potentially load balance over a ton of resolvers
# IPv4 regexp ref - https://www.shellhacks.com/regex-find-ip-addresses-file-grep/
host_resolvers="$(grep nameserver /etc/resolv.conf | awk '{print $2}' | grep -E '(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)' | head -n2 | tr '\n' ' ')"
if [ -n "$host_resolvers" ]; then
  sed -i'' -e "s/resolver\s.*\s/resolver $host_resolvers/" /etc/nginx/confs/tls_proxy.conf
fi

echo "$(date -u) [container] booting"
echo "$(date -u) [container] CPUs: $(nproc --all)"
echo "$(date -u) [container] Memory: $(awk '(NR<4)' /proc/meminfo | tr -d '  ' | tr '\n' ' ')"
echo "$(date -u) [container] Disk: $(df -h /usr/src/app/shared | awk '(NR>1)')"
[ -f /sys/block/sda/queue/rotational ] && echo "$(date -u) [container] SDD: $([ "$(cat /sys/block/sda/queue/rotational)" == "0" ] && echo 'true' || echo 'false')"
[ -f /sys/block/vda/queue/rotational ] && echo "$(date -u) [container] SDD: $([ "$(cat /sys/block/vda/queue/rotational)" == "0" ] && echo 'true' || echo 'false')"

# Create if not exists
mkdir -p /usr/src/app/shared/ssl

L1_CONF_FILE=/etc/nginx/conf.d/L1.conf

# If we have a cert, start the shim and nginx, else just the shim
if [ -f "/usr/src/app/shared/ssl/node.crt" ]; then
  echo "$(date -u) [container] SSL config available, starting TLS nginx and node shim";
  cp /etc/nginx/confs/tls_proxy.conf $L1_CONF_FILE;
else
  echo "$(date -u) [container] SSL config unavailable, starting non-TLS nginx and node shim";
  cp /etc/nginx/confs/non_tls_proxy.conf $L1_CONF_FILE;
fi

if [ -n "$IPFS_GATEWAY_ORIGIN" ]; then
  sed -i "s@https://ipfs.io;@$IPFS_GATEWAY_ORIGIN;@g" /etc/nginx/conf.d/shared.conf;
fi

nginx -g "daemon off;" &
exec node bin/shim.js
