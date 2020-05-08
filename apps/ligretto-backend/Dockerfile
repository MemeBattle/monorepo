FROM gitlab.mems.fun:5005/memebattle/frontend:base

WORKDIR /memebattle/apps/ligretto-backend

RUN yarn build
CMD node build/index.js