const paymentMethodConfig = [
    {
        name: 'QRIS (via Orkut Payment)',
        metode: 'ORKUT_QRIS_DEPOSIT', 
        type: ['deposit'], 
        gateway_provider: 'ORKUT_QRIS',
        logo_image_url: '/images/qris_logo.png', 
        minimum: 10000,
        maximum: 5000000,
        percentage_fee: 1.0, 
        fixed_fee: 0,
        fee_by_customer: true, 
        status: 'active',
        expired_in_minutes: 60, 
        description: 'Bayar dengan QRIS melalui berbagai aplikasi E-Wallet dan Mobile Banking.'
    },
    {
        name: 'Saldo Akun',
        metode: 'BALANCE',
        type: ['checkout_store', 'checkout_ppob'], 
        gateway_provider: 'INTERNAL',
        logo_image_url: '/images/wallet_icon.png', 
        minimum: 100,
        maximum: 10000000,
        percentage_fee: 0,
        fixed_fee: 0,
        fee_by_customer: false,
        status: 'active',
        description: 'Gunakan saldo internal akun Anda.'
    },
    {
        name: 'QRIS PPOB (via Orkut Payment)',
        metode: 'ORKUT_QRIS_PPOB',
        type: ['checkout_ppob'], 
        gateway_provider: 'ORKUT_QRIS',
        logo_image_url: '/images/qris_logo.png',
        minimum: 1000,
        maximum: 5000000,
        percentage_fee: 0.7, 
        fixed_fee: 0,
        fee_by_customer: true, 
        status: 'active',
        expired_in_minutes: 15, 
        description: 'Bayar layanan PPOB dengan QRIS.'
    },
     {
        name: 'QRIS Produk Toko (via Orkut Payment)',
        metode: 'ORKUT_QRIS_STORE',
        type: ['checkout_store'],
        gateway_provider: 'ORKUT_QRIS',
        logo_image_url: '/images/qris_logo.png',
        minimum: 1000,
        maximum: 5000000,
        percentage_fee: 0.7,
        fixed_fee: 0,
        fee_by_customer: true,
        status: 'active',
        expired_in_minutes: 15,
        description: 'Bayar produk toko dengan QRIS.'
    }
];

module.exports = paymentMethodConfig;