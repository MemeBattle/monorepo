{{- define "common.deployer-service-account" -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: deployer-sa
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
  annotations:
    helm.sh/resource-policy: keep
{{- end }}

{{- define "common.deployer-role" -}}
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer-role
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
  annotations:
    helm.sh/resource-policy: keep
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["services", "configmaps", "secrets"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "create", "update", "patch", "delete", "watch"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: ["external-secrets.io"]
    resources: ["externalsecrets"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
{{- end }}

{{- define "common.deployer-role-binding" -}}
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deployer-role-binding
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
  annotations:
    helm.sh/resource-policy: keep
subjects:
  - kind: ServiceAccount
    name: deployer-sa
    namespace: {{ .Release.Namespace }}
roleRef:
  kind: Role
  name: deployer-role
  apiGroup: rbac.authorization.k8s.io
{{- end }}

{{- define "common.deployer-sa-token" -}}
apiVersion: v1
kind: Secret
metadata:
  name: deployer-sa-token
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
  annotations:
    kubernetes.io/service-account.name: deployer-sa
    helm.sh/resource-policy: keep
type: kubernetes.io/service-account-token
{{- end }}

{{- define "common.deployer" -}}
{{ include "common.deployer-service-account" . }}
---
{{ include "common.deployer-role" . }}
---
{{ include "common.deployer-role-binding" . }}
---
{{ include "common.deployer-sa-token" . }}
{{- end }}

