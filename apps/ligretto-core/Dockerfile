FROM node:14-alpine

COPY build /ligretto-core

WORKDIR /ligretto-core

RUN yarn install --production

CMD node server.js
