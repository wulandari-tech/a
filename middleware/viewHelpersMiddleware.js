// middleware/viewHelpersMiddleware.js
const moment = require('moment'); // Contoh, Anda mungkin perlu menginstal 'moment' -> npm install moment
require('moment/locale/id'); // Set locale ke Bahasa Indonesia untuk moment

module.exports = (req, res, next) => {
    // Helper untuk memformat tanggal
    res.locals.formatDate = (date, format = 'D MMMM YYYY, HH:mm') => {
        return moment(date).format(format);
    };

    // Helper untuk memotong string dengan aman
    res.locals.truncateText = (text, length = 100) => {
        if (!text) return '';
        if (text.length <= length) {
            return text;
        }
        return text.substring(0, length) + '...';
    };

    // Helper untuk format mata uang
    res.locals.formatCurrency = (amount, currency = 'IDR') => {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    // Contoh meneruskan beberapa variabel environment ke semua view
    res.locals.NODE_ENV = process.env.NODE_ENV || 'development';

    // Anda bisa menambahkan helper lain di sini
    
    next();
};