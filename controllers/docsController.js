exports.getDocsPage = (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`; 
    res.render('docs/index', {
        pageTitle: 'Dokumentasi API - QOUPAY Store',
        baseUrl: baseUrl
    });
};