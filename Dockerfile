# pull the Node.js Docker image
FROM nginx:mainline

# DEPENDENCIES
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get install -y build-essential nodejs

# create the directory inside the container
WORKDIR /usr/src/app
# copy the package.json files from local machine to the workdir in container
COPY container/shim/package*.json ./
# run npm install in our local machine
RUN npm install

# copy the generated modules and all other files to the container
COPY container/shim ./
COPY container/nginx/nginx.conf /etc/nginx/
COPY container/nginx/gateway.conf /etc/nginx/conf.d/
RUN rm /etc/nginx/conf.d/default.conf
COPY container/nginx/ssl/ /etc/nginx/ssl/

# accept NGINX_PORT and SHIM_PORT, defaulting them to 8443 and 3001 respectively
ARG NGINX_PORT=8443
ARG SHIM_PORT=3001

# our shim is running on SHIM_PORT (default=3001) within the container, we expose it for non-caching debugging
EXPOSE ${SHIM_PORT}

# nginx caching proxy is running on NGINX_PORT (default=8443) within the container, we expose it for production usage
EXPOSE ${NGINX_PORT}

COPY container/scripts/start.sh ./

ENV DEBUG server*

# the command that starts our app
CMD ./start.sh