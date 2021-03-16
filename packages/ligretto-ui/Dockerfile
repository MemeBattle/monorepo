FROM ghcr.io/memebattle/monorepo:base as Build

WORKDIR /memebattle/packages/ligretto-ui/
RUN yarn build-storybook

FROM nginx:alpine
COPY --from=Build /memebattle/packages/ligretto-ui/storybook-static /ligretto-ui/
COPY --from=Build /memebattle/packages/ligretto-ui/ligretto-ui.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
