// routes/informationBoardRoutes.js
const express = require('express');
const router = express.Router();
const informationBoardController = require('../controllers/informationBoardController');
const { isAuthenticated, isAdmin } = require('../middleware/authMiddleware'); 
router.get('/', isAuthenticated, isAdmin, informationBoardController.getManageInfoPage);
router.post('/add', isAuthenticated, isAdmin, informationBoardController.addInfoItem); // Middleware harus ada di sini
router.post('/delete/:id', isAuthenticated, isAdmin, informationBoardController.deleteInfoItem);
router.post('/toggle/:id', isAuthenticated, isAdmin, informationBoardController.toggleInfoItemActive);

module.exports = router;