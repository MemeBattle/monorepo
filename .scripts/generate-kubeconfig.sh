#!/bin/bash

set -e

NAMESPACE="${1}"
SECRET_NAME="${2:-deployer-sa-token}"

if [ -z "$NAMESPACE" ]; then
  echo "Usage: $0 [SECRET_NAME] <NAMESPACE>"
  echo "  SECRET_NAME (optional, default: deployer-sa-token)"
  echo "  NAMESPACE (required)"
  exit 1
fi

API_SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
TOKEN=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o jsonpath='{.data.token}' | base64 --decode)
CA_CRT=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o jsonpath='{.data.ca\.crt}' | base64 --decode | base64 -w0)

cat <<EOF > kubeconfig
apiVersion: v1
kind: Config
clusters:
- name: memebattle-cluster
  cluster:
    certificate-authority-data: $CA_CRT
    server: $API_SERVER
users:
- name: deployer
  user:
    token: $TOKEN
contexts:
- name: default-context
  context:
    cluster: memebattle-cluster
    user: deployer
    namespace: $NAMESPACE
current-context: default-context
EOF

echo "kubeconfig файл успешно создан: ./kubeconfig"