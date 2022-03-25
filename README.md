# Gateway Station

The gateway station is the outermost system of Filecoin Saturn. It allows retrieval clients to request CIDs and byte
ranges of CIDs, returning CAR files. The gateway station returns CAR files from cache or falling back to cache stations.

## Requirements

- Linux server with docker ([Instructions here](https://docs.docker.com/engine/install/#server))
- 100Mbps upload bandwidth minimum
- 4GB RAM
- 128GB Disk (SSD recommended), the great the disk size, the more you can cache and earn

## Running a gateway

1. Install docker ([Instructions here](https://docs.docker.com/engine/install/#server))
2. Authenticate docker with the GitHub Container Registry ([Instructions here](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry))
4. Run the docker image with the shim running in port 10361 and nginx in port 8443. **Set `FIL_WALLET_ADDRESS` carefully**
    ```shell
    sudo docker run -it --name gateway --restart=on-failure \
      -v /local/path/to/cache:/usr/src/app/cache \
      -v /local/path/to/ssl-config:/etc/nginx/ssl \
      -e NGINX_PORT=8443 -e FIL_WALLET_ADDRESS=myfilecoinwalletaddress \
      -e ORCHESTRATOR_URL=orchestrator.saturn-test.network:10363 \
      --network host \
      ghcr.io/filecoin-project/gateway-station:main
    ```
5. Wait for the sign up to happen with the orchestrator
6. Check everything is up with `docker logs -f gateway`

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
