const services = [
    {
        categoryTitle: 'Top Up Game',
        categorySlug: 'games', 
        categoryApi: 'games', 
        items: [
            {
                title: 'Mobile Legends: Bang Bang',
                slug: 'mobile-legends',
                slugApi: 'mobile-legends',
                banner: '/images/ml_banner.jpg', 
                productIdLabel: 'User ID',
                needsZoneId: true,
                zoneIdLabel: 'Zone ID',
                zoneIdOptional: false,
                targetFormatInfo: 'Masukkan User ID dan Zone ID akun Mobile Legends Anda.',
                productTypeApi: 'game_topup',
                productGroups: [
                    { title: 'Diamonds', filterCode: null }, 
                    { title: 'Starlight Member', filterCode: 'MLS' },
                    { title: 'Weekly Diamond Pass', filterCode: 'MLW' },
                    { title: 'Twilight Pass', filterCode: 'MLT' } 
                ]
            },
            {
                title: 'PUBG Mobile',
                slug: 'pubg-mobile',
                slugApi: 'pubg', 
                banner: '/images/pubg_banner.jpg',
                productIdLabel: 'Player ID',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan Player ID akun PUBG Mobile Anda.',
                productTypeApi: 'game_topup',
                productGroups: [ { title: 'UC (Unknown Cash)', filterCode: null } ]
            },
            {
                title: 'Free Fire',
                slug: 'free-fire',
                slugApi: 'free-fire',
                banner: '/images/ff_banner.jpg',
                productIdLabel: 'Player ID',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan Player ID akun Free Fire Anda.',
                productTypeApi: 'game_topup',
                productGroups: [ { title: 'Diamonds', filterCode: null } ]
            },
            {
                title: 'Honor of Kings',
                slug: 'honor-of-kings',
                slugApi: 'hok', 
                banner: '/images/hok_banner.jpg', 
                productIdLabel: 'Player ID',
                needsZoneId: false, 
                targetFormatInfo: 'Masukkan Player ID akun Honor of Kings Anda.',
                productTypeApi: 'game_topup',
                productGroups: [ { title: 'Tokens', filterCode: null } ]
            },
            {
                title: 'Genshin Impact',
                slug: 'genshin-impact',
                slugApi: 'genshin-impact',
                banner: '/images/genshin_banner.jpg',
                productIdLabel: 'UID',
                needsZoneId: true,
                zoneIdLabel: 'Server',
                zoneIdOptional: false,
                targetFormatInfo: 'Masukkan UID dan pilih Server akun Genshin Impact Anda.',
                productTypeApi: 'game_topup',
                productGroups: [ { title: 'Genesis Crystals', filterCode: null } ]
            }
        ]
    },
    {
        categoryTitle: 'E-Wallet & Transfer',
        categorySlug: 'e-wallet', 
        categoryApi: 'e-money', 
        items: [
            {
                title: 'DANA TopUp',
                slug: 'dana',
                slugApi: 'dana',
                banner: '/images/dana_logo.png',
                productIdLabel: 'Nomor DANA',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan nomor DANA yang terdaftar (Contoh: 08xxxxxxxxxx).',
                productTypeApi: 'ppob_generic',
                productGroups: [ { title: 'Saldo DANA', filterCode: null } ]
            },
            {
                title: 'GoPay Customer TopUp',
                slug: 'gopay',
                slugApi: 'gopay',
                banner: '/images/gopay_logo.png',
                productIdLabel: 'Nomor GoPay',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan nomor GoPay yang terdaftar (Contoh: 08xxxxxxxxxx).',
                productTypeApi: 'ppob_generic',
                productGroups: [ { title: 'Saldo GoPay', filterCode: null } ]
            },
            {
                title: 'OVO TopUp',
                slug: 'ovo',
                slugApi: 'ovo',
                banner: '/images/ovo_logo.png',
                productIdLabel: 'Nomor OVO',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan nomor OVO yang terdaftar (Contoh: 08xxxxxxxxxx).',
                productTypeApi: 'ppob_generic',
                productGroups: [ { title: 'Saldo OVO', filterCode: null } ]
            },
            {
                title: 'ShopeePay TopUp',
                slug: 'shopeepay',
                slugApi: 'shopeepay',
                banner: '/images/shopeepay_logo.png',
                productIdLabel: 'Nomor ShopeePay',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan nomor ShopeePay yang terdaftar (Contoh: 08xxxxxxxxxx).',
                productTypeApi: 'ppob_generic',
                productGroups: [ { title: 'Saldo ShopeePay', filterCode: null } ]
            },
            {
                title: 'LinkAja TopUp',
                slug: 'linkaja',
                slugApi: 'linkaja',
                banner: '/images/linkaja_logo.png',
                productIdLabel: 'Nomor LinkAja',
                needsZoneId: false,
                targetFormatInfo: 'Masukkan nomor LinkAja yang terdaftar (Contoh: 08xxxxxxxxxx).',
                productTypeApi: 'ppob_generic',
                productGroups: [ { title: 'Saldo LinkAja', filterCode: null } ]
            }
        ]
    },
    {
        categoryTitle: 'Transfer Dana',
        categorySlug: 'transfer',
        categoryApi: 'transfer', 
        isDirectPage: true, 
        items: [
            {
                title: 'Transfer Bank & E-Wallet',
                slug: 'bank-ewallet', 
                slugApi: null, 
                banner: '/images/transfer_icon.png',
                productIdLabel: 'Nomor Rekening/E-Wallet Tujuan',
                needsZoneId: false,
                targetFormatInfo: 'Transfer dana ke berbagai bank atau e-wallet.',
                productTypeApi: 'transfer_fund', 
                customPagePath: '/layanan/transfer/bank-ewallet' 
            }
        ]
    }
];

function findServiceBySlug(categorySlug, itemSlug) {
    const category = services.find(cat => cat.categorySlug === categorySlug);
    if (category) {
        const item = category.items.find(itm => itm.slug === itemSlug);
        if (item) {
            return {
                ...item,
                categoryTitle: category.categoryTitle,
                categorySlug: category.categorySlug,
                categoryApi: category.categoryApi,
            };
        }
    }
    return null;
}

function getServicesByCategory(categorySlug) {
    const category = services.find(cat => cat.categorySlug === categorySlug);
    if (category) {
        return category.items.map(item => ({
            ...item,
            categoryTitle: category.categoryTitle,
            categorySlug: category.categorySlug,
            categoryApi: category.categoryApi,
        }));
    }
    return [];
}

function getAllServiceCategoriesForNav() {
    return services.map(cat => ({
        title: cat.categoryTitle,
        slug: cat.categorySlug,
        isDirectPage: cat.isDirectPage || false,
        firstItemSlug: cat.items.length > 0 ? cat.items[0].slug : null,
        customPagePath: cat.items.length > 0 && cat.items[0].customPagePath ? cat.items[0].customPagePath : null
    }));
}


module.exports = {
    services,
    findServiceBySlug,
    getServicesByCategory,
    getAllServiceCategoriesForNav
};