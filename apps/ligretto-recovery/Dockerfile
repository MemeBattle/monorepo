FROM gitlab.mems.fun:5005/memebattle/frontend:base as Build

WORKDIR /memebattle/apps/ligretto-recovery/
RUN yarn build

FROM nginx:latest
COPY --from Build /memebattle/apps/ligretto-recovery/build /ligretto-frontend/
