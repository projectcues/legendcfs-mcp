# LegendCFS MCP Server

This is the Model Context Protocol (MCP) server for the LegendCFS Agentic CRM. It acts as the bridge between Pickaxe Agents and the Supabase PostgreSQL backend.

## Overview
By running this MCP server, any MCP-compliant platform (like Pickaxe, Claude Desktop, or Cursor) can instantly interact with the LegendCFS ecosystem without needing to manually map dozens of REST API endpoints.

## Features
Exposes 15 standard MCP Tools covering the entire deathcare ecosystem:
1. **Intake & Logistics:** `create_lead`, `create_case`, `update_case_status`, `get_case_status`
2. **Arrangements & Content:** `schedule_event`, `get_events`, `add_merchandise`, `publish_obituary`, `extract_family_tree`, `get_family_tree`
3. **Compliance & Finance:** `check_signature_status`, `draft_invoice`, `verify_insurance_policy`
4. **Marketplace & Ecosystem:** `find_vendor`, `log_vendor_referral`

## Setup
1. `npm install`
2. Create a `.env` file with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Run the server using an MCP client (stdio).
