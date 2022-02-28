# pull the Node.js Docker image
FROM nginx:mainline

# DEPENDENCIES
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get install -y build-essential nodejs

# create the directory inside the container
WORKDIR /usr/src/app
# copy the package.json files from local machine to the workdir in container
COPY shim/package*.json ./
# run npm install in our local machine
RUN npm install

# copy the generated modules and all other files to the container
COPY shim ./
COPY nginx/*.conf /etc/nginx/conf.d/
COPY nginx/ssl/ /etc/nginx/ssl/

# our app is running on port 3001 within the container, we expose it for non-caching debugging
EXPOSE 3001
# nginx caching proxy is running on port 8443 within the container, we expose it for production usage
EXPOSE 8443

COPY scripts/start.sh ./

ENV DEBUG server

# the command that starts our app
CMD ./start.sh