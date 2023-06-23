# Onion

This folder sets up a docker compose file which runs 3 combinations of the different layers that comprise an L1 node (plus the bifrost-gateway):

- Nginx+shim+lassie
- shim+lassie
- lassie
- bifrost-gateway plus its own L1

The goal is to be able to troubleshoot correctness issues that may lay in-between layers or that can be pinpointed to a particular layer.

## Setup

Note: runtime-associated files will end up in `$HOME/shared` if you do not have `SATURN_HOME` set up in your environment.

1. clone this repository;

2. `cd integration/onion`;

3. generate certs for the L1s by setting up [mkcert](https://github.com/FiloSottile/mkcert);

```
cd $HOME/shared/onion_l1/ssl && mkcert -key-file node.key -cert-file node.crt localhost
cd $HOME/shared/onion_bifrost_l1/ssl && mkcert -key-file node.key -cert-file node.crt localhost
```

Note: this needs to be done before booting up docker compose or the https listener for the L1s will crash.

4. `docker compose up --build -d`;

5. check logs with: `docker compose logs <service>`. if the service param is omitted then all logs will show up.

## Updating

To make sure you're running the latest nginx config and shim, make sure you merge main into this branch whenever there are updates.
For this to work properly make sure you're booting the docker compose setup with `--build`.

As for making sure lassie is up to date, update the `LASSIE_VERSION` env vars on the `docker-compose.yml` file.
