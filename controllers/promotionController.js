exports.getPromotionsPage = async (req, res) => {
    try {
        const promotions = [];
        res.render('promotions_page', {
            pageTitle: 'Promosi Spesial',
            promotions: promotions
        });
    } catch (error) {
        console.error(error);
        req.flash('error_messages', 'Gagal memuat halaman promosi.');
        res.redirect('/');
    }
};