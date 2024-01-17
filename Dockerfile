###########################
# Top-level Dockerfile ARGs
###########################

# https://nginx.org/
ARG NGINX_VERSION="1.24.0"
# https://nginx.org/en/docs/njs/changes.html
ARG NJS_VERSION=0.8.0
# https://github.com/google/ngx_brotli
ARG NGX_BROTLI_COMMIT=6e975bcb015f62e1f303054897783355e2a877dc
# https://nodejs.org/en
ARG NODEJS_MAJOR_VERSION="18"
# https://github.com/filecoin-project/lassie/releases
ARG LASSIE_VERSION="v0.21.0"
# https://github.com/max-lt/nginx-jwt-module
ARG NGINX_JWT_VERSION="v3.2.2"
ARG LIBJWT_VERSION=1.15.3

#############
# nginx build
#############
FROM docker.io/library/debian:bullseye AS build

ARG NGINX_VERSION
ARG NGX_BROTLI_COMMIT
ARG NJS_VERSION
ARG NGINX_JWT_VERSION
ARG LIBJWT_VERSION

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends --no-install-suggests \
    dpkg-dev \
    build-essential \
    ca-certificates \
    mercurial \
    gnupg2 \
    git \
    gcc \
    cmake \
    libpcre3 libpcre3-dev \
    zlib1g zlib1g-dev \
    openssl \
    libssl-dev \
    curl \
    unzip \
    wget \
    libxslt-dev \
    llvm-dev \
    libclang-dev \
    clang \
  && rm -rf /var/lib/apt/lists/*


# Install jwt dependencies
RUN apt-get update && apt-get install -y --no-install-recommends --no-install-suggests \
    libjansson-dev \
    autoconf \
    automake \
    libtool \
    pkg-config \
    check \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src

RUN echo "Cloning brotli $NGX_BROTLI_COMMIT" \
  && mkdir /usr/src/ngx_brotli \
  && cd /usr/src/ngx_brotli \
  && git init \
  && git remote add origin https://github.com/google/ngx_brotli.git \
  && git fetch --depth 1 origin $NGX_BROTLI_COMMIT \
  && git checkout --recurse-submodules -q FETCH_HEAD \
  && git submodule update --init --depth 1

RUN echo "Cloning njs $NJS_VERSION" \
  && mkdir /usr/src/njs \
  && cd /usr/src \
  && hg clone --rev $NJS_VERSION http://hg.nginx.org/njs /usr/src/njs \
  && cd /usr/src/njs \
  && ./configure \
  && make

RUN echo "Cloning nginx-jwt-module $NGINX_JWT_VERSION" \
  && git clone --depth 1 --branch $NGINX_JWT_VERSION https://github.com/max-lt/nginx-jwt-module.git

RUN echo "Installing libjwt $LIBJWT_VERSION" \
  && mkdir libjwt \
  && curl -sL https://github.com/benmcollins/libjwt/archive/v${LIBJWT_VERSION}.tar.gz \
   | tar -zx -C libjwt/ --strip-components=1 \
  && cd libjwt \
  && autoreconf -i \
  && ./configure \
  && make all \
  && make check \
  && make install

ARG CONFIG="--prefix=/etc/nginx \
 --sbin-path=/usr/sbin/nginx \
 --modules-path=/usr/lib/nginx/modules \
 --conf-path=/etc/nginx/nginx.conf \
 --error-log-path=/usr/src/app/shared/nginx_log/error.log \
 --http-log-path=/usr/src/app/shared/nginx_log/node-access.log \
 --pid-path=/var/run/nginx.pid \
 --lock-path=/var/run/nginx.lock \
 --user=nginx --group=nginx \
 --with-compat \
 --with-file-aio \
 --with-threads \
 --with-http_gunzip_module \
 --with-http_gzip_static_module \
 --with-http_mp4_module \
 --with-http_realip_module \
 --with-http_slice_module \
 --with-http_ssl_module \
 --with-http_stub_status_module \
 --with-http_sub_module \
 --with-http_v2_module \
 --add-dynamic-module=/usr/src/ngx_brotli \
 --add-dynamic-module=/usr/src/njs/nginx \
 --add-dynamic-module=/usr/src/nginx-jwt-module"

RUN echo "Downloading and extracting nginx $NGINX_VERSION" \
  && mkdir /usr/src/nginx \
  && curl -fsSL https://nginx.org/download/nginx-$NGINX_VERSION.tar.gz | tar -zx --strip-components=1 -C /usr/src/nginx

RUN echo "Configuring, building, and installing nginx $NGINX_VERSION" \
  && cd nginx \
  && ./configure $CONFIG \
  && make \
  && make install

###############
# nginx runtime
###############
FROM docker.io/library/nginx:${NGINX_VERSION}

ARG NODEJS_MAJOR_VERSION

SHELL ["/bin/bash", "-c"]

COPY --from=build /usr/sbin/nginx /usr/sbin/
COPY --from=build /usr/src/nginx/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/nginx/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/nginx/objs/ngx_http_js_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/lib/nginx/modules/ngx_http_auth_jwt_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/local/lib/libjwt.so /lib


# Prepare
RUN apt-get update \
  && apt-get install --no-install-recommends --no-install-suggests -y ca-certificates curl gnupg \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODEJS_MAJOR_VERSION.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
  && curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash -

# Install dependencies
RUN apt-get update \
  && apt-get install --no-install-recommends -y nodejs speedtest logrotate jq libjansson-dev \
  && rm -rf /var/lib/apt/lists/*

# Download lassie
ARG TARGETPLATFORM
ARG LASSIE_VERSION
RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then ARCHITECTURE=amd64; \
  elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then ARCHITECTURE=arm64; \
  else ARCHITECTURE=386; fi \
  && curl -sS -L -o lassie.tar.gz "https://github.com/filecoin-project/lassie/releases/download/${LASSIE_VERSION}/lassie_${LASSIE_VERSION:1}_linux_${ARCHITECTURE}.tar.gz" \
  && tar -C /usr/bin -xzf lassie.tar.gz

# Create the directory inside the container
WORKDIR /usr/src/app

# Copy the package.json files from local machine to the workdir in container
COPY container/shim/package*.json ./
# Run npm install to install all the dependencies for the shim
RUN npm ci --production --ignore-scripts

# Copy the generated modules and all other files to the container
COPY --chmod=0744 container/start.sh ./
COPY --chmod=0744 container/reload.sh ./
COPY container/shim ./
COPY container/nginx /etc/nginx/
COPY container/logrotate/* /etc/logrotate.d/
COPY container/cron/* /etc/cron.d/

# Clean up default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Load CIDs ban lists
RUN curl -s https://badbits.dwebops.pub/denylist.json | jq 'map({(.anchor): true}) | add' > /etc/nginx/denylist.json

# Add logrotate cronjob
RUN chmod 0644 /etc/cron.d/* && { crontab -l; cat /etc/cron.d/logrotate; } | crontab -

ARG NETWORK="local"
ARG VERSION="0_dev"
ARG VERSION_HASH="b0a8b2780294b01b0221d0f6f37f97498cc4aac1e73808a472e11d2a1919037e"
ARG ORCHESTRATOR_URL

ARG LASSIE_EVENT_RECORDER_AUTH
ARG LASSIE_EXCLUDE_PROVIDERS
ARG LASSIE_BITSWAP_CONCURRENCY=1000

# Need nginx to find the openssl libs
ENV LD_LIBRARY_PATH=/usr/lib/nginx/modules

# Watchtower container update max wait time
ENV PRE_UPDATE_WAIT_DIVISOR=3600

ENV NETWORK=$NETWORK
ENV VERSION=$VERSION
ENV VERSION_HASH=$VERSION_HASH
ENV ORCHESTRATOR_URL=$ORCHESTRATOR_URL

ENV LASSIE_EVENT_RECORDER_AUTH=$LASSIE_EVENT_RECORDER_AUTH
ENV LASSIE_EXCLUDE_PROVIDERS=$LASSIE_EXCLUDE_PROVIDERS
ENV LASSIE_BITSWAP_CONCURRENCY=$LASSIE_BITSWAP_CONCURRENCY

ENV DEBUG node*

# Telemetry
ARG OTEL_EXPORTER_OTLP_ENDPOINT
ARG OTEL_EXPORTER_OTLP_HEADERS
ARG OTEL_TRACES_EXPORTER="otlp"
ARG OTEL_EXPORTER_OTLP_TRACES_PROTOCOL="http/protobuf"
ENV OTEL_TRACES_EXPORTER=$OTEL_TRACES_EXPORTER
ENV OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=$OTEL_EXPORTER_OTLP_TRACES_PROTOCOL
ENV OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT
ENV OTEL_EXPORTER_OTLP_HEADERS=$OTEL_EXPORTER_OTLP_HEADERS

# the command that starts our app
CMD ["./start.sh"]
