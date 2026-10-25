
const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        name: {
            type: String,
            required: [true, 'Supplier name is required'],
            trim: true,
            maxlength: [150, 'Supplier name cannot exceed 150 characters']
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: [254, 'Email cannot exceed 254 characters'],
            default: ''
        },

        phone: {
            type: String,
            trim: true,
            maxlength: [30, 'Phone cannot exceed 30 characters'],
            default: ''
        },

        address: {
            type: String,
            trim: true,
            maxlength: [500, 'Address cannot exceed 500 characters'],
            default: ''
        },

        notes: {
            type: String,
            trim: true,
            maxlength: [2000, 'Notes cannot exceed 2000 characters'],
            default: ''
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

supplierSchema.index({ ownerId: 1, name: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
