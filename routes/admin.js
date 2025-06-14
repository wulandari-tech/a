const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/authMiddleware');

router.get('/information', isAdmin, adminController.getManageInformationPage);
router.post('/information/add', isAdmin, adminController.addInformation);
router.post('/information/edit/:id', isAdmin, adminController.editInformation);
router.post('/information/delete/:id', isAdmin, adminController.deleteInformation);

router.post('/users/edit/:id', isAdmin, adminController.editUserByAdmin);


module.exports = router;