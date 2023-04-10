ARG NGINX_VERSION="1.23.3"
ARG NGINX_NAME="nginx-${NGINX_VERSION}"

FROM docker.io/library/debian:latest AS build

ARG NGINX_VERSION
# https://hg.nginx.org/nginx
ARG NGINX_BRANCH=default
ARG NGINX_COMMIT=c38588d8376b
# https://github.com/google/ngx_brotli
ARG NGX_BROTLI_COMMIT=6e975bcb015f62e1f303054897783355e2a877dc
ARG NJS_VERSION=0.7.12

# Install dependencies
RUN apt-get update && apt-get install -y \
  dpkg-dev \
  build-essential \
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
 --with-http_addition_module \
 --with-http_auth_request_module \
 --with-http_dav_module \
 --with-http_flv_module \
 --with-http_gunzip_module \
 --with-http_gzip_static_module \
 --with-http_mp4_module \
 --with-http_random_index_module \
 --with-http_realip_module \
 --with-http_secure_link_module \
 --with-http_slice_module \
 --with-http_ssl_module \
 --with-http_stub_status_module \
 --with-http_sub_module \
 --with-http_v2_module \
 --with-mail \
 --with-mail_ssl_module \
 --with-stream \
 --with-stream_realip_module \
 --with-stream_ssl_module \
 --with-stream_ssl_preread_module \
 --add-dynamic-module=/usr/src/njs/nginx \
 --add-dynamic-module=/usr/src/ngx_brotli"

RUN echo "Cloning nginx and building $NGINX_VERSION (rev $NGINX_COMMIT from '$NGINX_BRANCH' branch)" \
 && hg clone -b $NGINX_BRANCH --rev $NGINX_COMMIT https://hg.nginx.org/nginx-quic /usr/src/nginx-$NGINX_VERSION \
 && cd /usr/src/nginx-$NGINX_VERSION \
 && ./auto/configure $CONFIG \
 && make \
 && make install

FROM docker.io/library/nginx:${NGINX_VERSION}

ARG NGINX_NAME

COPY --from=build /usr/sbin/nginx /usr/sbin/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_js_module.so /usr/lib/nginx/modules/

# RUN curl -fsSL https://install.speedtest.net/app/cli/install.deb.sh | bash -
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
 && curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash - \
 && apt-get install --no-install-recommends -y \
 nodejs \
 speedtest \
 logrotate \
 jq \
 && rm -rf /var/lib/apt/lists/*

# Download lassie
ARG TARGETPLATFORM
ARG LASSIE_VERSION="v0.8.1"
RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then ARCHITECTURE=amd64; \
  elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then ARCHITECTURE=arm64; \
  else ARCHITECTURE=386; fi \
  && curl -sS -L -o lassie.tar.gz "https://github.com/filecoin-project/lassie/releases/download/${LASSIE_VERSION}/lassie-${LASSIE_VERSION}-linux-${ARCHITECTURE}.tar.gz" \
  && tar -C /usr/bin -xzf lassie.tar.gz

# create the directory inside the container
WORKDIR /usr/src/app
# copy the package.json files from local machine to the workdir in container
COPY container/shim/package*.json ./
# run npm install to install all the dependencies for the shim
RUN npm ci --production --ignore-scripts

# copy the generated modules and all other files to the container
COPY --chmod=0744 container/start.sh ./
COPY --chmod=0744 container/reload.sh ./
COPY container/shim ./
COPY container/nginx /etc/nginx/
COPY container/logrotate/* /etc/logrotate.d/
COPY container/cron/* /etc/cron.d/

# Load CIDs ban lists
RUN rm /etc/nginx/conf.d/default.conf && curl -s https://badbits.dwebops.pub/denylist.json | jq 'map({(.anchor): true}) | add' > /etc/nginx/denylist.json

# Add logrotate cronjob
RUN chmod 0644 /etc/cron.d/* && { crontab -l; cat /etc/cron.d/logrotate; } | crontab -

ARG NETWORK="local"
ARG VERSION="0_dev"
ARG VERSION_HASH="b0a8b2780294b01b0221d0f6f37f97498cc4aac1e73808a472e11d2a1919037e"
ARG ORCHESTRATOR_URL

ARG LASSIE_EVENT_RECORDER_AUTH
ARG LASSIE_EVENT_RECORDER_URL
ARG LASSIE_EXCLUDE_PROVIDERS

# need nginx to find the openssl libs
ENV LD_LIBRARY_PATH=/usr/lib/nginx/modules

# for the watchtower container update 
ENV PRE_UPDATE_WAIT_DIVISOR=3600

ENV NETWORK=$NETWORK
ENV VERSION=$VERSION
ENV VERSION_HASH=$VERSION_HASH
ENV ORCHESTRATOR_URL=$ORCHESTRATOR_URL

ENV LASSIE_EVENT_RECORDER_AUTH=$LASSIE_EVENT_RECORDER_AUTH
ENV LASSIE_EVENT_RECORDER_URL=$LASSIE_EVENT_RECORDER_URL
ENV LASSIE_EXCLUDE_PROVIDERS=$LASSIE_EXCLUDE_PROVIDERS

ENV DEBUG node*

# the command that starts our app
CMD ["./start.sh"]
