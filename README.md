# Gateway Station

## Installation

1. Have a SSL/TLS certificate and private key ready or generate it now
2. Save both files into a directory. E.g. `/local/path/to/ssl-config`
3. Run the docker image with
  `docker run -rm -v /local/path/to/ssl-config:/etc/nginx/ssl -p 3001:3001 -p 8443:8443 -it gateway`

## Developing

### Building

Build the docker image with `./scripts/build.sh`

### Running

Build the docker image with `./scripts/run.sh`

## Files

#### nginx configuration

`gateway.conf` contains the nginx configuration of the caching proxy

#### Shim

`shim/` contains the necessary code to fetch CIDs and CAR files for nginx to cache 

## License