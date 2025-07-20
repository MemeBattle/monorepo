{{- /*
# How to create dockerconfigjson content:
# 1. Create a GitHub Personal Access Token (PAT) with 'read:packages' scope
# 2. run: `kubectl create secret docker-registry github-registry-secret --docker-server=ghcr.io --docker-username=<github-username> --docker-password=<ghp_token> --namespace=api --dry-run=client -o jsonpath='{.data.\.dockerconfigjson}'`
# 3. Use the resulting base64 string as the value for .Values.registry.dockerconfigjson
*/ -}}
{{- define "common.github-registry-secret" -}}
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  namespace: {{ .Release.Namespace }}
  name: {{ include "common.fullname" . }}-github-registry-secret-lockbox
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: secret-store-lockbox
    kind: ClusterSecretStore
  target:
    name: github-registry-secret
    template:
      type: kubernetes.io/dockerconfigjson
  data:
    - secretKey: .dockerconfigjson
      remoteRef:
        key: e6qsd7p0qhfaft10npmb
        property: .dockerconfigjson
{{- end }}