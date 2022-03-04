# Gateway Station

The gateway station is the outermost system of Filecoin Saturn. It allows retrieval clients to request CIDs and byte
ranges of CIDs, returning CAR files. The gateway station returns CAR files from cache or falling back to cache stations.

## Installation

1. Have a SSL/TLS certificate and private key ready or generate it now
2. Save both files as `gateway.crt` and `gateway.key` into a directory such as `/local/path/to/ssl-config`
3. Run the docker image with
  `docker run --rm -v /local/path/to/ssl-config:/etc/nginx/ssl -p 3001:3001 -p 8443:8443 -it ghcr.io/filecoin-project/gateway-station:main`

## Developing

### Watch, build & run

Easiest way to get started: `./gateway dev`

### Build

Build the docker image with `./gateway build`

### Run

Run the docker container with `./gateway run`

### Logs

View container logs with `./gateway logs`

### Kill

Kill the docker container `./gateway kill`

## Files

#### nginx configuration

`gateway.conf` contains the nginx configuration of the caching proxy

#### Shim

`shim/` contains the necessary code to fetch CIDs and CAR files for nginx to cache 

## License

Dual-licensed under [MIT](https://github.com/filecoin-project/gateway-station/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-project/gateway-station/blob/master/LICENSE-APACHE)
