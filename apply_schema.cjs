const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '/Users/lordalmighty/Projects/AIOS/AIS-OS/.env' });

async function main() {
    let dbUrl = process.env.LEGEND_CFS_DB_DB_URL;
    let dbPass = process.env.LEGEND_CFS_DB_DB_PASS;
    if (!dbUrl || !dbPass) {
        console.error("Missing DB URL or PASS in .env");
        return;
    }
    dbUrl = dbUrl.replace('[YOUR-PASSWORD]', dbPass);
    
    // Replace single quotes from env var if they exist
    dbUrl = dbUrl.replace(/^'/, '').replace(/'$/, '');
    
    const client = new Client({ connectionString: dbUrl });
    try {
        await client.connect();
        const sql = fs.readFileSync('/Users/lordalmighty/.gemini/antigravity/brain/e5b4abdd-0f1b-4f9f-a242-c096cdd58cde/scratch/videosdk_init.sql', 'utf8');
        await client.query(sql);
        console.log("Successfully applied videosdk_init.sql");
    } catch (err) {
        console.error("Error applying schema:", err);
    } finally {
        await client.end();
    }
}
main();
