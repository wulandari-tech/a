const Order = require('../models/order');
const Product = require('../models/product');
const User = require('../models/user');


const PTERO_API_URL = process.env.PTERO_API_URL;
const PTERO_API_KEY = process.env.PTERO_API_KEY;


async function createPterodactylUser(email, username, firstName, lastName, password) {
    if (!PTERO_API_URL || !PTERO_API_KEY) {
        throw new Error('Konfigurasi API Pterodactyl tidak lengkap.');
    }
    const payload = { email, username, first_name: firstName, last_name: lastName, password, root_admin: false, language: 'en' };
    try {
        console.log("PTERO: Mencoba membuat user dengan payload:", payload);
        // const response = await axios.post(`${PTERO_API_URL}/api/application/users`, payload, {
        //     headers: { 'Authorization': `Bearer ${PTERO_API_KEY}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
        // });
        // console.log("PTERO: Respons pembuatan user:", response.data);
        // if (response.data && response.data.object === 'user') {
        //     return response.data.attributes;
        // }
        // throw new Error(response.data.errors ? response.data.errors[0].detail : 'Gagal membuat user Pterodactyl.');

        // Placeholder jika API tidak dipanggil
        await new Promise(resolve => setTimeout(resolve, 500)); 
        return { id: Math.floor(Math.random() * 10000), username: username, email: email };
    } catch (error) {
        console.error("PTERO: Error membuat user:", error.response ? error.response.data : error.message);
        const errorMessage = error.response && error.response.data && error.response.data.errors 
                           ? error.response.data.errors[0].detail 
                           : 'Kesalahan internal saat membuat user Pterodactyl.';
        throw new Error(errorMessage);
    }
}

async function createPterodactylServer(userId, serverName, productSpecs, eggId, locationId) {
    if (!PTERO_API_URL || !PTERO_API_KEY) {
        throw new Error('Konfigurasi API Pterodactyl tidak lengkap.');
    }
    const payload = {
        name: serverName,
        user: userId,
        egg: eggId || parseInt(process.env.PTERO_DEFAULT_EGG_ID || "15"), 
        docker_image: process.env.PTERO_DEFAULT_DOCKER_IMAGE || "quay.io/pterodactyl/core:java", 
        startup: process.env.PTERO_DEFAULT_STARTUP_COMMAND || "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar",
        limits: {
            memory: productSpecs.ram || 1024,
            swap: 0,
            disk: productSpecs.disk || 5120,
            io: 500,
            cpu: productSpecs.cpu || 100
        },
        feature_limits: {
            databases: parseInt(process.env.PTERO_DEFAULT_DATABASES || "1"),
            allocations: parseInt(process.env.PTERO_DEFAULT_ALLOCATIONS || "1"),
            backups: parseInt(process.env.PTERO_DEFAULT_BACKUPS || "1")
        },
        deploy: {
            locations: [locationId || parseInt(process.env.PTERO_DEFAULT_LOCATION_ID || "1")],
            dedicated_ip: false,
            port_range: []
        },
        environment: {
             SERVER_JARFILE: "server.jar",
             BUNGEE_VERSION: "latest"
        },
        start_on_completion: true,
        skip_scripts: false
    };
    try {
        console.log("PTERO: Mencoba membuat server dengan payload:", JSON.stringify(payload, null, 2));
        // const response = await axios.post(`${PTERO_API_URL}/api/application/servers`, payload, {
        //     headers: { 'Authorization': `Bearer ${PTERO_API_KEY}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
        // });
        // console.log("PTERO: Respons pembuatan server:", response.data);
        // if (response.data && response.data.object === 'server') {
        //     return response.data.attributes;
        // }
        // throw new Error(response.data.errors ? response.data.errors[0].detail : 'Gagal membuat server Pterodactyl.');

        // Placeholder jika API tidak dipanggil
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        return { id: Math.floor(Math.random() * 1000), name: serverName, uuid: "placeholder-uuid" };
    } catch (error) {
        console.error("PTERO: Error membuat server:", error.response ? error.response.data : error.message);
         const errorMessage = error.response && error.response.data && error.response.data.errors 
                           ? error.response.data.errors.map(e => e.detail).join(', ')
                           : 'Kesalahan internal saat membuat server Pterodactyl.';
        throw new Error(errorMessage);
    }
}


exports.setupPterodactylAccount = async (req, res) => {
    const { orderId, panel_username, panel_password } = req.body;
    const userId = req.user._id;

    if (!orderId || !panel_username || !panel_password) {
        return res.status(400).json({ success: false, message: "Data tidak lengkap." });
    }
    if (panel_password.length < 8) {
        return res.status(400).json({ success: false, message: "Password panel minimal 8 karakter." });
    }
    const cleanPanelUsername = panel_username.toLowerCase().replace(/[^a-z0-9_]/gi, '');
    if (!cleanPanelUsername) {
         return res.status(400).json({ success: false, message: "Username panel tidak valid." });
    }


    try {
        const order = await Order.findById(orderId).populate('product').populate('user');
        if (!order || order.user._id.toString() !== userId.toString()) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan atau bukan milik Anda." });
        }
        if (order.status !== 'processing_pterodactyl') {
            return res.status(400).json({ success: false, message: "Status order tidak memungkinkan untuk setup Pterodactyl." });
        }
        if (!order.product || order.product.category !== 'pterodactyl_panel' || !order.product.pterodactylSpecs) {
            return res.status(400).json({ success: false, message: "Produk tidak valid untuk setup Pterodactyl." });
        }

        const userPtero = await createPterodactylUser(
            order.user.email,
            cleanPanelUsername,
            order.user.username,
            'User',
            panel_password
        );

        const serverName = `${order.product.name} - ${order.user.username.substring(0,5)}${Math.floor(Math.random()*100)}`;
        const serverPtero = await createPterodactylServer(
            userPtero.id,
            serverName,
            order.product.pterodactylSpecs,
            order.product.pterodactylSpecs.eggId, 
            order.product.pterodactylSpecs.locationId 
        );

        order.pterodactylOrderDetails = {
            panelUsername: userPtero.username,
            pterodactylUserId: userPtero.id,
            pterodactylServerId: serverPtero.id,
            statusMessage: 'Akun dan server berhasil dibuat di Pterodactyl.',
            panelDomain: PTERO_API_URL.replace('/api/application', '') // Asumsi URL panel sama dengan base API tanpa /api/application
        };
        order.status = 'completed';
        await order.save();

        res.json({
            success: true,
            message: 'Akun panel dan server berhasil dibuat!',
            panelUsername: userPtero.username,
            panelPassword: panel_password, 
            panelDomain: order.pterodactylOrderDetails.panelDomain,
            serverDetails: serverPtero
        });

    } catch (error) {
        console.error("Error in setupPterodactylAccount:", error);
        await Order.findByIdAndUpdate(orderId, { 
            status: 'pterodactyl_setup_failed',
            $set: { 'pterodactylOrderDetails.statusMessage': `Gagal setup: ${error.message}` }
        });
        res.status(500).json({ success: false, message: `Gagal setup Pterodactyl: ${error.message}` });
    }
};