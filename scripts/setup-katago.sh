#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd $(dirname ${BASH_SOURCE[0]})/.. && pwd)
KATAGO_DIR=$ROOT_DIR/katago
ENGINE_DIR=$KATAGO_DIR/engine
LOG_DIR=$KATAGO_DIR/logs
MODEL_PATH=$KATAGO_DIR/model.bin
ENGINE_ZIP=$KATAGO_DIR/katago-eigen-linux-x64.zip
MODEL_GZ=$KATAGO_DIR/model.bin.gz

KATAGO_VERSION=v1.16.4
ENGINE_URL=https://github.com/lightvector/KataGo/releases/download/${KATAGO_VERSION}/katago-v1.16.4-eigen-linux-x64.zip
MODEL_URL=https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b20c256x2-s5303129600-d1228401921.bin.gz

need_cmd() {
  command -v $1 >/dev/null 2>&1 || {
    echo Missing required command: $1 >&2
    exit 1
  }
}

fetch() {
  local url=$1
  local out=$2

  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --retry 3 -o $out $url
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -O $out $url
    return
  fi

  python3 - $url $out <<'PY'
import sys, urllib.request
url, out = sys.argv[1], sys.argv[2]
urllib.request.urlretrieve(url, out)
PY
}

print_help() {
  cat <<'HELP'
Usage: scripts/setup-katago.sh [--force]

Downloads and installs the CPU-compatible KataGo binary and model into ./katago.

Options:
  --force    Redownload and reinstall engine + model even if files already exist
  --help     Show this help text
HELP
}

FORCE=0
for arg in $@; do
  case $arg in
    --force)
      FORCE=1
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo Unknown argument: $arg >&2
      print_help >&2
      exit 1
      ;;
  esac
done

need_cmd python3
need_cmd unzip
need_cmd gzip

mkdir -p $KATAGO_DIR $LOG_DIR

if [[ $FORCE -eq 1 ]]; then
  rm -rf $ENGINE_DIR
  rm -f $ENGINE_ZIP $MODEL_GZ $MODEL_PATH
fi

if [[ ! -x $ENGINE_DIR/katago ]]; then
  echo Downloading KataGo CPU engine...
  fetch $ENGINE_URL $ENGINE_ZIP
  rm -rf $ENGINE_DIR
  mkdir -p $ENGINE_DIR
  unzip -oq $ENGINE_ZIP -d $ENGINE_DIR
  chmod +x $ENGINE_DIR/katago
fi

if [[ ! -f $MODEL_PATH ]]; then
  echo Downloading KataGo model...
  fetch $MODEL_URL $MODEL_GZ
  gzip -df $MODEL_GZ
fi

if [[ ! -f $KATAGO_DIR/analysis_cpu.cfg ]]; then
  echo Missing $KATAGO_DIR/analysis_cpu.cfg >&2
  exit 1
fi

$ENGINE_DIR/katago version

echo
echo KataGo setup complete.
echo Engine: $ENGINE_DIR/katago
echo Model: $MODEL_PATH
echo Config: $KATAGO_DIR/analysis_cpu.cfg
