import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
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
    version: "1.1.0",
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
      // INTAKE & LOGISTICS
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
        name: "update_case_status",
        description: "Updates the logistical status of a body/case (e.g., from First Call to In Care).",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
            status: { type: "string", enum: ["First Call", "In Care", "Prep/Embalming", "Ready for Service", "Completed"] },
          },
          required: ["case_id", "status"],
        },
      },
      {
        name: "get_case_status",
        description: "Checks the current logistical status of a case.",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
          },
          required: ["case_id"],
        },
      },
      
      // ARRANGEMENTS & CONTENT
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
        name: "get_events",
        description: "Retrieves scheduled events for a specific case (useful for cemeteries/crematories to check schedules).",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
          },
          required: ["case_id"],
        },
      },
      {
        name: "add_merchandise",
        description: "Logs the family's selection of a casket, urn, or vault.",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
            item_type: { type: "string", enum: ["Casket", "Urn", "Vault", "Memorial Book"] },
            item_name: { type: "string" },
            price: { type: "number" }
          },
          required: ["case_id", "item_type", "item_name", "price"],
        },
      },
      {
        name: "publish_obituary",
        description: "Saves a generated obituary to the database to be hosted publicly.",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            content: { type: "string" },
            photo_url: { type: "string" }
          },
          required: ["lead_id", "content"],
        },
      },
      {
        name: "extract_family_tree",
        description: "Adds a parsed family member to the family tree in the CRM.",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            relationship_to_deceased: { type: "string" },
            is_surviving: { type: "boolean" }
          },
          required: ["lead_id", "first_name", "last_name", "relationship_to_deceased"],
        },
      },
      {
        name: "get_family_tree",
        description: "Retrieves the parsed family tree for a lead (useful for probate lawyers).",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
          },
          required: ["lead_id"],
        },
      },

      // COMPLIANCE & FINANCE
      {
        name: "check_signature_status",
        description: "Checks if legal authorizations (e.g. Cremation Auth) have been signed.",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
          },
          required: ["case_id"],
        },
      },
      {
        name: "draft_invoice",
        description: "Drafts a new invoice for a case to collect payment from a family via Stripe.",
        inputSchema: {
          type: "object",
          properties: {
            case_id: { type: "string" },
            amount_due: { type: "number" },
            status: { type: "string", enum: ["Draft", "Sent", "Paid", "Void"] }
          },
          required: ["case_id", "amount_due"],
        },
      },
      {
        name: "verify_insurance_policy",
        description: "Logs a verified life insurance policy for assignment payment.",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            carrier_name: { type: "string" },
            policy_number: { type: "string" },
            benefit_amount: { type: "number" },
            status: { type: "string", enum: ["Verified", "Pending", "Denied", "Assigned"] }
          },
          required: ["lead_id", "carrier_name", "status"],
        },
      },

      // MARKETPLACE / PROFESSIONAL WHEEL
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
        name: "log_vendor_referral",
        description: "Logs that a family was referred to a specific vendor (tracks affiliate revenue).",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            vendor_id: { type: "string" },
            status: { type: "string", enum: ["referred", "engaged", "completed"] }
          },
          required: ["lead_id", "vendor_id"],
        },
      },

      // LIVE STREAMING
      {
        name: "create_live_stream",
        description: "Creates a VideoSDK live stream meeting for an event.",
        inputSchema: {
          type: "object",
          properties: {
            event_id: { type: "string" }
          },
          required: ["event_id"],
        },
      },
      {
        name: "register_stream_attendee",
        description: "Registers a lead who attends the live stream.",
        inputSchema: {
          type: "object",
          properties: {
            stream_id: { type: "string" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: { type: "string" },
            relationship_to_deceased: { type: "string" }
          },
          required: ["stream_id", "first_name", "last_name", "email"],
        },
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // INTAKE & LOGISTICS
    if (name === "create_lead") {
      const { data, error } = await supabase.from("leads").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Lead created: ${JSON.stringify(data)}` }] };
    }

    if (name === "create_case") {
      const { data, error } = await supabase.from("cases").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Case created: ${JSON.stringify(data)}` }] };
    }

    if (name === "update_case_status") {
      const { data, error } = await supabase.from("cases").update({ status: args.status }).eq("id", args.case_id).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Case status updated to ${args.status}` }] };
    }

    if (name === "get_case_status") {
      const { data, error } = await supabase.from("cases").select("status, location_of_deceased").eq("id", args.case_id).single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Current Case Status: ${JSON.stringify(data)}` }] };
    }

    // ARRANGEMENTS & CONTENT
    if (name === "schedule_event") {
      const { data, error } = await supabase.from("events").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Event scheduled: ${JSON.stringify(data)}` }] };
    }

    if (name === "get_events") {
      const { data, error } = await supabase.from("events").select("*").eq("case_id", args.case_id);
      if (error) throw error;
      return { content: [{ type: "text", text: `Scheduled Events: ${JSON.stringify(data)}` }] };
    }

    if (name === "add_merchandise") {
      const { data, error } = await supabase.from("merchandise").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Merchandise added: ${JSON.stringify(data)}` }] };
    }

    if (name === "publish_obituary") {
      const { data, error } = await supabase.from("obituaries").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Obituary published: ${JSON.stringify(data)}` }] };
    }

    if (name === "extract_family_tree") {
      const { data, error } = await supabase.from("family_members").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Family member logged: ${JSON.stringify(data)}` }] };
    }

    if (name === "get_family_tree") {
      const { data, error } = await supabase.from("family_members").select("*").eq("lead_id", args.lead_id);
      if (error) throw error;
      return { content: [{ type: "text", text: `Family Tree: ${JSON.stringify(data)}` }] };
    }

    // COMPLIANCE & FINANCE
    if (name === "check_signature_status") {
      const { data, error } = await supabase.from("authorizations").select("document_type, status").eq("case_id", args.case_id);
      if (error) throw error;
      return { content: [{ type: "text", text: `Authorization Statuses: ${JSON.stringify(data)}` }] };
    }

    if (name === "draft_invoice") {
      const { data, error } = await supabase.from("invoices").insert([{
          case_id: args.case_id, amount_due: args.amount_due, status: args.status || 'Draft'
        }]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Invoice drafted: ${JSON.stringify(data)}` }] };
    }

    if (name === "verify_insurance_policy") {
      const { data, error } = await supabase.from("insurance_policies").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Insurance policy logged: ${JSON.stringify(data)}` }] };
    }

    // MARKETPLACE
    if (name === "find_vendor") {
      const { data: category, error: catError } = await supabase.from("vendor_categories").select("id").eq("name", args.category_name).single();
      if (catError) throw catError;

      let query = supabase.from("vendor_directory").select("*").eq("category_id", category.id);
      if (args.service_area) query = query.ilike("service_area", `%${args.service_area}%`);

      const { data: vendors, error: vendorError } = await query;
      if (vendorError) throw vendorError;

      return { content: [{ type: "text", text: `Found ${vendors.length} vendors: ${JSON.stringify(vendors)}` }] };
    }

    if (name === "log_vendor_referral") {
      const { data, error } = await supabase.from("vendor_referrals").insert([{
        lead_id: args.lead_id, vendor_id: args.vendor_id, status: args.status || 'referred'
      }]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Vendor referral logged: ${JSON.stringify(data)}` }] };
    }

    // LIVE STREAMING
    if (name === "create_live_stream") {
      let meetingId = "mock-meeting-" + Math.floor(Math.random() * 1000000);
      const API_KEY = process.env.VIDEOSDK_API_KEY;
      const SECRET = process.env.VIDEOSDK_SECRET;

      if (API_KEY && SECRET) {
        // Generate Token
        const options = { expiresIn: '120m', algorithm: 'HS256' };
        const payload = { apikey: API_KEY, permissions: ['allow_join', 'allow_mod'] };
        const token = jwt.sign(payload, SECRET, options);

        // Fetch Meeting ID
        const res = await fetch(`https://api.videosdk.live/v2/rooms`, {
          method: "POST",
          headers: { Authorization: token, "Content-Type": "application/json" }
        });
        if (res.ok) {
          const roomData = await res.json();
          meetingId = roomData.roomId;
        } else {
          console.warn("VideoSDK API returned error, falling back to mock meeting ID", await res.text());
        }
      }

      const streamUrl = `https://legendcfs.com/stream/${meetingId}`;

      const { data, error } = await supabase.from("live_streams").insert([{
        event_id: args.event_id,
        videosdk_meeting_id: meetingId,
        stream_url: streamUrl,
        status: 'Scheduled'
      }]).select().single();
      
      if (error) throw error;
      return { content: [{ type: "text", text: `Live stream created: ${JSON.stringify(data)}` }] };
    }

    if (name === "register_stream_attendee") {
      const { data, error } = await supabase.from("stream_attendees").insert([{
        stream_id: args.stream_id,
        first_name: args.first_name,
        last_name: args.last_name,
        email: args.email,
        relationship_to_deceased: args.relationship_to_deceased || ''
      }]).select().single();
      
      if (error) throw error;
      return { content: [{ type: "text", text: `Stream attendee registered: ${JSON.stringify(data)}` }] };
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
  // Auto-detect HTTP mode via PORT, explicit TRANSPORT, or Passenger/Production env
  const isHTTP = 
    process.env.PORT || 
    process.env.TRANSPORT === "sse" || 
    process.env.PASSENGER_APP_ENV || 
    process.env.NODE_ENV === "production";

  if (!isHTTP) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("LegendCFS MCP Server (1.1.0) running on stdio");
    return;
  }

  // HTTP SSE Mode
  const app = express();
  app.use(cors());

  let sseTransport = null;

  app.get("/sse", async (req, res) => {
    console.log("New SSE connection...");
    sseTransport = new SSEServerTransport("/message", res);
    await server.connect(sseTransport);
    console.log("SSE Connection established");
  });

  app.post("/message", async (req, res) => {
    if (sseTransport) {
      await sseTransport.handlePostMessage(req, res);
    } else {
      res.status(500).send("SSE transport not initialized");
    }
  });

  // Health check
  app.get("/", (req, res) => res.send("LegendCFS MCP Server is running"));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`LegendCFS MCP Server running on port ${PORT}`);
  });
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
