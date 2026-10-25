
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
            maxlength: [150, 'Product name cannot exceed 150 characters']
        },

        sku: {
            type: String,
            required: [true, 'SKU is required'],
            trim: true,
            uppercase: true,
            maxlength: [64, 'SKU cannot exceed 64 characters']
        },

        description: {
            type: String,
            trim: true,
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
            default: ''
        },

        category: {
            type: String,
            trim: true,
            maxlength: [100, 'Category cannot exceed 100 characters'],
            default: 'Uncategorized'
        },

        price: {
            type: Number,
            required: true,
            min: [0, 'Price cannot be negative']
        },

        costPrice: {
            type: Number,
            required: true,
            min: [0, 'Cost price cannot be negative']
        },

        stockQuantity: {
            type: Number,
            required: true,
            min: [0, 'Stock cannot be negative'],
            validate: {
                validator: Number.isInteger,
                message: 'Stock quantity must be an integer'
            },
            default: 0
        },

        reorderLevel: {
            type: Number,
            min: [0, 'Reorder level cannot be negative'],
            validate: {
                validator: Number.isInteger,
                message: 'Reorder level must be an integer'
            },
            default: 10
        },

        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Supplier',
            default: null
        },

        imageUrl: {
            type: String,
            trim: true,
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

// Each user can have a given SKU only once.
productSchema.index(
    { ownerId: 1, sku: 1 },
    { unique: true }
);

// Useful for inventory and low-stock queries.
productSchema.index({ ownerId: 1, isActive: 1 });
productSchema.index({ ownerId: 1, stockQuantity: 1 });

module.exports = mongoose.model('Product', productSchema);
