ARG NGINX_VERSION="1.23.1"
ARG NGINX_NAME="nginx-${NGINX_VERSION}"

# https://hg.nginx.org/nginx-quic/shortlog/quic
ARG NGINX_COMMIT=98e94553ae51

# https://github.com/google/ngx_brotli
ARG NGX_BROTLI_COMMIT=6e975bcb015f62e1f303054897783355e2a877dc

# https://github.com/google/boringssl
ARG BORINGSSL_COMMIT=8ce0e1c14e48109773f1e94e5f8b020aa1e24dc5

ARG CONFIG="--prefix=/etc/nginx \
 --sbin-path=/usr/sbin/nginx \
 --modules-path=/usr/lib/nginx/modules \
 --conf-path=/etc/nginx/nginx.conf \
 --error-log-path=/var/log/nginx/error.log \
 --http-log-path=/var/log/nginx/node-access.log \
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
 --with-http_v3_module \
 --with-stream_quic_module \
 --with-mail \
 --with-mail_ssl_module \
 --with-stream \
 --with-stream_realip_module \
 --with-stream_ssl_module \
 --with-stream_ssl_preread_module \
 --with-compat \
 --add-dynamic-module=/usr/src/ngx_brotli"

FROM debian AS build

ARG NGINX_VERSION
ARG NGINX_COMMIT
ARG NGX_BROTLI_COMMIT
ARG CONFIG

# Install dependencies
RUN apt-get update && apt-get install -y \
    dpkg-dev \
    build-essential \
    mercurial \
    golang \
    ninja-build \
    gnupg2 \
    git \
    gcc \
    cmake \
    libpcre3 libpcre3-dev \
    zlib1g \
    zlib1g-dev \
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

RUN echo "Cloning and building boringssl $BORINGSSL_COMMIT" \
  && cd /usr/src \
  && git clone https://github.com/google/boringssl \
  && cd boringssl \
  && git checkout $BORINGSSL_COMMIT \
  && mkdir build \
  && cd build \
  && cmake -GNinja .. \
  && ninja

RUN echo "Cloning nginx and building $NGINX_VERSION (rev $NGINX_COMMIT from 'quic' branch)" \
  && hg clone -b quic --rev $NGINX_COMMIT https://hg.nginx.org/nginx-quic /usr/src/nginx-$NGINX_VERSION \
  && cd /usr/src/nginx-$NGINX_VERSION \
  && ./auto/configure $CONFIG \
    --with-cc-opt="-I../boringssl/include"   \
    --with-ld-opt="-L../boringssl/build/ssl -L../boringssl/build/crypto" \
  && make \
  && make install

FROM nginx:${NGINX_VERSION}

ARG NGINX_NAME

COPY --from=build /usr/sbin/nginx /usr/sbin/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
# RUN curl -fsSL https://install.speedtest.net/app/cli/install.deb.sh | bash -
RUN curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash -
RUN apt-get install --no-install-recommends -y \
   nodejs \
   speedtest \
  && rm -rf /var/lib/apt/lists/*

# create the directory inside the container
WORKDIR /usr/src/app
# copy the package.json files from local machine to the workdir in container
COPY container/shim/package*.json ./
# run npm install in our local machine
RUN npm ci --production --ignore-scripts

# copy the generated modules and all other files to the container
COPY container/shim ./
COPY container/nginx /etc/nginx/
RUN rm /etc/nginx/conf.d/default.conf

ARG RUN_NUMBER="9999"
ARG GIT_COMMIT_HASH="dev"
ARG SATURN_NETWORK="local"
ARG ORCHESTRATOR_URL

ENV NODE_VERSION="${RUN_NUMBER}_${GIT_COMMIT_HASH}"
ENV ORCHESTRATOR_URL=$ORCHESTRATOR_URL
ENV SATURN_NETWORK=$SATURN_NETWORK
ENV DEBUG node*

# the command that starts our app
CMD ["./start.sh"]