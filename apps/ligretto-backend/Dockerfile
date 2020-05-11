FROM gitlab.mems.fun:5005/memebattle/frontend:base

WORKDIR /memebattle/apps/ligretto-backend

ENV SOCKET_PORT=3005

RUN yarn build
CMD node build/index.js