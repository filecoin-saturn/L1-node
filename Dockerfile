ARG NGINX_VERSION="1.23.1"
ARG NGINX_NAME="nginx-${NGINX_VERSION}"

FROM debian AS build

ARG NGINX_VERSION
# https://hg.nginx.org/nginx
ARG NGINX_BRANCH=default
ARG NGINX_COMMIT=ba5cf8f73a2d
# https://github.com/cloudflare/quiche
ARG QUICHE_COMMIT=2d512e92f81d98b4369bfe67c1365de118169081
# https://github.com/google/ngx_brotli
ARG NGX_BROTLI_COMMIT=6e975bcb015f62e1f303054897783355e2a877dc
# https://github.com/quictls/openssl
ARG QUICTLS_COMMIT=75e940831d0570d6b020cfebf128ae500f424867
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
 --with-openssl=/usr/src/quiche/quiche/deps/boringssl \
 --with-quiche=/usr/src/quiche \
 --with-mail \
 --with-mail_ssl_module \
 --with-stream \
 --with-stream_realip_module \
 --with-stream_ssl_module \
 --with-stream_ssl_preread_module \
 --with-compat \
 --add-dynamic-module=/usr/src/ngx_brotli"

# Install dependencies
# we need an up-to-date cargo
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
 && rm -rf /var/lib/apt/lists/* \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

WORKDIR /usr/src

RUN echo "Cloning brotli $NGX_BROTLI_COMMIT" \
 && mkdir /usr/src/ngx_brotli \
 && cd /usr/src/ngx_brotli \
 && git init \
 && git remote add origin https://github.com/google/ngx_brotli.git \
 && git fetch --depth 1 origin $NGX_BROTLI_COMMIT \
 && git checkout --recurse-submodules -q FETCH_HEAD \
 && git submodule update --init --depth 1

# using boringssl here
RUN echo "Cloning and getting the quiche patches $QUICHE_COMMIT" \
 && git clone --recursive https://github.com/cloudflare/quiche \
 && cd /usr/src/quiche \
 && git checkout --recurse-submodules $QUICHE_COMMIT \
 && cd /usr/src \
 && wget -q https://raw.githubusercontent.com/kn007/patch/1062e64ead7e1b21a52392cdd02d1d5bc631d231/nginx_with_quic.patch \
 && wget -q https://raw.githubusercontent.com/kn007/patch/cd03b77647c9bf7179acac0125151a0fbb4ac7c8/Enable_BoringSSL_OCSP.patch

ENV PATH="/root/.cargo/bin:$PATH"
RUN echo "Cloning nginx and building $NGINX_VERSION (rev $NGINX_COMMIT from '$NGINX_BRANCH' branch)" \
 && hg clone -b $NGINX_BRANCH --rev $NGINX_COMMIT https://hg.nginx.org/nginx-quic /usr/src/nginx-$NGINX_VERSION \
 && cd /usr/src/nginx-$NGINX_VERSION \
 && patch -p01 < /usr/src/nginx_with_quic.patch \
 && patch -p01 < /usr/src/Enable_BoringSSL_OCSP.patch \
 && echo "[net]\ngit-fetch-with-cli = true" > /root/.cargo/config.toml \
 && ./auto/configure $CONFIG --build="quiche-$(git --git-dir=/usr/src/quiche/.git rev-parse --short HEAD)" \
 && make \
 && make install

FROM nginx:${NGINX_VERSION}

ARG NGINX_NAME

COPY --from=build /usr/sbin/nginx /usr/sbin/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/

# RUN curl -fsSL https://install.speedtest.net/app/cli/install.deb.sh | bash -
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
 && curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash - \
 && apt-get install --no-install-recommends -y \
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

# need nginx to find the openssl libs
ENV LD_LIBRARY_PATH=/usr/lib/nginx/modules
ENV NODE_VERSION="${RUN_NUMBER}_${GIT_COMMIT_HASH}"
ENV ORCHESTRATOR_URL=$ORCHESTRATOR_URL
ENV SATURN_NETWORK=$SATURN_NETWORK
ENV DEBUG node*

# the command that starts our app
CMD ["./start.sh"]
