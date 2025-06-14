const InformationBoardItem = require('../models/informationBoardItem');
const mongoose = require('mongoose');

exports.getActiveInformationItems = async () => {
    try {
        const items = await InformationBoardItem.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('createdBy', 'username')
            .lean();
        return items;
    } catch (error) {
        console.error("Error fetching active information items:", error);
        return [];
    }
};

exports.getManageInformationBoardPage = async (req, res) => {
    try {
        const items = await InformationBoardItem.find({}).populate('createdBy', 'username').sort({ createdAt: -1 });
        res.render('admin/manage_infoboard', {
            pageTitle: 'Admin - Kelola Papan Informasi',
            items,
            activePage: 'infoboard'
        });
    } catch (error) {
        console.error("Error getting information board page:", error);
        req.flash('adminError', 'Gagal memuat halaman papan informasi.');
        res.redirect('/admin/dashboard');
    }
};

exports.addInformationItem = async (req, res) => {
    try {
        const { title, content, type } = req.body;
        if (!title || !content) {
            req.flash('adminError', 'Judul dan Konten tidak boleh kosong.');
            return res.redirect('/admin/information-board');
        }
        const newItemData = {
            title,
            content,
            type: type || 'info',
            isActive: true,
            createdBy: req.session.user ? req.session.user._id : null
        };
        const newItem = new InformationBoardItem(newItemData);
        await newItem.save();
        const io = req.app.get('io');
        if (io && newItem.isActive) {
            const populatedItem = await InformationBoardItem.findById(newItem._id).populate('createdBy', 'username').lean();
            const infoForClient = {
                _id: populatedItem._id.toString(),
                title: populatedItem.title,
                content: populatedItem.content,
                type: populatedItem.type,
                createdBy: populatedItem.createdBy ? { username: populatedItem.createdBy.username } : { username: 'Sistem' },
                createdAt: populatedItem.createdAt
            };
            io.emit('newInfoBoardUpdate', infoForClient);
        }
        req.flash('adminSuccess', 'Item informasi baru berhasil ditambahkan.');
        res.redirect('/admin/information-board');
    } catch (error) {
        console.error("Error adding information item:", error);
        req.flash('adminError', 'Gagal menambahkan item informasi: ' + error.message);
        res.redirect('/admin/information-board');
    }
};

exports.deleteInformationItem = async (req, res) => {
    try {
        const itemId = req.params.id;
        const deletedItem = await InformationBoardItem.findByIdAndDelete(itemId);
        if (deletedItem) {
            const io = req.app.get('io');
            if (io) io.emit('infoBoardItemDeleted', { _id: itemId });
        }
        req.flash('adminSuccess', 'Item informasi berhasil dihapus.');
        res.redirect('/admin/information-board');
    } catch (error) {
        console.error("Error deleting information item:", error);
        req.flash('adminError', 'Gagal menghapus item informasi.');
        res.redirect('/admin/information-board');
    }
};

exports.toggleInformationItemStatus = async (req, res) => {
    try {
        const itemId = req.params.id;
        const item = await InformationBoardItem.findById(itemId).populate('createdBy', 'username');
        if (!item) {
            req.flash('adminError', 'Item informasi tidak ditemukan.');
            return res.redirect('/admin/information-board');
        }
        item.isActive = !item.isActive;
        await item.save();
        const io = req.app.get('io');
        if (io) {
            if (!item.isActive) {
                io.emit('infoBoardItemDeleted', { _id: item._id.toString() });
            } else {
                const infoForClient = {
                    _id: item._id.toString(),
                    title: item.title,
                    content: item.content,
                    type: item.type,
                    createdBy: item.createdBy ? { username: item.createdBy.username } : { username: 'Sistem' },
                    createdAt: item.createdAt
                };
                io.emit('newInfoBoardUpdate', infoForClient);
            }
        }
        req.flash('adminSuccess', `Status item informasi berhasil diubah menjadi ${item.isActive ? 'Aktif' : 'Nonaktif'}.`);
        res.redirect('/admin/information-board');
    } catch (error) {
        console.error("Error toggling information item status:", error);
        req.flash('adminError', 'Gagal mengubah status item informasi.');
        res.redirect('/admin/information-board');
    }
};

exports.getPublicInformationBoardPage = async (req, res) => {
    try {
        const informations = await InformationBoardItem.find({ isActive: true })
            .sort({ createdAt: -1 })
            .populate('createdBy', 'username')
            .lean();
        res.render('info_board', {
            pageTitle: 'Papan Informasi',
            informations,
            activePage: 'infoboard'
        });
    } catch (error) {
        console.error("Error fetching public information board:", error);
        req.flash('error_messages', 'Gagal memuat papan informasi.');
        res.render('info_board', {
            pageTitle: 'Papan Informasi',
            informations: [],
            activePage: 'infoboard'
        });
    }
};