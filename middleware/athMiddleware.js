// middleware/authMiddleware.js
const isAuthenticated = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    req.flash('error', 'Anda harus login untuk mengakses halaman ini.');
    res.redirect('/login');
};

const isGuest = (req, res, next) => {
    if (!req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/'); // atau ke dashboard pengguna
};

module.exports = { isAuthenticated, isGuest };