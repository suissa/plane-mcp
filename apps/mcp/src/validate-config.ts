import { enabledTools, loadConfig } from "./config.js";

const config = loadConfig();
const activeTools = enabledTools(config);

if (activeTools.length === 0) {
  throw new Error(
    "Plane MCP build blocked: enable at least one tool in apps/mcp/config.yml before building or starting the server.",
  );
}

if (!config.auth.apiToken) {
  console.warn("Plane MCP warning: no auth.apiToken configured. Set PLANE_API_TOKEN at runtime for authenticated API calls.");
}

console.log(`Plane MCP enabled tools: ${activeTools.join(", ")}`);
