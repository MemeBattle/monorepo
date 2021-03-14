FROM node:14

COPY ./ /memebattle
WORKDIR /memebattle

RUN yarn
RUN yarn run common-packages:build
