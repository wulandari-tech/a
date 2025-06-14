
const axios = require('axios');
const crypto = require('crypto');

const PTERO_DOMAIN = process.env.PTERODACTYL_DOMAIN;
const PTERO_APP_API_KEY = process.env.PTERODACTYL_APP_API_KEY; 
// const PTERO_CLIENT_API_KEY = process.env.PTERODACTYL_CLIENT_API_KEY; // PTLC Key (tidak digunakan di contoh ini, tapi bisa untuk aksi client)

const appApiHeaders = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `Bearer ${PTERO_APP_API_KEY}`
};

async function createUser(username, email, firstName, lastName, panelPassword) {
    try {
        const response = await axios.post(`${PTERO_DOMAIN}/api/application/users`, {
            email: email,
            username: username.toLowerCase(),
            first_name: firstName,
            last_name: lastName,
            language: "en",
            password: panelPassword
        }, { headers: appApiHeaders });
        return { success: true, data: response.data.attributes };
    } catch (error) {
        console.error("Pterodactyl createUser error:", error.response ? error.response.data : error.message);
        const errors = error.response && error.response.data && error.response.data.errors;
        const errorMessage = errors ? errors.map(e => e.detail).join(', ') : "Gagal membuat pengguna di Pterodactyl.";
        return { success: false, message: errorMessage, errors: errors };
    }
}

async function createServer(pteroUserId, serverName, productSpecs) {
    try {
        const eggId = parseInt(process.env.PTERODACTYL_DEFAULT_EGG_ID);
        const nestId = parseInt(process.env.PTERODACTYL_DEFAULT_NEST_ID);
        const locationId = parseInt(process.env.PTERODACTYL_DEFAULT_LOCATION_ID);
       
        // const eggDetailsResponse = await axios.get(`${PTERO_DOMAIN}/api/application/nests/${nestId}/eggs/${eggId}`, { headers: appApiHeaders });
        // const startupCmd = eggDetailsResponse.data.attributes.startup;
        const startupCmd = process.env.PTERODACTYL_DEFAULT_STARTUP_CMD; 
        const serverData = {
            name: serverName,
            description: `Server for user ID ${pteroUserId} created on ${new Date().toISOString()}`,
            user: pteroUserId,
            egg: eggId,
            docker_image: process.env.PTERODACTYL_DEFAULT_DOCKER_IMAGE, 
            startup: startupCmd, 
            environment: { 
                INST: "npm", 
                USER_UPLOAD: "0",
                AUTO_UPDATE: "0",
                CMD_RUN: "npm start"
            },
            limits: {
                memory: productSpecs.ram,
                swap: 0,
                disk: productSpecs.disk,
                io: 500,
                cpu: productSpecs.cpu
            },
            feature_limits: { 
                databases: 5,
                backups: 5,
                allocations: 1 
            },
            deploy: {
                locations: [locationId],
                dedicated_ip: false,
                port_range: [],
            }
        };

        const response = await axios.post(`${PTERO_DOMAIN}/api/application/servers`, serverData, { headers: appApiHeaders });
        return { success: true, data: response.data.attributes };
    } catch (error) {
        console.error("Pterodactyl createServer error:", error.response ? error.response.data : error.message);
        const errors = error.response && error.response.data && error.response.data.errors;
        const errorMessage = errors ? errors.map(e => e.detail).join(', ') : "Gagal membuat server di Pterodactyl.";
        return { success: false, message: errorMessage, errors: errors };
    }
}

module.exports = {
    createUser,
    createServer
};