FROM node:12

COPY ./ /memebattle
WORKDIR /memebattle

RUN yarn