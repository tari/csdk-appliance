#!/bin/sh

SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
cd "${SELF_DIR}"
exec make -C buildroot O="${SELF_DIR}/build" BR2_EXTERNAL=${SELF_DIR}/ext defconfig v86_defconfig