#!/bin/zsh
# Run in your own terminal. Secret exists only in this process and its children.
unsetopt XTRACE VERBOSE
setopt ERR_EXIT NO_UNSET PIPE_FAIL
if (( $# == 0 )); then
  print -u2 'Usage: zsh scripts/with-meta-key.zsh command [arguments...]'
  exit 2
fi
if [[ -z ${MODEL_API_KEY:-} ]]; then
  if [[ ! -t 0 ]]; then
    print -u2 'Run this helper in your own interactive terminal to enter the key privately.'
    exit 2
  fi
  read -rs 'MODEL_API_KEY?Meta API key (hidden): '
  print
fi
if [[ -z ${MODEL_API_KEY:-} ]]; then
  print -u2 'No key entered.'
  exit 2
fi
export MODEL_API_KEY
exec "$@"
