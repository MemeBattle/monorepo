FROM node:14-alpine

COPY ./ /memebattle
WORKDIR /memebattle

RUN apk add --no-cache git
RUN yarn --network-timeout 100000
RUN yarn run common-packages:build
