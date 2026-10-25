
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },

        productName: {
            type: String,
            required: true,
            trim: true
        },

        sku: {
            type: String,
            required: true,
            trim: true
        },

        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1'],
            validate: {
                validator: Number.isInteger,
                message: 'Quantity must be an integer'
            }
        },

        unitPrice: {
            type: Number,
            required: true,
            min: [0, 'Unit price cannot be negative']
        },

        lineTotal: {
            type: Number,
            required: true,
            min: [0, 'Line total cannot be negative']
        }
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        orderNumber: {
            type: String,
            required: true,
            trim: true
        },

        customerName: {
            type: String,
            trim: true,
            maxlength: [150, 'Customer name cannot exceed 150 characters'],
            default: ''
        },

        customerEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: [254, 'Customer email cannot exceed 254 characters'],
            default: ''
        },

        items: {
            type: [orderItemSchema],
            required: true,
            validate: {
                validator: items => items.length > 0,
                message: 'An order must contain at least one item'
            }
        },

        subtotal: {
            type: Number,
            required: true,
            min: [0, 'Subtotal cannot be negative']
        },

        total: {
            type: Number,
            required: true,
            min: [0, 'Total cannot be negative']
        },

        status: {
            type: String,
            enum: ['pending', 'completed', 'cancelled'],
            default: 'pending',
            required: true
        },

        stockCommitted: {
            type: Boolean,
            default: false,
            required: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

orderSchema.index(
    { ownerId: 1, orderNumber: 1 },
    { unique: true }
);

orderSchema.index({ ownerId: 1, createdAt: -1 });
orderSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model('Order', orderSchema);
