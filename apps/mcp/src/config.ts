import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const toolNames = [
  "list_workspaces",
  "list_projects",
  "list_work_items",
  "get_work_item",
  "create_work_item",
] as const;

export type ToolName = (typeof toolNames)[number];

export type ServerConfig = {
  server: {
    apiBaseUrl: string;
    requestTimeoutMs: number;
    maxResponseBytes: number;
    logLevel: "debug" | "info" | "warn" | "error";
  };
  auth: {
    apiToken: string;
  };
  tools: Record<ToolName, boolean>;
};

const defaultConfig: ServerConfig = {
  server: {
    apiBaseUrl: "http://localhost:8000",
    requestTimeoutMs: 10000,
    maxResponseBytes: 262144,
    logLevel: "info",
  },
  auth: {
    apiToken: "",
  },
  tools: Object.fromEntries(toolNames.map((toolName) => [toolName, false])) as Record<ToolName, boolean>,
};

const parseScalar = (value: string): string | number | boolean => {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && trimmed !== "" ? numeric : trimmed;
};

export const loadConfig = (configPath = process.env.PLANE_MCP_CONFIG ?? "config.yml"): ServerConfig => {
  const raw = readFileSync(resolve(configPath), "utf8");
  const config = structuredClone(defaultConfig);
  const stack: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = line.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;

    const indent = withoutComment.search(/\S/);
    const depth = Math.floor(indent / 2);
    const match = withoutComment.trim().match(/^([^:]+):(?:\s*(.*))?$/);
    if (!match) continue;

    const [, key, rawValue = ""] = match;
    stack[depth] = key.trim();
    stack.length = depth + 1;
    if (rawValue === "") continue;

    const section = stack[0];
    if (section === "server" && stack[1] in config.server) {
      Object.assign(config.server, { [stack[1]]: parseScalar(rawValue) });
    }
    if (section === "auth" && stack[1] === "apiToken") {
      config.auth.apiToken = String(parseScalar(rawValue));
    }
    if (section === "tools" && toolNames.includes(stack[1] as ToolName)) {
      config.tools[stack[1] as ToolName] = Boolean(parseScalar(rawValue));
    }
  }

  config.server.apiBaseUrl = process.env.PLANE_API_BASE_URL ?? config.server.apiBaseUrl;
  config.auth.apiToken = process.env.PLANE_API_TOKEN ?? config.auth.apiToken;
  return config;
};

export const enabledTools = (config: ServerConfig): ToolName[] => toolNames.filter((toolName) => config.tools[toolName]);
