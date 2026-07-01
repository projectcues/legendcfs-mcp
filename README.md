# LegendCFS MCP Server

Model Context Protocol (MCP) server powering the LegendCFS agentic CRM for Advanced Planning Services.

## Architecture

- **Runtime:** Node.js + Express
- **Transport:** Auto-detects stdio (local dev) or SSE over HTTP (Hostinger/production)
- **Database:** Supabase (PostgreSQL)
- **Integrations:** Whitepages Pro API, VideoSDK (live streaming)
- **Deployment:** Hostinger Node.js hosting with Passenger (auto-deploys from `main` branch)

## Tools (24)

### Intake & Logistics
| Tool | Description |
|---|---|
| `create_lead` | Creates a new CRM lead |
| `link_leads` | Links two leads with a relationship |
| `get_lead_network` | Gets all relationships for a lead |
| `update_lead` | Updates lead contact info, status, address, and history |
| `update_agent_profile` | Updates a human agent's profile |
| `get_available_leads` | Retrieves unassigned leads |
| `create_case` | Creates a funeral case |
| `update_case_status` | Updates case status |

### Arrangements & Content
| Tool | Description |
|---|---|
| `get_case_status` | Gets current case status |
| `schedule_event` | Schedules a service event (auto-provisions livestream if needed) |
| `get_events` | Lists events for a case |
| `add_merchandise` | Adds merchandise to a case |
| `publish_obituary` | Publishes an obituary |
| `extract_family_tree` | Logs a family member |
| `get_family_tree` | Gets all family members for a lead |

### Compliance & Finance
| Tool | Description |
|---|---|
| `check_signature_status` | Checks authorization signature status |
| `draft_invoice` | Creates an invoice draft |
| `verify_insurance_policy` | Logs an insurance policy |

### Marketplace
| Tool | Description |
|---|---|
| `find_vendor` | Finds vendors by category |
| `log_vendor_referral` | Logs a vendor referral |

### Live Streaming
| Tool | Description |
|---|---|
| `create_live_stream` | Creates a VideoSDK live stream |
| `register_stream_attendee` | Registers a stream viewer as a lead |
| `send_pubsub_message` | Sends a real-time message to a stream |

### Intelligence
| Tool | Description |
|---|---|
| `query_whitepages` | Queries Whitepages for background info (cleaned payload) |

## Setup

1. Copy `.env.example` to `.env` and fill in your keys
2. `npm install`
3. `node index.js` (stdio mode) or set `PORT=3000` for HTTP/SSE mode

## Security

Set `MCP_AUTH_TOKEN` in production. The `/sse` and `/message` endpoints require `Authorization: Bearer <token>`.
