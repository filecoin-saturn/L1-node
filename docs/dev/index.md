## Development

### Requirements

1. Run [orchestrator](https://github.com/filecoin-saturn/orchestrator) locally
2. Self-signed 256-bit ECC certificate ([Instructions here](docs/certificate.md)) in `shared/ssl`

### Build

Build the docker image with

```bash
./node build
```

### Run

Run the docker container with

```bash
./node run
```

### Build and run

```bash
./node build run
```
