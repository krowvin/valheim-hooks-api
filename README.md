# Valheim Hooks API

(Name pending?)

## API Server to store valheim hook data

Stores API hook messages in a ValKey cache for display on a website

## Dev Notes

I attempted to make local dev simple by setting up docker to host the ValKey + api environments.

This was especially useful because I tend to develop on my gaming computer which happens to be Windows. Looks like currently ValKey, or specifically the nodejs SDK, does not support Windows.

To run the docker compose in dev/watch mode run

`docker compose watch` from the root of the project

### Start the local valheim server separately

`docker compose -f valheim-compose.yml up`

### Useful valkey docker commands

- List keys/values: `docker exec valheim-hooks-api-cache-1 valkey-cli keys *`
- Clear all keys: `docker exec valheim-hooks-api-cache-1 valkey-cli FLUSHALL`
