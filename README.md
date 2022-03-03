# Gateway Station

## Installation

1. Have a SSL/TLS certificate and private key ready or generate it now
2. Save both files into a directory. E.g. `/local/path/to/ssl-config`
3. Run the docker image with
  `docker run -rm -v /local/path/to/ssl-config:/etc/nginx/ssl -p 3001:3001 -p 8443:8443 -it gateway`

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
