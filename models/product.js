const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    resellerPrice: {
        type: Number,
        min: 0,
        validate: {
            validator: function(value) {
                return value === undefined || value < this.price;
            },
            message: 'Harga reseller harus lebih rendah dari harga normal jika diisi.'
        }
    },
    stock: {
        type: Number,
        required: true,
        default: 0
    },
    category: {
        type: String,
        required: true,
        enum: ['vps', 'pterodactyl_panel', 'app_premium', 'katalog']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    pterodactylSpecs: {
        ram: Number,
        disk: Number,
        cpu: Number
    },
    digitalOceanVpsSpecs: {
        region: String,
        size: String,
        osImage: String
    },
    appPremiumDetails: {
        vccInfo: String,
        fileUrl: String,
        deliveryInstructions: String
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isSellerProduct: {
        type: Boolean,
        default: false
    },
    needsAdminApproval: {
        type: Boolean,
        default: function() { return this.isSellerProduct; }
    },
    isPromotedBySeller: {
        type: Boolean,
        default: false
    },
    promotionDetails: {
        title: String,
        description: String,
        imageUrl: String,
        validUntil: Date
    }
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;