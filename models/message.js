const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: {
        type: String,
        required: true
    },
    senderType: {
        type: String,
        enum: ['user', 'admin'],
        required: true
    },
    receiver: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    readByAdmin: {
        type: Boolean,
        default: false
    },
    readByUser: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Message', MessageSchema);