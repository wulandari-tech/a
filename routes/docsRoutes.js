const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    try {
        const storeName = process.env.STORE_NAME || "QOUPAY STORE";
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        res.render('docs/index', {
            pageTitle: 'Dokumentasi API',
            storeName: storeName,
            baseUrl: baseUrl,
            activePage: 'dokumentasi' 
        });
    } catch (error) {
        console.error("Error rendering documentation page:", error);
        res.status(500).send("Terjadi kesalahan saat memuat halaman dokumentasi.");
    }
});

module.exports = router;