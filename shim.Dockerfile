FROM docker.io/library/debian:latest AS build

# Install dependencies
RUN apt-get update && apt-get install -y \
  curl \
  bash \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
 && curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash - \
 && apt-get install --no-install-recommends -y \
 nodejs \
 speedtest \
 && rm -rf /var/lib/apt/lists/*

ARG TARGETPLATFORM
ARG LASSIE_VERSION
RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then ARCHITECTURE=amd64; \
  elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then ARCHITECTURE=arm64; \
  else ARCHITECTURE=386; fi \
  && curl -sS -L -o lassie.tar.gz "https://github.com/filecoin-project/lassie/releases/download/${LASSIE_VERSION}/lassie_$(echo "$LASSIE_VERSION" | cut -c 2-)_linux_${ARCHITECTURE}.tar.gz" \
  && tar -C /usr/bin -xzf lassie.tar.gz

# create the directory inside the container
WORKDIR /usr/src/app

ENV LASSIE_EVENT_RECORDER_AUTH=$LASSIE_EVENT_RECORDER_AUTH
# Use random peerId until this is fixed https://github.com/filecoin-project/lassie/issues/191
ENV LASSIE_EXCLUDE_PROVIDERS="QmcCtpf7ERQWyvDT8RMYWCMjzE74b7HscB3F8gDp5d5yS6"

ENV LASSIE_ADDRESS=0.0.0.0
ENV LASSIE_PORT=7766
ENV LASSIE_ORIGIN=http://0.0.0.0:$LASSIE_PORT
ENV LASSIE_SP_ELIGIBLE_PORTION=0.05
ENV LASSIE_TEMP_DIRECTORY=/usr/src/app/shared/lassie
ENV LASSIE_MAX_BLOCKS_PER_REQUEST=10000
ENV LASSIE_LIBP2P_CONNECTIONS_LOWWATER=2000
ENV LASSIE_LIBP2P_CONNECTIONS_HIGHWATER=3000
ENV LASSIE_EXPOSE_METRICS=true
ENV LASSIE_METRICS_PORT=7776
ENV LASSIE_METRICS_ADDRESS=0.0.0.0
ENV LASSIE_SUPPORTED_PROTOCOLS="bitswap,graphsync,http"

# copy the package.json files from local machine to the workdir in container
COPY container/shim/package*.json ./
# run npm install to install all the dependencies for the shim
RUN npm ci --production --ignore-scripts
# copy the generated modules and all other files to the container
COPY --chmod=0744 shim_start.sh ./
COPY container/shim ./

CMD ["./shim_start.sh"]
