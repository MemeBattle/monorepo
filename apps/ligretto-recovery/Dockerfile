FROM gitlab.mems.fun:5005/memebattle/frontend:base as Build

ENV REACT_APP_WEBSOCKET_HOST=https://api-new.ligretto.app
WORKDIR /memebattle/apps/ligretto-recovery/
RUN yarn build

FROM nginx:latest
COPY --from=Build /memebattle/apps/ligretto-recovery/build /ligretto-frontend/
COPY --from=Build /memebattle/apps/ligretto-recovery/ligretto-front.conf /etc/nginx/conf.d/
EXPOSE 80