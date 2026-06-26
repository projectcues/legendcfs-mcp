import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  const transport = new SSEClientTransport(new URL("https://mcp.legendcfs.com/sse"));
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  
  await client.connect(transport);
  console.log("Connected to SSE MCP server.");
  
  const tools = await client.listTools();
  console.log("Successfully retrieved", tools.tools.length, "tools from the remote server.");
  console.log("Tools:", tools.tools.map(t => t.name).join(", "));
  
  process.exit(0);
}

run().catch(console.error);
