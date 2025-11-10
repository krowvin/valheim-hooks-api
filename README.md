# Valheim Hooks API

(Name pending?)

## API Server to store valheim hook data

Stores API hook messages in a ValKey cache for display on a website

## Dev Notes

I attempted to make local dev simple by setting up docker to host the ValKey + api environments.

This was especially useful because I tend to develop on my gaming computer which happens to be Windows. Looks like currently ValKey, or specifically the nodejs SDK, does not support Windows.

### Start the local valheim server for development with

From the root of the project run:
`docker compose up`
then monitor / update locally with
`docker compose watch`

### Useful valkey docker commands

- List keys/values: `docker exec valheim-hooks-api-cache-1 valkey-cli keys *`
- Clear all keys: `docker exec valheim-hooks-api-cache-1 valkey-cli FLUSHALL`
- Read contents of ZRANGE (Player/raid/etc): `docker exec valheim-hooks-api-cache-1 valkey-cli ZRANGE steam:candidates 0 -1 WITHSCORES`

## The Magic

This entire project rests solely on the log filters provided by the lloesche valheim-server docker image located here: https://hub.docker.com/r/lloesche/valheim-server#log-filters

By setting up a `VALHEIM_LOG_FILTER_REGEXP` filter and a `ON_VALHEIM_LOG_FILTER_REGEXP` event hook you can forward all log entries to a given valheim server to this API. It stores them in ValKey, and a website queries the API for those entries.

## Why?

I host a Valheim server for some friends and I wanted to know at a glance who all was on without having to go and guess based on [discord webhook logs](https://hub.docker.com/r/lloesche/valheim-server#discord-log-filter-event-hook-example).

# Going Production

I'm hosting this on TrueNAS Scale which has docker built-in. The key things to know are that you'll want to host the frontend built `dist` files if you want the web GUI. You will want the API server if you plan to just host that for your own needs.

Each of these have their own image here:

[web GUI](https://github.com/users/krowvin/packages/container/package/krowvin%2Fvalheim-hooks-api-web)

[API](https://github.com/users/krowvin/packages/container/package/krowvin%2Fvalheim-hooks-api-api)

The complete production docker compose is located here:
[prod docker compose](./docker-compose.production.yml)

# Contributions

I'm open to issues and pull requests! If you think this could be useful for you too and you'd like to help maintain then join me! I'll admit there's some cleanup to be done in places but I did this over a weekend in frustration of wondering who was on.

I'm also thinking with the factions update more players might be enabled for the server / rework of networking. That'd be great!
