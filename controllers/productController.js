const Product = require('../models/product');
const User = require('../models/user');
const { validationResult } = require('express-validator');

exports.getStoreIndexPage = async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = { 
            isActive: true,
            needsAdminApproval: false 
        };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (category && category !== 'all') {
            query.category = category;
        }

        const products = await Product.find(query).populate('createdBy', 'username').sort({ createdAt: -1 });
        const categories = await Product.distinct('category', { isActive: true, needsAdminApproval: false });
        
        res.render('store/index', {
            pageTitle: (category && category !== 'all') ? category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Produk & Layanan Toko',
            products,
            categories,
            currentSearch: search || '',
            currentCategory: category || 'all',
            activePage: 'produk'
        });
    } catch (error) {
        console.error("Error fetching store products:", error);
        req.flash('error_messages', 'Gagal memuat produk toko.');
        res.render('store/index', { pageTitle: 'Produk Toko', products: [], categories: [], currentSearch: '', currentCategory: 'all', activePage: 'produk' });
    }
};

exports.getProductDetailPage = async (req, res) => {
    try {
        const product = await Product.findOne({_id: req.params.id, isActive: true, needsAdminApproval: false });
        if (!product) {
            req.flash('error_messages', 'Produk tidak ditemukan atau tidak aktif.');
            return res.redirect('/products');
        }
        res.render('store/product_detail', { pageTitle: product.name, product, activePage: 'produk' });
    } catch (error) {
        console.error("Error fetching product detail:", error);
        req.flash('error_messages', 'Gagal memuat detail produk.');
        res.redirect('/products');
    }
};


exports.getProductsPageAdmin = async (req, res) => {
    try {
        const products = await Product.find().populate('createdBy', 'username').sort({ createdAt: -1 });
        res.render('admin/products', { pageTitle: 'Admin - Kelola Produk', products, activePage: 'produk' });
    } catch (error) {
        console.error("Error fetching products for admin:", error);
        req.flash('adminError', 'Gagal memuat daftar produk.');
        res.redirect('/admin/dashboard');
    }
};

exports.getAddProductPageAdmin = (req, res) => {
    res.render('admin/add_product', { pageTitle: 'Admin - Tambah Produk Baru', product: {}, errors: [], oldInput: {}, activePage: 'produk' });
};

exports.postAddProductAdmin = async (req, res) => {
    const { name, description, price, resellerPrice, stock, category } = req.body;
    const pterodactylSpecsData = req.body.pterodactylSpecs;
    const digitalOceanVpsSpecsData = req.body.digitalOceanVpsSpecs;
    const appPremiumDetailsData = req.body.appPremiumDetails;

    let errors = [];
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Nama produk tidak boleh kosong.' });
    if (!description || description.trim() === '') errors.push({ param: 'description', msg: 'Deskripsi produk tidak boleh kosong.' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push({ param: 'price', msg: 'Harga harus angka positif.' });
    if (resellerPrice && (isNaN(parseFloat(resellerPrice)) || parseFloat(resellerPrice) < 0)) errors.push({ param: 'resellerPrice', msg: 'Harga reseller harus angka positif jika diisi.' });
    if (stock === undefined || stock === null || isNaN(parseInt(stock))) errors.push({ param: 'stock', msg: 'Stok harus angka (atau -1 untuk tidak terbatas).' });
    if (!category || category.trim() === '') errors.push({ param: 'category', msg: 'Kategori wajib dipilih.' });

    if (category === 'pterodactyl_panel') {
        if (!pterodactylSpecsData || !pterodactylSpecsData.ram || isNaN(parseInt(pterodactylSpecsData.ram))) errors.push({ param: 'pteroRam', msg: 'RAM Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.disk || isNaN(parseInt(pterodactylSpecsData.disk))) errors.push({ param: 'pteroDisk', msg: 'Disk Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.cpu || isNaN(parseInt(pterodactylSpecsData.cpu))) errors.push({ param: 'pteroCpu', msg: 'CPU Pterodactyl harus angka.' });
    } else if (category === 'vps') {
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.region || digitalOceanVpsSpecsData.region.trim() === '') errors.push({ param: 'doRegion', msg: 'Region VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.size || digitalOceanVpsSpecsData.size.trim() === '') errors.push({ param: 'doSize', msg: 'Ukuran VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.osImage || digitalOceanVpsSpecsData.osImage.trim() === '') errors.push({ param: 'doOsImage', msg: 'Image OS VPS tidak boleh kosong.' });
    } else if (category === 'app_premium') {
        if (!appPremiumDetailsData || !appPremiumDetailsData.deliveryInstructions || appPremiumDetailsData.deliveryInstructions.trim() === '') {
            errors.push({ param: 'appDeliveryInstructions', msg: 'Instruksi pengiriman Aplikasi Premium wajib diisi.' });
        }
    }

    if (errors.length > 0) {
        return res.render('admin/add_product', { pageTitle: 'Admin - Tambah Produk Baru', product: {}, errors: errors, oldInput: req.body, activePage: 'produk' });
    }

    try {
        const newProductData = {
            name: name.trim(),
            description: description.trim(),
            price: parseFloat(price),
            resellerPrice: (resellerPrice && String(resellerPrice).trim() !== '' && !isNaN(parseFloat(resellerPrice))) ? parseFloat(resellerPrice) : undefined,
            stock: parseInt(stock),
            category,
            isActive: req.body.isActive === 'on',
            createdBy: req.user._id,
            needsAdminApproval: false 
        };

        if (category === 'pterodactyl_panel' && pterodactylSpecsData) {
            newProductData.pterodactylSpecs = { ram: parseInt(pterodactylSpecsData.ram), disk: parseInt(pterodactylSpecsData.disk), cpu: parseInt(pterodactylSpecsData.cpu) };
        } else if (category === 'vps' && digitalOceanVpsSpecsData) {
            newProductData.digitalOceanVpsSpecs = { region: digitalOceanVpsSpecsData.region.trim(), size: digitalOceanVpsSpecsData.size.trim(), osImage: digitalOceanVpsSpecsData.osImage.trim() };
        } else if (category === 'app_premium' && appPremiumDetailsData) {
            newProductData.appPremiumDetails = {
                vccInfo: appPremiumDetailsData.vccInfo ? appPremiumDetailsData.vccInfo.trim() : '',
                fileUrl: appPremiumDetailsData.fileUrl ? appPremiumDetailsData.fileUrl.trim() : '',
                deliveryInstructions: appPremiumDetailsData.deliveryInstructions.trim()
            };
            if (newProductData.appPremiumDetails.vccInfo && newProductData.stock !== -1) {
                const accountLines = newProductData.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                newProductData.stock = accountLines.length;
            }
        }

        const product = new Product(newProductData);
        await product.save();
        req.flash('adminSuccess', 'Produk baru berhasil ditambahkan!');
        res.redirect('/admin/products');
    } catch (err) {
        console.error('Error saving product:', err);
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            errors.push({ msg: `Nama produk '${name}' sudah ada. Silakan gunakan nama lain.` });
        } else if (err.name === 'ValidationError') {
            for (let field in err.errors) {
                errors.push({ param: field, msg: err.errors[field].message });
            }
        } else {
            errors.push({ msg: 'Terjadi kesalahan pada server saat menyimpan produk: ' + err.message });
        }
        return res.render('admin/add_product', { pageTitle: 'Admin - Tambah Produk Baru', product: {}, errors: errors, oldInput: req.body, activePage: 'produk' });
    }
};

exports.getEditProductPageAdmin = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            req.flash('adminError', 'Produk tidak ditemukan.');
            return res.redirect('/admin/products');
        }
        res.render('admin/edit_product', { pageTitle: `Admin - Edit Produk: ${product.name}`, product, errors: [], oldInput: product.toObject(), activePage: 'produk' });
    } catch (error) {
        console.error("Error fetching product for edit:", error);
        req.flash('adminError', 'Gagal memuat data produk untuk diedit.');
        res.redirect('/admin/products');
    }
};

exports.postEditProductAdmin = async (req, res) => {
    const productId = req.params.id;
    const { name, description, price, resellerPrice, stock, category, needsAdminApprovalProduct, isActiveProduct } = req.body;
    const pterodactylSpecsData = req.body.pterodactylSpecs;
    const digitalOceanVpsSpecsData = req.body.digitalOceanVpsSpecs;
    const appPremiumDetailsData = req.body.appPremiumDetails;

    let errors = [];
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Nama produk tidak boleh kosong.' });
    if (!description || description.trim() === '') errors.push({ param: 'description', msg: 'Deskripsi produk tidak boleh kosong.' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push({ param: 'price', msg: 'Harga harus angka positif.' });
    if (resellerPrice && (isNaN(parseFloat(resellerPrice)) || parseFloat(resellerPrice) < 0)) errors.push({ param: 'resellerPrice', msg: 'Harga reseller harus angka positif jika diisi.' });
    if (stock === undefined || stock === null || isNaN(parseInt(stock))) errors.push({ param: 'stock', msg: 'Stok harus angka (atau -1 untuk tidak terbatas).' });
    if (!category || category.trim() === '') errors.push({ param: 'category', msg: 'Kategori wajib dipilih.' });

    if (category === 'pterodactyl_panel') {
        if (!pterodactylSpecsData || !pterodactylSpecsData.ram || isNaN(parseInt(pterodactylSpecsData.ram))) errors.push({ param: 'pteroRam', msg: 'RAM Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.disk || isNaN(parseInt(pterodactylSpecsData.disk))) errors.push({ param: 'pteroDisk', msg: 'Disk Pterodactyl harus angka.' });
        if (!pterodactylSpecsData || !pterodactylSpecsData.cpu || isNaN(parseInt(pterodactylSpecsData.cpu))) errors.push({ param: 'pteroCpu', msg: 'CPU Pterodactyl harus angka.' });
    } else if (category === 'vps') {
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.region || digitalOceanVpsSpecsData.region.trim() === '') errors.push({ param: 'doRegion', msg: 'Region VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.size || digitalOceanVpsSpecsData.size.trim() === '') errors.push({ param: 'doSize', msg: 'Ukuran VPS tidak boleh kosong.' });
        if (!digitalOceanVpsSpecsData || !digitalOceanVpsSpecsData.osImage || digitalOceanVpsSpecsData.osImage.trim() === '') errors.push({ param: 'doOsImage', msg: 'Image OS VPS tidak boleh kosong.' });
    } else if (category === 'app_premium') {
        if (!appPremiumDetailsData || !appPremiumDetailsData.deliveryInstructions || appPremiumDetailsData.deliveryInstructions.trim() === '') {
            errors.push({ param: 'appDeliveryInstructions', msg: 'Instruksi pengiriman Aplikasi Premium wajib diisi.' });
        }
    }

    if (errors.length > 0) {
        const productToRender = await Product.findById(productId) || {};
        return res.render('admin/edit_product', { pageTitle: `Admin - Edit Produk: ${productToRender.name || 'Error'}`, product: productToRender, errors: errors, oldInput: req.body, activePage: 'produk' });
    }

    try {
        const productToUpdate = await Product.findById(productId);
        if (!productToUpdate) {
            req.flash('adminError', 'Produk tidak ditemukan untuk diedit.');
            return res.redirect('/admin/products');
        }

        productToUpdate.name = name.trim();
        productToUpdate.description = description.trim();
        productToUpdate.price = parseFloat(price);
        productToUpdate.resellerPrice = (resellerPrice && String(resellerPrice).trim() !== '' && !isNaN(parseFloat(resellerPrice))) ? parseFloat(resellerPrice) : undefined;
        productToUpdate.stock = parseInt(stock);
        productToUpdate.category = category;
        productToUpdate.isActive = isActiveProduct === 'on';
        if(productToUpdate.isSellerProduct){
            productToUpdate.needsAdminApproval = !(needsAdminApprovalProduct === 'approved');
        }
        productToUpdate.updatedAt = Date.now();

        productToUpdate.pterodactylSpecs = undefined;
        productToUpdate.digitalOceanVpsSpecs = undefined;
        productToUpdate.appPremiumDetails = undefined;

        if (category === 'pterodactyl_panel' && pterodactylSpecsData) {
            productToUpdate.pterodactylSpecs = { ram: parseInt(pterodactylSpecsData.ram), disk: parseInt(pterodactylSpecsData.disk), cpu: parseInt(pterodactylSpecsData.cpu) };
        } else if (category === 'vps' && digitalOceanVpsSpecsData) {
            productToUpdate.digitalOceanVpsSpecs = { region: digitalOceanVpsSpecsData.region.trim(), size: digitalOceanVpsSpecsData.size.trim(), osImage: digitalOceanVpsSpecsData.osImage.trim() };
        } else if (category === 'app_premium' && appPremiumDetailsData) {
            productToUpdate.appPremiumDetails = {
                vccInfo: appPremiumDetailsData.vccInfo ? appPremiumDetailsData.vccInfo.trim() : '',
                fileUrl: appPremiumDetailsData.fileUrl ? appPremiumDetailsData.fileUrl.trim() : '',
                deliveryInstructions: appPremiumDetailsData.deliveryInstructions.trim()
            };
            if (productToUpdate.appPremiumDetails.vccInfo && productToUpdate.stock !== -1) {
                const accountLines = productToUpdate.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                productToUpdate.stock = accountLines.length;
            }
        }

        await productToUpdate.save();
        req.flash('adminSuccess', 'Produk berhasil diperbarui!');
        res.redirect('/admin/products');
    } catch (err) {
        console.error(`Error updating product ${productId}:`, err);
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            errors.push({ msg: `Nama produk '${name}' sudah digunakan produk lain.` });
        } else if (err.name === 'ValidationError') {
            for (let field in err.errors) {
                errors.push({ param: field, msg: err.errors[field].message });
            }
        } else {
            errors.push({ msg: 'Terjadi kesalahan pada server saat mengupdate produk: ' + err.message });
        }
        const productToRender = await Product.findById(productId) || {};
        return res.render('admin/edit_product', { pageTitle: `Admin - Edit Produk: ${productToRender.name || 'Error'}`, product: productToRender, errors: errors, oldInput: req.body, activePage: 'produk' });
    }
};

exports.postDeleteProductAdmin = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if(!product){
            req.flash('adminError', 'Produk tidak ditemukan.');
            return res.redirect('/admin/products');
        }
        await Product.findByIdAndDelete(req.params.id);
        req.flash('adminSuccess', 'Produk berhasil dihapus.');
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error deleting product:", error);
        req.flash('adminError', 'Gagal menghapus produk.');
        res.redirect('/admin/products');
    }
};


exports.getSellerProductsPage = async (req, res) => {
    try {
        const products = await Product.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
        res.render('seller/products', { 
            pageTitle: 'Seller - Produk Saya', 
            products, 
            activePage: 'seller-produk' 
        });
    } catch (error) {
        req.flash('error_messages', 'Gagal memuat daftar produk Anda.');
        res.redirect('/seller/dashboard');
    }
};

exports.getAddProductPageSeller = (req, res) => {
    res.render('seller/add_product', { 
        pageTitle: 'Seller - Tambah Produk Baru', 
        product: {}, 
        errors: [], 
        oldInput: {}, 
        activePage: 'seller-produk' 
    });
};

exports.postAddProductSeller = async (req, res) => {
    const { name, description, price, stock, category } = req.body;
    const appPremiumDetailsData = req.body.appPremiumDetails;

    let errors = [];
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Nama produk tidak boleh kosong.' });
    if (!description || description.trim() === '') errors.push({ param: 'description', msg: 'Deskripsi produk tidak boleh kosong.' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push({ param: 'price', msg: 'Harga harus angka positif.' });
    if (stock === undefined || stock === null || isNaN(parseInt(stock))) errors.push({ param: 'stock', msg: 'Stok harus angka (atau -1 untuk tidak terbatas).' });
    if (!category || category.trim() === '' || !['app_premium', 'katalog'].includes(category)) {
        errors.push({ param: 'category', msg: 'Kategori wajib dipilih dan valid untuk seller (Aplikasi Premium atau Katalog Lainnya).' });
    }
    if (category === 'app_premium') {
        if (!appPremiumDetailsData || !appPremiumDetailsData.deliveryInstructions || appPremiumDetailsData.deliveryInstructions.trim() === '') {
            errors.push({ param: 'appDeliveryInstructions', msg: 'Instruksi pengiriman Aplikasi Premium wajib diisi.' });
        }
    }

    if (errors.length > 0) {
        return res.render('seller/add_product', { pageTitle: 'Seller - Tambah Produk Baru', product: {}, errors: errors, oldInput: req.body, activePage: 'seller-produk' });
    }

    try {
        const newProductData = {
            name: name.trim(),
            description: description.trim(),
            price: parseFloat(price),
            stock: parseInt(stock),
            category,
            isActive: req.body.isActive === 'on', 
            createdBy: req.user._id,
            isSellerProduct: true,
            needsAdminApproval: true
        };

        if (category === 'app_premium' && appPremiumDetailsData) {
            newProductData.appPremiumDetails = {
                vccInfo: appPremiumDetailsData.vccInfo ? appPremiumDetailsData.vccInfo.trim() : '',
                fileUrl: appPremiumDetailsData.fileUrl ? appPremiumDetailsData.fileUrl.trim() : '',
                deliveryInstructions: appPremiumDetailsData.deliveryInstructions.trim()
            };
            if (newProductData.appPremiumDetails.vccInfo && newProductData.stock !== -1) {
                const accountLines = newProductData.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                newProductData.stock = accountLines.length;
            }
        }

        const product = new Product(newProductData);
        await product.save();
        req.flash('success_messages', 'Produk baru Anda berhasil ditambahkan dan menunggu persetujuan admin.');
        res.redirect('/seller/products');
    } catch (err) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            errors.push({ msg: `Nama produk '${name}' sudah ada. Silakan gunakan nama lain.` });
        } else if (err.name === 'ValidationError') {
            for (let field in err.errors) {
                errors.push({ param: field, msg: err.errors[field].message });
            }
        } else {
            errors.push({ msg: 'Terjadi kesalahan pada server saat menyimpan produk: ' + err.message });
        }
        return res.render('seller/add_product', { pageTitle: 'Seller - Tambah Produk Baru', product: {}, errors: errors, oldInput: req.body, activePage: 'seller-produk' });
    }
};


exports.getEditProductPageSeller = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, createdBy: req.user._id });
        if (!product) {
            req.flash('error_messages', 'Produk tidak ditemukan atau Anda tidak berhak mengeditnya.');
            return res.redirect('/seller/products');
        }
        res.render('seller/edit_product', { 
            pageTitle: `Seller - Edit Produk: ${product.name}`, 
            product, 
            errors: [], 
            oldInput: product.toObject(), 
            activePage: 'seller-produk' 
        });
    } catch (error) {
        req.flash('error_messages', 'Gagal memuat data produk untuk diedit.');
        res.redirect('/seller/products');
    }
};

exports.postEditProductSeller = async (req, res) => {
    const productId = req.params.id;
    const { name, description, price, stock, category } = req.body;
    const appPremiumDetailsData = req.body.appPremiumDetails;

    let errors = [];
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Nama produk tidak boleh kosong.' });
    if (!description || description.trim() === '') errors.push({ param: 'description', msg: 'Deskripsi produk tidak boleh kosong.' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) errors.push({ param: 'price', msg: 'Harga harus angka positif.' });
    if (stock === undefined || stock === null || isNaN(parseInt(stock))) errors.push({ param: 'stock', msg: 'Stok harus angka (atau -1 untuk tidak terbatas).' });
     if (!category || category.trim() === '' || !['app_premium', 'katalog'].includes(category)) {
        errors.push({ param: 'category', msg: 'Kategori wajib dipilih dan valid untuk seller (Aplikasi Premium atau Katalog Lainnya).' });
    }
    if (category === 'app_premium') {
        if (!appPremiumDetailsData || !appPremiumDetailsData.deliveryInstructions || appPremiumDetailsData.deliveryInstructions.trim() === '') {
            errors.push({ param: 'appDeliveryInstructions', msg: 'Instruksi pengiriman Aplikasi Premium wajib diisi.' });
        }
    }
    
    if (errors.length > 0) {
        const productToRender = await Product.findOne({ _id: productId, createdBy: req.user._id }) || {};
        return res.render('seller/edit_product', { pageTitle: `Seller - Edit Produk: ${productToRender.name || 'Error'}`, product: productToRender, errors: errors, oldInput: req.body, activePage: 'seller-produk' });
    }

    try {
        const productToUpdate = await Product.findOne({ _id: productId, createdBy: req.user._id });
        if (!productToUpdate) {
            req.flash('error_messages', 'Produk tidak ditemukan atau Anda tidak berhak mengeditnya.');
            return res.redirect('/seller/products');
        }

        productToUpdate.name = name.trim();
        productToUpdate.description = description.trim();
        productToUpdate.price = parseFloat(price);
        productToUpdate.stock = parseInt(stock);
        productToUpdate.category = category;
        productToUpdate.isActive = req.body.isActive === 'on';
        productToUpdate.updatedAt = Date.now();
        productToUpdate.needsAdminApproval = true;

        productToUpdate.appPremiumDetails = undefined;
         if (category === 'app_premium' && appPremiumDetailsData) {
            productToUpdate.appPremiumDetails = {
                vccInfo: appPremiumDetailsData.vccInfo ? appPremiumDetailsData.vccInfo.trim() : '',
                fileUrl: appPremiumDetailsData.fileUrl ? appPremiumDetailsData.fileUrl.trim() : '',
                deliveryInstructions: appPremiumDetailsData.deliveryInstructions.trim()
            };
            if (productToUpdate.appPremiumDetails.vccInfo && productToUpdate.stock !== -1) {
                const accountLines = productToUpdate.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                productToUpdate.stock = accountLines.length;
            }
        }


        await productToUpdate.save();
        req.flash('success_messages', 'Produk berhasil diperbarui dan menunggu persetujuan ulang admin.');
        res.redirect('/seller/products');
    } catch (err) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            errors.push({ msg: `Nama produk '${name}' sudah digunakan produk lain.` });
        } else if (err.name === 'ValidationError') {
            for (let field in err.errors) {
                errors.push({ param: field, msg: err.errors[field].message });
            }
        } else {
            errors.push({ msg: 'Terjadi kesalahan pada server saat mengupdate produk: ' + err.message });
        }
        const productToRender = await Product.findOne({ _id: productId, createdBy: req.user._id }) || {};
        return res.render('seller/edit_product', { pageTitle: `Seller - Edit Produk: ${productToRender.name || 'Error'}`, product: productToRender, errors: errors, oldInput: req.body, activePage: 'seller-produk' });
    }
};

exports.postDeleteProductSeller = async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
        if (!product) {
            req.flash('error_messages', 'Produk tidak ditemukan atau Anda tidak berhak menghapusnya.');
            return res.redirect('/seller/products');
        }
        req.flash('success_messages', 'Produk berhasil dihapus.');
        res.redirect('/seller/products');
    } catch (error) {
        req.flash('error_messages', 'Gagal menghapus produk.');
        res.redirect('/seller/products');
    }
};