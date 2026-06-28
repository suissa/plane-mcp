import { stdin, stdout } from "node:process";
import { enabledTools, loadConfig, type ToolName } from "./config.js";

type JsonRpcRequest = { id?: string | number; method: string; params?: Record<string, unknown> };
type ToolDefinition = { name: ToolName; description: string; inputSchema: Record<string, unknown> };

const config = loadConfig();
const activeTools = new Set(enabledTools(config));

if (activeTools.size === 0) {
  throw new Error("No Plane MCP tools are enabled. Enable required tools in config.yml before starting the server.");
}

const toolDefinitions: Record<ToolName, ToolDefinition> = {
  list_workspaces: {
    name: "list_workspaces",
    description: "List Plane workspaces available to the configured API token.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  list_projects: {
    name: "list_projects",
    description: "List projects in a Plane workspace.",
    inputSchema: { type: "object", required: ["workspaceSlug"], properties: { workspaceSlug: { type: "string" } } },
  },
  list_work_items: {
    name: "list_work_items",
    description: "List work items in a Plane project.",
    inputSchema: {
      type: "object",
      required: ["workspaceSlug", "projectId"],
      properties: { workspaceSlug: { type: "string" }, projectId: { type: "string" } },
    },
  },
  get_work_item: {
    name: "get_work_item",
    description: "Fetch one Plane work item by UUID.",
    inputSchema: {
      type: "object",
      required: ["workspaceSlug", "projectId", "workItemId"],
      properties: { workspaceSlug: { type: "string" }, projectId: { type: "string" }, workItemId: { type: "string" } },
    },
  },
  create_work_item: {
    name: "create_work_item",
    description: "Create a Plane work item with a name and optional description_html.",
    inputSchema: {
      type: "object",
      required: ["workspaceSlug", "projectId", "name"],
      properties: {
        workspaceSlug: { type: "string" },
        projectId: { type: "string" },
        name: { type: "string" },
        descriptionHtml: { type: "string" },
      },
    },
  },
};

const send = (id: JsonRpcRequest["id"], result: unknown) =>
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const fail = (id: JsonRpcRequest["id"], message: string, code = -32000) => {
  if (id === undefined) return;
  stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
};

const arg = (params: Record<string, unknown>, key: string): string => {
  const value = params[key];
  if (typeof value !== "string" || !value) throw new Error(`Missing required string parameter: ${key}`);
  return value;
};

const planeFetch = async (path: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.server.requestTimeoutMs);
  const response = await fetch(`${config.server.apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${config.auth.apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  clearTimeout(timeout);
  const body = await response.text();
  if (body.length > config.server.maxResponseBytes) throw new Error("Plane API response exceeds maxResponseBytes");
  if (!response.ok) throw new Error(`Plane API ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
};

const callTool = async (name: ToolName, params: Record<string, unknown>) => {
  if (!activeTools.has(name)) throw new Error(`Tool is disabled in config.yml: ${name}`);
  if (name === "list_workspaces") return planeFetch("/api/workspaces/");

  const workspaceSlug = encodeURIComponent(arg(params, "workspaceSlug"));
  if (name === "list_projects") return planeFetch(`/api/v1/workspaces/${workspaceSlug}/projects/`);

  const projectId = encodeURIComponent(arg(params, "projectId"));
  if (name === "list_work_items") {
    return planeFetch(`/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/work-items/`);
  }

  if (name === "get_work_item") {
    const workItemId = encodeURIComponent(arg(params, "workItemId"));
    return planeFetch(`/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/work-items/${workItemId}/`);
  }

  const payload = { name: arg(params, "name"), description_html: params.descriptionHtml ?? "" };
  return planeFetch(`/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/work-items/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

const handle = async (request: JsonRpcRequest) => {
  if (request.id === undefined && request.method.startsWith("notifications/")) return;
  if (request.method === "initialize") {
    return send(request.id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "plane-mcp", version: "0.1.0" },
      capabilities: { tools: {} },
    });
  }
  if (request.method === "tools/list") {
    return send(request.id, { tools: [...activeTools].map((toolName) => toolDefinitions[toolName]) });
  }
  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = params.name as ToolName;
    const result = await callTool(name, (params.arguments as Record<string, unknown>) ?? {});
    return send(request.id, { content: [{ type: "text", text: JSON.stringify(result) }] });
  }
  return fail(request.id, `Unsupported method: ${request.method}`, -32601);
};

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const request = JSON.parse(line) as JsonRpcRequest;
    void handle(request).catch((error: unknown) =>
      fail(request.id, error instanceof Error ? error.message : String(error)),
    );
  }
});
