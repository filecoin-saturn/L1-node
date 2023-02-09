#!/bin/bash
set -eou pipefail

# patch DNS to use the ones the host passed to docker
# we grab the top two, so we don't potentially load balance over a ton of resolvers
# IPv4 regexp ref - https://www.shellhacks.com/regex-find-ip-addresses-file-grep/
host_resolvers="$(grep nameserver /etc/resolv.conf | awk '{print $2}' | grep -E '(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)' | head -n2 | tr '\n' ' ')"
if [ -n "$host_resolvers" ]; then
  sed -i'' -e "s/resolver\s.*\s/resolver $host_resolvers/" /etc/nginx/confs/tls_proxy.conf
fi

if [ ! -f "/usr/src/app/shared/nodeId.txt" ]; then
  cat /proc/sys/kernel/random/uuid > /usr/src/app/shared/nodeId.txt
fi

echo "$(date -u) [container] Booting L1 $(cat /usr/src/app/shared/nodeId.txt)"
echo "$(date -u) [container] CPUs: $(nproc --all)"
echo "$(date -u) [container] Memory: $(awk '(NR<4)' /proc/meminfo | tr -d '  ' | tr '\n' ' ')"
echo "$(date -u) [container] Disk: $(df -h /usr/src/app/shared | awk '(NR>1)')"
[ -f /sys/block/sda/queue/rotational ] && echo "$(date -u) [container] SDD: $([ "$(cat /sys/block/sda/queue/rotational)" == "0" ] && echo 'true' || echo 'false')"
[ -f /sys/block/vda/queue/rotational ] && echo "$(date -u) [container] SDD: $([ "$(cat /sys/block/vda/queue/rotational)" == "0" ] && echo 'true' || echo 'false')"

# Create if not exists
mkdir -p /usr/src/app/shared/ssl
mkdir -p /usr/src/app/shared/nginx_log

L1_CONF_FILE=/etc/nginx/conf.d/L1.conf

# If we have a cert, start nginx with TLS, else without (but always start the shim)
if [ -f "/usr/src/app/shared/ssl/node.crt" ]; then
  echo "$(date -u) [container] SSL config available, starting TLS nginx and node shim";
  cp /etc/nginx/confs/tls_proxy.conf $L1_CONF_FILE;
else
  echo "$(date -u) [container] SSL config unavailable, starting non-TLS nginx and node shim";
  cp /etc/nginx/confs/non_tls_proxy.conf $L1_CONF_FILE;
fi

sed -i "s@\$node_id@$(cat /usr/src/app/shared/nodeId.txt)@g" /etc/nginx/conf.d/shared.conf

if [ -n "${IPFS_GATEWAY_ORIGIN:-}" ]; then
  sed -i "s@https://ipfs.io;@$IPFS_GATEWAY_ORIGIN;@g" /etc/nginx/conf.d/shared.conf;
fi

nginx -g "daemon off;" &

if [ "$LASSIE_ORIGIN" != "" ]; then
  lassie daemon -p 7766 &
  LASSIE_PID=$!

  exec node --max-old-space-size=2048 src/bin/shim.js &
  SHIM_PID=$!

  wait -n $LASSIE_PID $SHIM_PID
  exit $?
else
  exec node src/bin/shim.js
fi
