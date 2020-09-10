FROM themezv/memebattle-docker-repo:monorepobase

WORKDIR /memebattle/apps/ligretto-backend

ENV SOCKET_PORT=3005

EXPOSE $SOCKET_PORT

RUN yarn build
CMD node build/index.js