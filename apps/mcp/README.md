# Plane MCP Server

Lightweight stdio MCP facade for the existing Plane API. It is designed for constrained deployments (1 vCPU and less than 1 GB RAM) by running as a single Node.js process with a small heap limit and no runtime package dependencies.

## Configuration-first operation

`config.yml` disables every MCP tool by default. Enable only the tools your deployment needs before building the Docker image or starting the server:

```yml
tools:
  list_workspaces: true
  list_projects: true
  list_work_items: false
  get_work_item: false
  create_work_item: false
```

Build/start validation fails when all tools remain disabled. Runtime API details can be supplied with environment variables:

- `PLANE_MCP_CONFIG`: path to a config file (defaults to `config.yml`)
- `PLANE_API_BASE_URL`: overrides `server.apiBaseUrl`
- `PLANE_API_TOKEN`: bearer token for authenticated Plane API calls

## Commands

```bash
pnpm --filter=@plane/mcp build
PLANE_API_TOKEN=... pnpm --filter=@plane/mcp start
```

## Docker

```bash
docker build -f apps/mcp/Dockerfile.mcp -t plane-mcp .
docker run --rm -i -e PLANE_API_BASE_URL=http://api:8000 -e PLANE_API_TOKEN=... plane-mcp
```
