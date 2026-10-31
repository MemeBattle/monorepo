#!/bin/sh
set -eu

cas-migrate
if [ -f /opt/cas/scripts/seed-dev.sh ]; then
  /opt/cas/scripts/seed-dev.sh --if-missing
fi
exec cas
