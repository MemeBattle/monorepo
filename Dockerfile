FROM node:14-slim

COPY ./ /memebattle
WORKDIR /memebattle

#RUN npm config set registry "http://registry.npmjs.org"
#RUN yarn config set registry "http://registry.npmjs.org"
RUN yarn
RUN yarn run common-packages:build
