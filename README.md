# Gateway Station

The gateway station is the outermost system of Filecoin Saturn. It allows retrieval clients to request CIDs and byte
ranges of CIDs, returning CAR files. The gateway station returns CAR files from cache or falling back to cache stations.

## Requirements

- Linux server with docker ([Instructions here](https://docs.docker.com/engine/install/#server))
- 100Mbps upload bandwidth minimum
- 4GB RAM
- 128GB Disk (SSD recommended), the great the disk size, the more you can cache and earn

## Running a gateway

1. Have a SSL/TLS certificate and private key ready or generate it now
2. Save both files as `gateway.crt` and `gateway.key` into a directory such as `/local/path/to/ssl-config`
3. Run the docker image with the shim running in port 10361 and nginx in port 10362. **Set `FIL_WALLET_ADDRESS` carefully**
    ```shell
    docker run --rm -it \
      -v /local/path/to/cache:/usr/src/app/cache \
      -v /local/path/to/ssl-config:/etc/nginx/ssl \
      -e FIL_WALLET_ADDRESS=myfilecoinwalletaddress \
      --network host \
      ghcr.io/filecoin-project/gateway-station:main
    ```
4. Wait for the sign up to happen with the orchestrator
5. check your live stats and earnings at the URL printed

## Developing

### Build

Build the docker image with 
```shell
./gateway build
```

### Run

Run the docker container with 
```shell
./gateway run
```

### Build and run

```shell
./gateway build run
```

## Files

#### nginx configuration

`gateway.conf` contains the nginx configuration of the caching proxy

#### Shim

`shim/` contains the necessary code to fetch CIDs and CAR files for nginx to cache 

## License

Dual-licensed under [MIT](https://github.com/filecoin-project/gateway-station/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-project/gateway-station/blob/master/LICENSE-APACHE)
