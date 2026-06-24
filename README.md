# LegendCFS MCP Server

This is the Model Context Protocol (MCP) server for the LegendCFS Agentic CRM. It acts as the bridge between Pickaxe Agents and the Supabase PostgreSQL backend.

## Overview
By running this MCP server, any MCP-compliant platform (like Pickaxe, Claude Desktop, or Cursor) can instantly interact with the LegendCFS ecosystem without needing to manually map dozens of REST API endpoints.

## Features
Exposes standard MCP Tools for:
- Creating Leads
- Managing Cases (Logistics)
- Scheduling Events (Viewings, Funerals)
- Searching the Vendor Directory (Marketplace)
- Drafting Invoices

## Setup
1. `npm install`
2. Create a `.env` file with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Run the server using an MCP client (stdio).
