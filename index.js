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
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Shared Helpers ---
function getVideoSDKToken() {
  const API_KEY = process.env.VIDEOSDK_API_KEY;
  const SECRET = process.env.VIDEOSDK_SECRET;
  if (!API_KEY || !SECRET) return null;
  const options = { expiresIn: '120m', algorithm: 'HS256' };
  const payload = { apikey: API_KEY, permissions: ['allow_join', 'allow_mod'] };
  return jwt.sign(payload, SECRET, options);
}

async function createVideoSDKRoom(token) {
  const res = await fetch('https://api.videosdk.live/v2/rooms', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    console.warn('VideoSDK API returned error, falling back to mock:', await res.text());
    return null;
  }
  const roomData = await res.json();
  return roomData.roomId;
}

async function startVideoSDKHLS(token, meetingId) {
  try {
    const templateUrl = process.env.VIDEOSDK_TEMPLATE_URL || 'https://mcp.legendcfs.com/index.html';
    const hlsRes = await fetch('https://api.videosdk.live/v2/hls/start', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: meetingId, templateUrl, config: { orientation: 'landscape', quality: 'high' } })
    });
    if (!hlsRes.ok) console.warn('VideoSDK HLS Start Warning:', await hlsRes.text());
  } catch (e) {
    console.warn('VideoSDK HLS Start Error:', e);
  }
}

const server = new Server(
  {
    name: "legendcfs-mcp",
    version: "2.0.0",
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
            case_id: { type: "string", description: "Attribution to specific case" },
            event_id: { type: "string", description: "Attribution to specific event" },
            obituary_id: { type: "string", description: "Attribution to specific obituary" },
          },
          required: ["first_name", "last_name", "source"],
        },
      },
      {
        name: "link_leads",
        description: "Links two leads together in the relationship graph.",
        inputSchema: {
          type: "object",
          properties: {
            lead_id_1: { type: "string" },
            lead_id_2: { type: "string" },
            relationship_type: { type: "string", description: "e.g., 'Sibling', 'Spouse', 'Cousin'" },
            confidence_score: { type: "number", description: "0-100 score of how confident you are in this match" }
          },
          required: ["lead_id_1", "lead_id_2", "relationship_type"],
        },
      },
      {
        name: "get_lead_network",
        description: "Retrieves the full web of relationships for a specific lead.",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" }
          },
          required: ["lead_id"],
        },
      },
      {
        name: "update_lead",
        description: "Updates a lead's contact info, status, address, and/or history. Use this single tool for all lead updates.",
        inputSchema: {
          type: "object",
          properties: {
            lead_id: { type: "string" },
            lead_phone: { type: "string" },
            lead_email: { type: "string" },
            address_line_1: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip_code: { type: "string" },
            status: { type: "string" },
            follow_up_status: { type: "string" },
            phone_history: { type: "array", description: "New phone entries to append to history" },
            address_history: { type: "array", description: "New address entries to append to history" }
          },
          required: ["lead_id"],
        },
      },
      {
        name: "update_agent_profile",
        description: "Updates a human agent's profile in the CRM.",
        inputSchema: {
          type: "object",
          properties: {
            agent_email: { type: "string" },
            agent_phone: { type: "string" },
            agent_name: { type: "string" },
            business_website: { type: "string" }
          },
          required: ["agent_email"],
        },
      },
      {
        name: "get_available_leads",
        description: "Retrieves a batch of new, uncontacted leads that are not yet assigned to an agent.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of leads to fetch (defaults to 5)" }
          }
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
            requires_live_stream: { type: "boolean", description: "Set to true if the family's package includes live streaming" }
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
            relationship_to_deceased: { type: "string" },
            case_id: { type: "string" },
            event_id: { type: "string" },
          },
          required: ["stream_id", "first_name", "last_name", "email"],
        },
      },
      {
        name: "send_pubsub_message",
        description: "Pushes a real-time message/link to all attendees currently watching a VideoSDK live stream.",
        inputSchema: {
          type: "object",
          properties: {
            meeting_id: { type: "string" },
            topic: { type: "string" },
            message: { type: "string" }
          },
          required: ["meeting_id", "topic", "message"],
        },
      },
      {
        name: "query_whitepages",
        description: "Queries the Whitepages Person API for deep background info and cleans the payload to save tokens.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            postal_code: { type: "string" }
          },
          required: ["name"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // INTAKE & LOGISTICS
    if (name === "create_lead") {
      const dbArgs = {
        lead_name: `${args.first_name} ${args.last_name}`,
        lead_phone: args.phone,
        lead_email: args.email,
        relationship: args.relationship_to_deceased,
        source: args.source,
        case_id: args.case_id,
        event_id: args.event_id,
        obituary_id: args.obituary_id
      };
      const { data, error } = await supabase.from("leads").insert([dbArgs]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Lead created: ${JSON.stringify(data)}` }] };
    }

    if (name === "link_leads") {
      const { data, error } = await supabase.from("lead_relationships").insert({
        lead_id_1: args.lead_id_1,
        lead_id_2: args.lead_id_2,
        relationship_type: args.relationship_type,
        confidence_score: args.confidence_score || 100.0
      }).select();
      
      if (error) throw error;
      return { content: [{ type: "text", text: `Leads linked successfully: ${JSON.stringify(data)}` }] };
    }

    if (name === "get_lead_network") {
      // Query relationships where the lead is either lead_id_1 or lead_id_2
      const { data: rels1, error: err1 } = await supabase.from("lead_relationships").select("*, lead_id_2(id, lead_name, lead_phone, lead_email)").eq("lead_id_1", args.lead_id);
      const { data: rels2, error: err2 } = await supabase.from("lead_relationships").select("*, lead_id_1(id, lead_name, lead_phone, lead_email)").eq("lead_id_2", args.lead_id);
      
      if (err1 || err2) throw (err1 || err2);
      
      const network = [...(rels1 || []), ...(rels2 || [])];
      return { content: [{ type: "text", text: JSON.stringify(network, null, 2) }] };
    }

    if (name === "update_lead") {
      const updates = {};
      if (args.lead_phone) updates.lead_phone = args.lead_phone;
      if (args.lead_email) updates.lead_email = args.lead_email;
      if (args.address_line_1) updates.address_line_1 = args.address_line_1;
      if (args.city) updates.city = args.city;
      if (args.state) updates.state = args.state;
      if (args.zip_code) updates.zip_code = args.zip_code;
      if (args.status) updates.status = args.status;
      if (args.follow_up_status) updates.follow_up_status = args.follow_up_status;
      updates.updated_at = new Date().toISOString();

      // Append to history arrays if provided
      if (args.phone_history || args.address_history) {
        const { data: currentLead, error: fetchError } = await supabase.from("leads").select("phone_history, address_history").eq("id", args.lead_id).single();
        if (!fetchError && currentLead) {
          if (args.phone_history) {
            const currentPhones = Array.isArray(currentLead.phone_history) ? currentLead.phone_history : [];
            updates.phone_history = [...currentPhones, ...args.phone_history];
          }
          if (args.address_history) {
            const currentAddresses = Array.isArray(currentLead.address_history) ? currentLead.address_history : [];
            updates.address_history = [...currentAddresses, ...args.address_history];
          }
        }
      }

      const { data, error } = await supabase.from("leads").update(updates).eq("id", args.lead_id).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Lead updated: ${JSON.stringify(data)}` }] };
    }

    if (name === "update_agent_profile") {
      const updates = {};
      if (args.agent_phone) updates.agent_phone = args.agent_phone;
      if (args.agent_name) updates.agent_name = args.agent_name;
      if (args.business_website) updates.business_website = args.business_website;
      
      const { data, error } = await supabase.from("agents").update(updates).eq("agent_email", args.agent_email).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Agent profile updated: ${JSON.stringify(data)}` }] };
    }

    if (name === "get_available_leads") {
      const limit = args.limit || 5;
      const { data, error } = await supabase.from("leads")
        .select("*")
        .is("agent_id", null)
        .eq("status", "Uncontacted")
        .limit(limit);
      
      if (error) throw error;
      return { content: [{ type: "text", text: `Available unassigned leads: ${JSON.stringify(data)}` }] };
    }

    if (name === "register_stream_attendee") {
      const dbArgs = {
        lead_name: `${args.first_name} ${args.last_name}`,
        lead_email: args.email,
        relationship: args.relationship_to_deceased,
        source: `Live Stream: ${args.stream_id}`,
        case_id: args.case_id,
        event_id: args.event_id
      };
      const { data, error } = await supabase.from("leads").insert([dbArgs]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Stream attendee registered as lead: ${JSON.stringify(data)}` }] };
    }

    if (name === "create_case") {
      const dbArgs = { lead_id: args.lead_id, status: args.status };
      if (args.location_of_deceased) dbArgs.location_of_deceased = args.location_of_deceased;
      const { data, error } = await supabase.from("cases").insert([dbArgs]).select().single();
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
      const { data, error } = await supabase.from("events").insert([{
        case_id: args.case_id,
        event_type: args.event_type,
        event_date: args.event_date,
        location_name: args.location_name
      }]).select().single();
      
      if (error) throw error;

      let streamInfo = "";
      // Intelligent Auto-Provisioning of Livestream based on package
      if (args.requires_live_stream) {
        let meetingId = "mock-meeting-" + Math.floor(Math.random() * 1000000);
        const token = getVideoSDKToken();
        if (token) {
          const roomId = await createVideoSDKRoom(token);
          if (roomId) {
            meetingId = roomId;
            await startVideoSDKHLS(token, meetingId);
          }
        }
        const streamUrl = `https://legendcfs.com/stream/${meetingId}`;
        await supabase.from("live_streams").insert([{
          event_id: data.id,
          videosdk_meeting_id: meetingId,
          stream_url: streamUrl,
          status: 'Scheduled'
        }]);
        streamInfo = ` (Auto-provisioned Live Stream: ${streamUrl})`;
      }

      return { content: [{ type: "text", text: `Event scheduled successfully.${streamInfo} Details: ${JSON.stringify(data)}` }] };
    }

    if (name === "get_events") {
      const { data, error } = await supabase.from("events").select("*").eq("case_id", args.case_id);
      if (error) throw error;
      return { content: [{ type: "text", text: `Scheduled Events: ${JSON.stringify(data)}` }] };
    }

    if (name === "add_merchandise") {
      const dbArgs = { case_id: args.case_id, item_type: args.item_type, item_name: args.item_name, price: args.price };
      if (args.quantity) dbArgs.quantity = args.quantity;
      const { data, error } = await supabase.from("merchandise").insert([dbArgs]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Merchandise added: ${JSON.stringify(data)}` }] };
    }

    if (name === "publish_obituary") {
      const { data, error } = await supabase.from("obituaries").insert([args]).select().single();
      if (error) throw error;
      return { content: [{ type: "text", text: `Obituary published: ${JSON.stringify(data)}` }] };
    }

    if (name === "extract_family_tree") {
      const dbArgs = {
        lead_id: args.lead_id,
        first_name: args.first_name,
        last_name: args.last_name,
        relationship_to_deceased: args.relationship_to_deceased
      };
      const { data, error } = await supabase.from("family_members").insert([dbArgs]).select().single();
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
      const dbArgs = { lead_id: args.lead_id, carrier_name: args.carrier_name, status: args.status };
      if (args.policy_number) dbArgs.policy_number = args.policy_number;
      if (args.coverage_amount) dbArgs.coverage_amount = args.coverage_amount;
      const { data, error } = await supabase.from("insurance_policies").insert([dbArgs]).select().single();
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
      const token = getVideoSDKToken();
      if (token) {
        const roomId = await createVideoSDKRoom(token);
        if (roomId) {
          meetingId = roomId;
          await startVideoSDKHLS(token, meetingId);
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



    if (name === "send_pubsub_message") {
      const token = getVideoSDKToken();
      if (!token) throw new Error("Missing VideoSDK credentials");
      
      const res = await fetch(`https://api.videosdk.live/v2/rooms/${args.meeting_id}/pubsub`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: args.topic,
          message: args.message,
          sendToAll: true
        })
      });
      
      if (!res.ok) throw new Error(`VideoSDK PubSub API failed: ${await res.text()}`);
      return { content: [{ type: "text", text: `PubSub message sent to meeting ${args.meeting_id} on topic ${args.topic}` }] };
    }

    if (name === "query_whitepages") {
      const whitepagesApiKey = process.env.WHITEPAGES_API_KEY;
      if (!whitepagesApiKey) throw new Error("Missing WHITEPAGES_API_KEY");
      
      const params = new URLSearchParams({ api_key: whitepagesApiKey, name: args.name });
      if (args.city) params.append('city', args.city);
      if (args.state) params.append('state_code', args.state);
      if (args.postal_code) params.append('postal_code', args.postal_code);
      
      const wpResponse = await fetch(`https://proapi.whitepages.com/3.0/person.json?${params.toString()}`);
      const wpData = await wpResponse.json();
      
      const cleanedMatches = [];
      if (wpData.person && Array.isArray(wpData.person)) {
        for (const person of wpData.person) {
          cleanedMatches.push({
            id: person.id,
            name: person.name,
            age_range: person.age_range,
            associated_people: (person.associated_people || []).map(p => p.name).slice(0, 10),
            current_addresses: (person.current_addresses || []).map(a => `${a.street_line_1}, ${a.city}, ${a.state_code} ${a.postal_code}`),
            historical_addresses: (person.historical_addresses || []).map(a => `${a.street_line_1}, ${a.city}, ${a.state_code} ${a.postal_code}`).slice(0, 5),
            phones: (person.phones || []).map(p => ({ number: p.phone_number, line_type: p.line_type, is_valid: p.is_valid })),
            emails: (person.associated_emails || [])
          });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(cleanedMatches) }] };
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
    console.error("LegendCFS MCP Server (2.0.0) running on stdio");
    return;
  }

  // HTTP SSE Mode
  const app = express();
  app.use(cors());
  app.use(express.static("public"));

  // Bearer token auth middleware for MCP endpoints
  const requireAuth = (req, res, next) => {
    if (!MCP_AUTH_TOKEN) {
      // If no token is configured, allow access (dev mode)
      console.warn("WARNING: MCP_AUTH_TOKEN not set — endpoints are unauthenticated!");
      return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  const transports = new Map();

  app.get("/sse", requireAuth, async (req, res) => {
    console.log("New SSE connection...");
    const transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);
    await server.connect(transport);
    console.log("SSE Connection established, session:", transport.sessionId);
    
    req.on("close", () => {
      console.log("SSE Connection closed:", transport.sessionId);
      transports.delete(transport.sessionId);
    });
  });

  app.post("/message", requireAuth, async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(404).send("Session not found");
    }
  });

  // VideoSDK Webhook Listener
  app.post("/webhooks/videosdk", express.json(), async (req, res) => {
    try {
      const payload = req.body;
      const eventType = payload.webhookType;
      const meetingId = payload.roomId;
      
      console.log(`Received VideoSDK Webhook: ${eventType} for room ${meetingId}`);
      
      // Log event to Supabase
      const { error } = await supabase.from("stream_events").insert([{
        stream_id: meetingId,
        event_type: eventType,
        event_payload: payload
      }]);
      
      if (error) {
        console.error("Failed to log stream event to Supabase:", error);
      }
      
      res.status(200).send("Webhook received");
    } catch (err) {
      console.error("Webhook processing error:", err);
      res.status(500).send("Internal Server Error");
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
