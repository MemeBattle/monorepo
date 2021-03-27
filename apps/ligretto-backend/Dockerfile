FROM node:14-alpine

COPY ./build /ligretto-backend

WORKDIR /ligretto-backend

ENV SOCKET_PORT=3005

EXPOSE $SOCKET_PORT

CMD node index.js
