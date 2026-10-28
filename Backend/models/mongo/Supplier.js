
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

        contactPerson: {
            type: String,
            trim: true,
            maxlength: [150, 'Contact person cannot exceed 150 characters'],
            default: ''
        },

        website: {
            type: String,
            trim: true,
            maxlength: [500, 'Website cannot exceed 500 characters'],
            default: ''
        },

        taxId: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: [64, 'Tax ID cannot exceed 64 characters'],
            default: null,
            set: value =>
                typeof value === 'string' && value.trim() === ''
                ? null
                : value
        },

        paymentTerms: {
            type: String,
            trim: true,
            maxlength: [100, 'Payment terms cannot exceed 100 characters'],
            default: ''
        },

        rating: {
            type: Number,
            min: [0, 'Rating cannot be less than 0'],
            max: [5, 'Rating cannot exceed 5'],
            default: null
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: [254, 'Email cannot exceed 254 characters'],
            default: null,
            set: value =>
                typeof value === 'string' && value.trim() === ''
                ? null
                : value
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

        status: {
            type: String,
            enum: {
                values: ['active', 'inactive', 'blocked'],
                message: 'Invalid supplier status'
            },
            default: 'active',
            required: true
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
// A supplier email must be unique within each user's inventory.
supplierSchema.index(
    { ownerId: 1, email: 1 },
    {
        unique: true,
        partialFilterExpression: {
            email: { $type: 'string' }
        }
    }
);

// A supplier tax ID must be unique within each user's inventory.
supplierSchema.index(
    { ownerId: 1, taxId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            taxId: { $type: 'string' }
        }
    }
);

module.exports = mongoose.model('Supplier', supplierSchema);
