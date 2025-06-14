const axios = require('axios');

const DO_API_TOKEN = process.env.DIGITALOCEAN_API_TOKEN;
const DO_API_URL = 'https://api.digitalocean.com/v2';

if (!DO_API_TOKEN) {
    console.error("DO Service FATAL ERROR: DIGITALOCEAN_API_TOKEN is NOT DEFINED in .env!");
}

const doApiHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DO_API_TOKEN ? DO_API_TOKEN.trim() : ''}`
};

async function createDroplet(name, region, size, image, rootPasswordFromUser) {
    console.log(`DO Service: Creating droplet: ${name}, Region: ${region}, Size: ${size}, Image: ${image}`);
    try {
        const userDataScript = `#!/bin/bash
echo "root:${rootPasswordFromUser}" | chpasswd
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
if [ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]; then
    sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/50-cloud-init.conf
    if ! grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config.d/50-cloud-init.conf; then
        echo "PermitRootLogin yes" >> /etc/ssh/sshd_config.d/50-cloud-init.conf
    fi
fi
if [ -d /etc/ssh/sshd_config.d ]; then
    for conf_file in /etc/ssh/sshd_config.d/*.conf; do
        if [ -f "$conf_file" ]; then
            sed -i 's/^#*PasswordAuthentication no/PasswordAuthentication yes/' "$conf_file"
        fi
    done
fi
systemctl restart sshd || systemctl restart ssh || service ssh restart || /etc/init.d/ssh restart
echo "User_data script finished attempt." >> /tmp/user_data_qoupay.log
`;
        const dropletData = {
            name: name,
            region: region,
            size: size,
            image: image,
            user_data: userDataScript,
            tags: ['qoupay-store-vps']
        };
        console.log("DO Service: Sending droplet creation request with aggressive user_data.");
        const response = await axios.post(`${DO_API_URL}/droplets`, dropletData, { headers: doApiHeaders });
        console.log('DO Service: Droplet creation API response status:', response.status);
        return { success: true, data: response.data.droplet };
    } catch (error) {
        console.error("DO Service: Error creating droplet!");
        let errorMessage = "Gagal membuat droplet di DigitalOcean.";
        if (error.response) {
            console.error("DO Service: API Response Status:", error.response.status);
            console.error("DO Service: API Response Data:", JSON.stringify(error.response.data, null, 2));
            errorMessage = error.response.data.message || (error.response.data.errors ? error.response.data.errors.map(e => e.detail).join(', ') : errorMessage);
        } else if (error.request) {
            console.error("DO Service: No response received from API.");
            errorMessage = "Tidak ada respons dari server DigitalOcean.";
        } else {
            console.error("DO Service: Error setting up request:", error.message);
            errorMessage = `Kesalahan saat menyiapkan request: ${error.message}`;
        }
        return { success: false, message: errorMessage };
    }
}

async function getDropletInfo(dropletId) {
    console.log(`DO Service: Getting info for droplet ID: ${dropletId}`);
    try {
        const response = await axios.get(`${DO_API_URL}/droplets/${dropletId}`, { headers: doApiHeaders });
        const droplet = response.data.droplet;
        let ipAddress = "Sedang diproses...";

        if (droplet.networks && droplet.networks.v4 && droplet.networks.v4.length > 0) {
            const publicNetwork = droplet.networks.v4.find(net => net.type === 'public');
            if (publicNetwork) {
                ipAddress = publicNetwork.ip_address;
            }
        }
        console.log(`DO Service: Droplet ID ${dropletId} - Status: ${droplet.status}, IP: ${ipAddress}`);
        return { success: true, data: { ...droplet, ipAddress: ipAddress }, status: droplet.status, ipAddress: ipAddress };
    } catch (error) {
        console.error(`DO Service: Error getting droplet info for ID ${dropletId}!`);
        let errorMessage = "Gagal mendapatkan informasi droplet.";
         if (error.response) {
            console.error("DO Service: API Response Status:", error.response.status);
            console.error("DO Service: API Response Data:", JSON.stringify(error.response.data, null, 2));
            errorMessage = error.response.data.message || errorMessage;
        } else if (error.request) {
            console.error("DO Service: No response received from API for getDropletInfo.");
             errorMessage = "Tidak ada respons dari server DigitalOcean.";
        } else {
            console.error("DO Service: Error setting up request for getDropletInfo:", error.message);
            errorMessage = `Kesalahan saat menyiapkan request: ${error.message}`;
        }
        return { success: false, message: errorMessage };
    }
}

async function getDropletInfoWithRetry(dropletId, maxRetries = 12, delayMs = 15000) {
    console.log(`DO Service: getDropletInfoWithRetry for droplet ID: ${dropletId}, Retries: ${maxRetries}, Delay: ${delayMs}ms`);
    for (let i = 0; i < maxRetries; i++) {
        console.log(`DO Service: Retry attempt ${i + 1}/${maxRetries} for droplet ID ${dropletId}`);
        const result = await getDropletInfo(dropletId);
        if (result.success && result.ipAddress && result.ipAddress !== "Sedang diproses..." && result.status === "active") {
            console.log(`DO Service: IP Address found for droplet ${dropletId}: ${result.ipAddress} with status active.`);
            return { success: true, ipAddress: result.ipAddress, status: result.status, data: result.data };
        }
        if (result.success && result.status !== "active") {
             console.log(`DO Service: Droplet ${dropletId} status is '${result.status}', not 'active' yet.`);
        }
        if (!result.success) {
            console.warn(`DO Service: getDropletInfo failed for droplet ${dropletId} on attempt ${i + 1}. Message: ${result.message}`);
            if (result.message && result.message.toLowerCase().includes('unauthorized')) {
                 console.error(`DO Service: Authorization failed during retry for droplet ${dropletId}. Stopping retries.`);
                 return { success: false, message: "Autentikasi gagal saat mengambil info droplet.", ipAddress: "Gagal didapatkan" };
            }
        }
        if (i < maxRetries - 1) {
            console.log(`DO Service: Waiting ${delayMs / 1000}s for droplet ${dropletId} before next retry.`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    console.warn(`DO Service: Max retries reached for droplet ${dropletId}.`);
    const lastAttemptResult = await getDropletInfo(dropletId);
    return { success: false, message: `Gagal mendapatkan IP Address setelah ${maxRetries} percobaan atau droplet tidak aktif. Status terakhir: ${lastAttemptResult.status || 'Tidak diketahui'}.`, ipAddress: "Gagal didapatkan" };
}

module.exports = {
    createDroplet,
    getDropletInfo,
    getDropletInfoWithRetry
};