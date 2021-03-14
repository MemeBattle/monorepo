FROM node:14-alpine

COPY ./ /memebattle
WORKDIR /memebattle

RUN yarn
RUN yarn run common-packages:build
