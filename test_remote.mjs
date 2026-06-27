import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  console.log("Connecting to https://mcp.legendcfs.com/sse...");
  const transport = new SSEClientTransport(new URL("https://mcp.legendcfs.com/sse"));
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  
  await client.connect(transport);
  console.log("Connected!");

  const response = await client.listTools();
  const toolNames = response.tools.map(t => t.name);
  console.log("Tools available:", toolNames.join(", "));
  
  // check for our missing ones
  const missing = ["update_lead_status", "update_agent_profile", "get_available_leads", "get_lead_network", "update_lead_info", "link_leads"];
  missing.forEach(m => {
    if (toolNames.includes(m)) {
      console.log(`✅ ${m} is present!`);
    } else {
      console.log(`❌ ${m} is MISSING!`);
    }
  });

  process.exit(0);
}

run().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
