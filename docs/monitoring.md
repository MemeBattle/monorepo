# Monitoring

MemeBattle infrastructure provide ability collect metrics from services

## Prepare service
1. Application should respond on GET /metrics with Prometheus metrics
2. Application containers should have a label `prometheus-job: service-name`
3. Container should be in `metrics-targets` network

[Example](../.deploy/ligretto.deploy.yml)
