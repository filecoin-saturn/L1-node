# pull the Node.js Docker image
FROM nginx:mainline

# DEPENDENCIES
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN curl -s https://install.speedtest.net/app/cli/install.deb.sh | bash -
RUN apt-get install --no-install-recommends -y build-essential nodejs speedtest

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

ARG RUN_NUMBER="0"
ARG GIT_COMMIT_HASH="dev"
ARG ORCHESTRATOR_URL="https://orchestrator.saturn-test.network"

ENV NODE_VERSION="${RUN_NUMBER}_${GIT_COMMIT_HASH}"
ENV ORCHESTRATOR_URL=$ORCHESTRATOR_URL
ENV DEBUG node*

# the command that starts our app
CMD ["./start.sh"]