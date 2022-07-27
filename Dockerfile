ARG NGINX_VERSION="1.23.1"
ARG NGINX_NAME="nginx-${NGINX_VERSION}"

FROM debian as build

ARG NGINX_VERSION
ARG NGINX_NAME
ARG CONFIG=" --prefix=/etc/nginx \
 --sbin-path=/usr/sbin/nginx \
 --modules-path=/usr/lib/nginx/modules \
 --conf-path=/etc/nginx/nginx.conf \
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
RUN apt-get update && apt-get install \
    dpkg-dev build-essential gnupg2 \
    git gcc cmake libpcre3 libpcre3-dev \
    zlib1g zlib1g-dev openssl libssl-dev \
    curl unzip wget libxslt-dev -y

WORKDIR /usr/src

# Install nginx + brotli module from source
RUN wget http://nginx.org/download/${NGINX_NAME}.tar.gz \
    && tar -xzvf ${NGINX_NAME}.tar.gz \
    && git clone https://github.com/google/ngx_brotli.git --recursive \
    && cd ${NGINX_NAME} \
    && ./configure $CONFIG \
    && make

FROM nginx:${NGINX_VERSION}

ARG NGINX_NAME

COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=build /usr/src/${NGINX_NAME}/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
# RUN curl -fsSL https://install.speedtest.net/app/cli/install.deb.sh | bash -
RUN curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash -
RUN apt-get install --no-install-recommends -y nodejs speedtest

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