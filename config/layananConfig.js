const layananConfig = [
    {
        title: 'Mobile Legends: Bang Bang',
        slug: 'mobile-legends',
        categorySlug: 'games',
        categoryApi: 'games',
        slugApi: 'mobile-legends',
        banner: '/images/ml_banner.jpg',
        isActive: true,
        needsZoneId: true,
        zoneIdOptional: false,
        zoneIdLabel: 'Zone ID',
        productIdLabel: 'User ID',
        targetFormatInfo: 'Masukkan User ID dan Zone ID akun Mobile Legends Anda.',
        productGroups: [
            { title: 'Diamonds', filterCode: null, profitPercent: 10 },
            { title: 'Starlight Member', filterCode: 'MLS', profitPercent: 8 },
            { title: 'Weekly Diamond Pass', filterCode: 'MLW', profitPercent: 12 },
        ]
    },
    {
        title: 'PUBG Mobile',
        slug: 'pubg',
        categorySlug: 'games',
        categoryApi: 'games',
        slugApi: 'pubg',
        banner: '/images/pubg_banner.jpg',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Player ID',
        targetFormatInfo: 'Masukkan Player ID akun PUBG Mobile Anda.',
        productGroups: [
            { title: 'UC (Unknown Cash)', filterCode: null, profitPercent: 10 }
        ]
    },
    {
        title: 'Free Fire',
        slug: 'free-fire',
        categorySlug: 'games',
        categoryApi: 'games',
        slugApi: 'freefire',
        banner: '/images/ff_banner.jpg',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Player ID',
        targetFormatInfo: 'Masukkan Player ID akun Free Fire Anda.',
        productGroups: [
            { title: 'Diamonds', filterCode: null, profitPercent: 10 }
        ]
    },
    {
        title: 'Honor of Kings',
        slug: 'honor-of-kings',
        categorySlug: 'games',
        categoryApi: 'games',
        slugApi: 'honorofkings', 
        banner: '/images/hok_banner.jpg', 
        isActive: true,
        needsZoneId: true, 
        zoneIdOptional: true, 
        zoneIdLabel: 'Server ID',
        productIdLabel: 'Player ID',
        targetFormatInfo: 'Masukkan Player ID dan Server ID (jika ada) akun Honor of Kings Anda.',
        productGroups: [
            { title: 'Tokens', filterCode: null, profitPercent: 10 }
        ]
    },
    {
        title: 'Top Up DANA',
        slug: 'dana',
        categorySlug: 'e-wallet',
        categoryApi: 'e-wallet', 
        slugApi: 'dana', 
        banner: '/images/dana_logo.png',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Nomor DANA (08xxxx)',
        targetFormatInfo: 'Masukkan nomor DANA yang terdaftar (Contoh: 081234567890).',
        productGroups: [
            { title: 'Saldo DANA', filterCode: null, profitPercent: 2 }
        ]
    },
    {
        title: 'Top Up GoPay Customer',
        slug: 'gopay',
        categorySlug: 'e-wallet',
        categoryApi: 'e-wallet',
        slugApi: 'gopay',
        banner: '/images/gopay_logo.png',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Nomor GoPay (08xxxx)',
        targetFormatInfo: 'Masukkan nomor GoPay yang terdaftar (Contoh: 081234567890).',
        productGroups: [
            { title: 'Saldo GoPay', filterCode: null, profitPercent: 2 }
        ]
    },
    {
        title: 'Top Up OVO',
        slug: 'ovo',
        categorySlug: 'e-wallet',
        categoryApi: 'e-wallet',
        slugApi: 'ovo',
        banner: '/images/ovo_logo.png',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Nomor OVO (08xxxx)',
        targetFormatInfo: 'Masukkan nomor OVO yang terdaftar (Contoh: 081234567890).',
        productGroups: [
            { title: 'Saldo OVO', filterCode: null, profitPercent: 2 }
        ]
    },
    {
        title: 'Top Up ShopeePay',
        slug: 'shopeepay',
        categorySlug: 'e-wallet',
        categoryApi: 'e-wallet',
        slugApi: 'shopeepay',
        banner: '/images/shopeepay_logo.png',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Nomor ShopeePay (08xxxx)',
        targetFormatInfo: 'Masukkan nomor ShopeePay yang terdaftar (Contoh: 081234567890).',
        productGroups: [
            { title: 'Saldo ShopeePay', filterCode: null, profitPercent: 2 }
        ]
    },
    {
        title: 'Top Up LinkAja',
        slug: 'linkaja',
        categorySlug: 'e-wallet',
        categoryApi: 'e-wallet',
        slugApi: 'linkaja',
        banner: '/images/linkaja_logo.png',
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Nomor LinkAja (08xxxx)',
        targetFormatInfo: 'Masukkan nomor LinkAja yang terdaftar (Contoh: 081234567890).',
        productGroups: [
            { title: 'Saldo LinkAja', filterCode: null, profitPercent: 2 }
        ]
    },
    {
        title: 'Transfer Bank / E-Wallet',
        slug: 'bank-ewallet',
        categorySlug: 'transfer', 
        categoryApi: 'transfer', 
        slugApi: 'dynamic', 
        banner: '/images/transfer_icon.png', 
        isActive: true,
        needsZoneId: false,
        productIdLabel: 'Nomor Rekening/E-Wallet Tujuan',
        targetFormatInfo: 'Pilih bank atau e-wallet tujuan, masukkan nomor dan nominal transfer.',
        productGroups: [] 
    }
];

function getServiceDetails(categorySlug, serviceSlug) {
    return layananConfig.find(s => s.categorySlug === categorySlug && s.slug === serviceSlug);
}

module.exports = {
    layananConfig,
    getServiceDetails
};