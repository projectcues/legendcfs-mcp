import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const server = new Server(
  {
    name: "legendcfs-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_lead",
        description: "Creates a new lead in the CRM (usually from an obituary page inquiry).",
        inputSchema: {
          type: "object",
          properties: {
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            relationship_to_deceased: { type: "string" },
            source: { type: "string" },
          },
          required: ["first_name", "last_name", "source"],
        },
      },
      {
        name: "create_case",
        description: "Converts a lead into an active case (logistics tracking for a deceased individual).",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            status: { type: "string", enum: ["First Call", "In Care", "Prep/Embalming", "Ready for Service", "Completed"] },
            location_of_deceased: { type: "string" },
          },
          required: ["lead_id", "status"],
        },
      },
      {
        name: "schedule_event",
        description: "Schedules a funeral service, viewing, or graveside event.",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
            event_type: { type: "string", enum: ["Viewing", "Funeral Service", "Graveside", "Reception"] },
            event_date: { type: "string", description: "ISO 8601 date string" },
            location_name: { type: "string" },
          },
          required: ["case_id", "event_type", "event_date"],
        },
      },
      {
        name: "find_vendor",
        description: "Searches the Ancillary Marketplace (Vendor Directory) for service providers.",
        inputSchema: {
          type: "object",
          properties: {
            category_name: { type: "string", description: "e.g., Florist, Probate Attorney, Grief Counselor" },
            service_area: { type: "string" }
          },
          required: ["category_name"],
        },
      },
      {
        name: "draft_invoice",
        description: "Drafts a new invoice for a case to collect payment from a family.",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
            amount_due: { type: "number" },
            status: { type: "string", enum: ["Draft", "Sent", "Paid", "Void"] }
          },
          required: ["case_id", "amount_due"],
        },
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "create_lead") {
      const { data, error } = await supabase
        .from("leads")
        .insert([args])
        .select()
        .single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Lead created successfully: ${JSON.stringify(data)}` }] };
    }

    if (name === "create_case") {
      const { data, error } = await supabase
        .from("cases")
        .insert([args])
        .select()
        .single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Case created successfully: ${JSON.stringify(data)}` }] };
    }

    if (name === "schedule_event") {
      const { data, error } = await supabase
        .from("events")
        .insert([args])
        .select()
        .single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Event scheduled successfully: ${JSON.stringify(data)}` }] };
    }

    if (name === "find_vendor") {
      // First get category ID
      const { data: category, error: catError } = await supabase
        .from("vendor_categories")
        .select("id")
        .eq("name", args.category_name)
        .single();
      
      if (catError) throw catError;

      // Then get vendors
      let query = supabase.from("vendor_directory").select("*").eq("category_id", category.id);
      if (args.service_area) {
        query = query.ilike("service_area", `%${args.service_area}%`);
      }

      const { data: vendors, error: vendorError } = await query;
      if (vendorError) throw vendorError;

      return { content: [{ type: "text", text: `Found ${vendors.length} vendors: ${JSON.stringify(vendors)}` }] };
    }

    if (name === "draft_invoice") {
      const { data, error } = await supabase
        .from("invoices")
        .insert([{
          case_id: args.case_id,
          amount_due: args.amount_due,
          status: args.status || 'Draft'
        }])
        .select()
        .single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Invoice drafted successfully: ${JSON.stringify(data)}` }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error executing tool ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// Run the server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LegendCFS MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
