# Storage Architecture

## Files & Directories in the Container

The `run.sh` script mounts `$SATURN_HOME/shared` to `/usr/src/app/shared` in the container.

This directory will contain `nodeId.txt` and `ssl/node.*` which constitute your Node's identity that you may want to backup, and `nginx_cache/` which is more "ephemeral" as it could be re-downloaded if you loose it.
