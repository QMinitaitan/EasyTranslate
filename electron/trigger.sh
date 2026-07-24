#!/bin/bash
# send trigger to Translate app socket
SOCK="$HOME/.translate-app.sock"
if [ -S "$SOCK" ]; then
  echo trigger | socat - UNIX-CONNECT:"$SOCK" 2>/dev/null
else
  exit 1
fi