FROM node:14

COPY ./ /memebattle
WORKDIR /memebattle

#RUN npm config set registry "http://registry.npmjs.org"
#RUN yarn config set registry "http://registry.npmjs.org"
RUN yarn --network-timeout 100000
RUN yarn run common-packages:build
