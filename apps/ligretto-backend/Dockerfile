FROM node:14-alpine

COPY ../../. /memebattle

WORKDIR /memebattle/apps/ligretto-backend

ENV SOCKET_PORT=3005

EXPOSE $SOCKET_PORT

RUN yarn build
CMD node build/index.js
