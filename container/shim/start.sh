#!/bin/bash

# patch DNS to use the one the host passed to docker
host_resolver="$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}' | tr '\n' ' ')"
sed -i'' -e "s/resolver\s.*\s/resolver $host_resolver/" /etc/nginx/confs/tls_proxy.conf

echo $(date -u) "[container] booting"

echo $(date -u) "[container] CPUs: $(nproc)"
echo $(date -u) "[container] Memory: $(awk '(NR<4)' /proc/meminfo | tr -d '  ' | tr '\n' ' ')"
echo $(date -u) "[container] Disk: $(df -h /usr/src/app/shared | awk '(NR>1)')"
[ -f /sys/block/sda/queue/rotational ] && echo $(date -u) "[container] SDD:" $([ $(cat /sys/block/sda/queue/rotational) == "0" ] && echo 'true' || echo 'false')
[ -f /sys/block/vda/queue/rotational ] && echo $(date -u) "[container] SDD:" $([ $(cat /sys/block/vda/queue/rotational) == "0" ] && echo 'true' || echo 'false')

# Create if not exists
mkdir -p /usr/src/app/shared/ssl

L1_CONF_FILE=/etc/nginx/conf.d/L1.conf

# If we have a cert, start the shim and nginx, else just the shim
if [ -f "/usr/src/app/shared/ssl/node.crt" ]; then
  echo $(date -u) "[container] SSL config available, starting TLS nginx and node shim";
  cp /etc/nginx/confs/tls_proxy.conf $L1_CONF_FILE;
else
  echo $(date -u) "[container] SSL config unavailable, starting non-TLS nginx and node shim";
  cp /etc/nginx/confs/non_tls_proxy.conf $L1_CONF_FILE;
fi

if [ -n "$IPFS_GATEWAY_ORIGIN" ]; then
  sed -i "s@https://ipfs.io;@$IPFS_GATEWAY_ORIGIN;@g" /etc/nginx/conf.d/shared.conf;
fi

nginx -g "daemon off;" &
exec node bin/shim.js
