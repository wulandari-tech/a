const express = require('express');
const router = express.Router();
const digitalOceanController = require('../controllers/digitalOceanController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.post('/setup-vps', isAuthenticated, digitalOceanController.setupDigitalOceanVps);

module.exports = router;