#!/bin/bash

echo $(date -u) "[container] booting"

echo $(date -u) "[container] CPUs: $(nproc)"
echo $(date -u) "[container] Memory: $(awk '(NR<4)' /proc/meminfo | tr -d '  ' | tr '\n' ' ')"
echo $(date -u) "[container] Disk: $(df -h /usr/src/app/shared | awk '(NR>1)')"
[ -f /sys/block/sda/queue/rotational ] && echo $(date -u) "[container] SDD:" $([ $(cat /sys/block/sda/queue/rotational) == "0" ] && echo 'true' || echo 'false')
[ -f /sys/block/vda/queue/rotational ] && echo $(date -u) "[container] SDD:" $([ $(cat /sys/block/vda/queue/rotational) == "0" ] && echo 'true' || echo 'false')

# Create if not exists
mkdir -p /usr/src/app/shared/ssl

# If we have a cert, start the shim and nginx, else just the shim
if [ -f "/usr/src/app/shared/ssl/node.crt" ]; then
  echo $(date -u) "[container] SSL config available, starting TLS nginx and node shim";
  cp /etc/nginx/confs/* /etc/nginx/conf.d/;
else
  rm /etc/nginx/conf.d/*.tlsconf
  echo $(date -u) "[container] SSL config unavailable, starting non-TLS nginx node shim only";
fi

nginx -g "daemon off;" &
exec node src/index.js
