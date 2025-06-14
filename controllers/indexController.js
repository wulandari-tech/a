const Information = require('../models/information');

exports.getLandingPage = (req, res) => {
    res.render('landing', {
        pageTitle: 'Selamat Datang',
        currentUser: req.session.user,
    });
};

exports.getInformasiPage = async (req, res) => {
    try {
        const informations = await Information.find({ isActive: true }).sort({ createdAt: -1 });
        res.render('info_board', {
            pageTitle: 'Papan Informasi',
            informations,
            currentUser: req.session.user,
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Gagal memuat papan informasi.');
        res.redirect('/');
    }
};

exports.getChatPage = (req, res) => {
    res.render('chat', {
        pageTitle: 'Live Chat Support',
        currentUser: req.session.user,
    });
};