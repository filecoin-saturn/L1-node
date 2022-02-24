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
# our app is running on port 3001 within the container, so need to expose it
EXPOSE 3001
EXPOSE 8383

COPY start.sh ./

ENV DEBUG server

# the command that starts our app
CMD ./start.sh