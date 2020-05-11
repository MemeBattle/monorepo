FROM node:12

COPY ./ /memebattle
WORKDIR /memebattle

RUN yarn
RUN yarn run ligretto:shared:build
