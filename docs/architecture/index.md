# Architecture

## Git Files

### Container

#### nginx

`container/nginx/` contains the nginx configuration of the caching proxy

#### Shim

`container/shim/` contains the necessary code to fetch CIDs and CAR files
for nginx to cache

### Docs

The `docs/` directory contains the documentation of the project
for both developers and node operators.

### Playbooks

The `playbooks/` directory contains the ansible playbooks to deploy a node.

### Scripts

The `scripts/` directory contains the scripts to build and run a node.

## Storage

[Architecture > Storage](./storage.md) documents the files and directories
of the container at runtime.
