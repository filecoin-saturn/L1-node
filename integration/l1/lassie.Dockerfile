FROM docker.io/library/debian:latest AS build

# Install dependencies
RUN apt-get update && apt-get install -y \
  curl \
  bash \
 && rm -rf /var/lib/apt/lists/*

ARG TARGETPLATFORM="linux/arm64"
ENV LASSIE_VERSION="v0.12.1"
RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then ARCHITECTURE=amd64; \
  elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then ARCHITECTURE=arm64; \
  else ARCHITECTURE=386; fi \
  && curl -sS -L -o lassie.tar.gz "https://github.com/filecoin-project/lassie/releases/download/${LASSIE_VERSION}/lassie_$(echo "$LASSIE_VERSION" | cut -c 2-)_linux_${ARCHITECTURE}.tar.gz" \
  && tar -C /usr/bin -xzf lassie.tar.gz

# create the directory inside the container
WORKDIR /usr/src/app

# ENV LASSIE_EVENT_RECORDER_URL="https://lassie-event-recorder.dev.cid.contact/v2/retrieval-events"
# ARG LASSIE_EVENT_RECORDER_AUTH
# ENV LASSIE_EVENT_RECORDER_INSTANCE_ID="$(cat /usr/src/app/shared/nodeId.txt)"

ENV LASSIE_EVENT_RECORDER_AUTH=$LASSIE_EVENT_RECORDER_AUTH
# Use random peerId until this is fixed https://github.com/filecoin-project/lassie/issues/191
ENV LASSIE_EXCLUDE_PROVIDERS="QmcCtpf7ERQWyvDT8RMYWCMjzE74b7HscB3F8gDp5d5yS6"

ENV LASSIE_ADDRESS=0.0.0.0
ENV LASSIE_PORT=7766
ENV LASSIE_ORIGIN=http://0.0.0.0:$LASSIE_PORT
ENV LASSIE_SP_ELIGIBLE_PORTION=0.05
ENV LASSIE_TEMP_DIRECTORY=/usr/src/app/shared
ENV LASSIE_MAX_BLOCKS_PER_REQUEST=10000
ENV LASSIE_LIBP2P_CONNECTIONS_LOWWATER=2000
ENV LASSIE_LIBP2P_CONNECTIONS_HIGHWATER=3000
ENV LASSIE_CONCURRENT_SP_RETRIEVALS=1
ENV LASSIE_EXPOSE_METRICS=true
ENV LASSIE_METRICS_PORT=7776
ENV LASSIE_METRICS_ADDRESS=0.0.0.0
ENV LASSIE_SUPPORTED_PROTOCOLS="bitswap,graphsync,http"

ENTRYPOINT ["lassie"]
CMD ["daemon"]
