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
COPY container/nginx/ /etc/nginx/
RUN rm /etc/nginx/conf.d/default.conf

COPY container/scripts/start.sh ./

ENV DEBUG server*

# the command that starts our app
CMD ./start.sh