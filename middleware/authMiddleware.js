const User = require('../models/user'); 
exports.isAuthenticated = (req, res, next) => {
    if (req.session.user && req.session.userId) {
        res.locals.currentUser = req.session.user;
        req.user = req.session.user;
        return next();
    }
    req.session.returnTo = req.originalUrl;
    req.flash('error_messages', 'Anda harus login untuk mengakses halaman ini.');
    res.redirect('/login');
};

exports.isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error_messages', 'Akses ditolak. Halaman ini hanya untuk admin.');
    res.redirect('/'); // Atau ke halaman dashboard pengguna jika lebih sesuai
};

exports.isGuest = (req, res, next) => {
    if (!req.session.user) {
        return next();
    }
    res.redirect('/user/dashboard'); // Arahkan ke dashboard jika sudah login
};

exports.isSellerApproved = (req, res, next) => {
    if (req.session.user && req.session.user.isSeller && req.session.user.sellerApplicationStatus === 'approved') {
        return next();
    }
    // Admin juga bisa akses route seller untuk keperluan manajemen
    if (req.session.user && req.session.user.role === 'admin'){
         return next(); 
    }
    req.flash('error_messages', 'Akses ditolak. Akun seller Anda belum disetujui atau Anda bukan seller.');
    res.redirect('/user/profile'); 
};