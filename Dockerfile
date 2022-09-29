ARG NGINX_VERSION="1.23.1"
ARG NGINX_NAME="nginx-${NGINX_VERSION}"

FROM debian AS build

ARG NGINX_VERSION
# https://hg.nginx.org/nginx
ARG NGINX_BRANCH=default
ARG NGINX_COMMIT=ba5cf8f73a2d
# https://github.com/google/ngx_brotli
ARG NGX_BROTLI_COMMIT=6e975bcb015f62e1f303054897783355e2a877dc
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

RUN echo "Cloning nginx and building $NGINX_VERSION (rev $NGINX_COMMIT from '$NGINX_BRANCH' branch)" \
 && hg clone -b $NGINX_BRANCH --rev $NGINX_COMMIT https://hg.nginx.org/nginx-quic /usr/src/nginx-$NGINX_VERSION \
 && cd /usr/src/nginx-$NGINX_VERSION \
 && ./auto/configure $CONFIG \
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
