# Services monitoring locally

1. In monorepo root run
```shell
docker-compose -f .monitoring-dev/grafana.docker-compose.yml up
```
2. Open http://0.0.0.0:3000 default credentials: admin admin
3. Add new datasource
   1. Open http://0.0.0.0:3000/datasources/new
   2. Select Prometheus
   3. Fill url field in HTTP section: `http://prometheus:9090`
   4. Press 'Save & test' button
3. On page http://0.0.0.0:3000/dashboards press 'New' -> import
4. Select some dashboard template (e.g. apps/ligretto-gameplay-backend/.monitoring-dev/dashboard.json)
5. Select prometheus datasource and press `import`

> ⓘ **Access to host server from container** <br />
> If you prefer to run node.js locally prometheus should can access to host network.
> Solution: https://docs.docker.com/desktop/networking/#i-want-to-connect-from-a-container-to-a-service-on-the-host
