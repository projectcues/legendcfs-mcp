import jwt from "jsonwebtoken";

import * as dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.VIDEOSDK_API_KEY;
const SECRET = process.env.VIDEOSDK_SECRET;

if (!API_KEY || !SECRET) {
  console.error("Missing VIDEOSDK_API_KEY or VIDEOSDK_SECRET in .env");
  process.exit(1);
}

// Generate VideoSDK Token
const options = { expiresIn: '10m', algorithm: 'HS256' };
const payload = { 
    apikey: API_KEY, 
    permissions: ['allow_join', 'allow_mod'] // generic permissions for API access
};
const token = jwt.sign(payload, SECRET, options);

const webhookUrl = "https://mcp.legendcfs.com/webhooks/videosdk";

const webhookPayload = {
    events: [
        "participant-joined",
        "participant-left",
        "session-started",
        "session-ended",
        "recording-started",
        "recording-stopped",
        "livestream-started",
        "livestream-stopped"
    ],
    url: webhookUrl
};

async function registerWebhooks() {
    console.log(`Registering VideoSDK webhooks to: ${webhookUrl}`);
    
    try {
        const response = await fetch("https://api.videosdk.live/v2/webhooks", {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(webhookPayload)
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("✅ Successfully registered global VideoSDK Webhooks!");
            console.log("Response:", JSON.stringify(data, null, 2));
        } else {
            console.error("❌ Failed to register webhooks.");
            console.error("Error:", JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error("Network or execution error:", err);
    }
}

registerWebhooks();
