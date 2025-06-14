const Order = require('../models/order');
const Product = require('../models/product');
const User = require('../models/user');


const DO_API_TOKEN = process.env.DO_API_TOKEN;
const DO_API_URL = 'https://api.digitalocean.com/v2';


async function createDigitalOceanDroplet(productName, userEmail, productSpecs, rootPassword) {
    if (!DO_API_TOKEN) {
        throw new Error('Konfigurasi API DigitalOcean tidak lengkap.');
    }
    const dropletName = `${productName.toLowerCase().replace(/\s+/g, '-')}-${userEmail.split('@')[0]}-${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
        name: dropletName,
        region: productSpecs.region || 'sgp1',
        size: productSpecs.size || 's-1vcpu-1gb',
        image: productSpecs.osImage || 'ubuntu-22-04-x64',
        ssh_keys: null, 
        backups: false,
        ipv6: true,
        monitoring: true,
        user_data: `#!/bin/bash\necho "root:${rootPassword}" | chpasswd`,
        tags: ['qoupay-store', productName.toLowerCase().replace(/\s+/g, '-')]
    };

    try {
        console.log("DO: Mencoba membuat droplet dengan payload:", payload);
        // const response = await axios.post(`${DO_API_URL}/droplets`, payload, {
        //     headers: { 'Authorization': `Bearer ${DO_API_TOKEN}`, 'Content-Type': 'application/json' }
        // });
        // console.log("DO: Respons pembuatan droplet:", response.data);
        // if (response.data && response.data.droplet) {
        //     return response.data.droplet;
        // }
        // throw new Error(response.data.message || 'Gagal membuat droplet DigitalOcean.');

        // Placeholder jika API tidak dipanggil
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return { id: Math.floor(Math.random() * 100000), name: dropletName, status: 'new' };
    } catch (error) {
        console.error("DO: Error membuat droplet:", error.response ? error.response.data : error.message);
        const errorMessage = error.response && error.response.data && error.response.data.message
                           ? error.response.data.message
                           : 'Kesalahan internal saat membuat VPS DigitalOcean.';
        throw new Error(errorMessage);
    }
}

async function getDropletIpAddress(dropletId) {
    if (!DO_API_TOKEN) return null;
    try {
        console.log(`DO: Mencoba mendapatkan IP untuk droplet ID: ${dropletId}`);
        // const response = await axios.get(`${DO_API_URL}/droplets/${dropletId}`, {
        //     headers: { 'Authorization': `Bearer ${DO_API_TOKEN}` }
        // });
        // if (response.data && response.data.droplet && response.data.droplet.networks && response.data.droplet.networks.v4.length > 0) {
        //     const publicIp = response.data.droplet.networks.v4.find(net => net.type === 'public');
        //     console.log("DO: IP ditemukan:", publicIp ? publicIp.ip_address : "Tidak ada IP publik");
        //     return publicIp ? publicIp.ip_address : null;
        // }
        // return null;

        // Placeholder
        await new Promise(resolve => setTimeout(resolve, 2000)); 
        return `192.168.1.${Math.floor(Math.random() * 254)}`;
    } catch (error) {
        console.error("DO: Error mendapatkan IP droplet:", error.response ? error.response.data : error.message);
        return null;
    }
}


exports.setupDigitalOceanVps = async (req, res) => {
    const { orderId, root_password } = req.body;
    const userId = req.user._id;

    if (!orderId || !root_password) {
        return res.status(400).json({ success: false, message: "Data tidak lengkap." });
    }
    if (root_password.length < 8) {
        return res.status(400).json({ success: false, message: "Password root minimal 8 karakter." });
    }

    try {
        const order = await Order.findById(orderId).populate('product').populate('user');
        if (!order || order.user._id.toString() !== userId.toString()) {
            return res.status(404).json({ success: false, message: "Order tidak ditemukan atau bukan milik Anda." });
        }
        if (order.status !== 'processing_vps') {
            return res.status(400).json({ success: false, message: "Status order tidak memungkinkan untuk setup VPS." });
        }
        if (!order.product || order.product.category !== 'vps' || !order.product.digitalOceanVpsSpecs) {
            return res.status(400).json({ success: false, message: "Produk tidak valid untuk setup VPS." });
        }

        const droplet = await createDigitalOceanDroplet(
            order.product.name,
            order.user.email,
            order.product.digitalOceanVpsSpecs,
            root_password
        );

        order.digitalOceanVpsOrderDetails = {
            dropletId: droplet.id,
            hostname: droplet.name,
            ipAddress: 'Sedang diproses...',
            statusMessage: 'VPS berhasil dibuat, menunggu IP Address.',
        };
        order.status = 'completed'; 
        await order.save();
        
        let ipAddress = null;
        for (let i = 0; i < 5; i++) { 
            await new Promise(resolve => setTimeout(resolve, 15000 * (i + 1))); 
            ipAddress = await getDropletIpAddress(droplet.id);
            if (ipAddress) {
                order.digitalOceanVpsOrderDetails.ipAddress = ipAddress;
                order.digitalOceanVpsOrderDetails.statusMessage = 'VPS Aktif dengan IP Address.';
                await order.save();
                break;
            }
        }


        res.json({
            success: true,
            message: 'VPS berhasil dibuat! IP Address sedang dialokasikan.',
            hostname: droplet.name,
            ipAddress: order.digitalOceanVpsOrderDetails.ipAddress,
            rootPassword: root_password,
            dropletId: droplet.id
        });

    } catch (error) {
        console.error("Error in setupDigitalOceanVps:", error);
        await Order.findByIdAndUpdate(orderId, { 
            status: 'vps_setup_failed',
            $set: { 'digitalOceanVpsOrderDetails.statusMessage': `Gagal setup: ${error.message}` }
        });
        res.status(500).json({ success: false, message: `Gagal setup VPS: ${error.message}` });
    }
};