import promClient from 'prom-client'

promClient.collectDefaultMetrics()
export const socketIOConnectionsCountMetric = new promClient.Gauge({
  name: 'socketio_connections_count',
  help: 'socket.io current connections count',
})

export const socketIOConnectionsCountTotalMetric = new promClient.Counter({
  name: 'socketio_connections_total',
  help: 'socket.io total connections count',
})

export { promClient }
