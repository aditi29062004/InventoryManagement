const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema(
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

        quantityOrdered: {
            type: Number,
            required: true,
            min: [1, 'Ordered quantity must be at least 1'],
            validate: {
                validator: Number.isInteger,
                message: 'Ordered quantity must be an integer'
            }
        },

        quantityReceived: {
            type: Number,
            default: 0,
            min: [0, 'Received quantity cannot be negative'],
            validate: {
                validator: Number.isInteger,
                message: 'Received quantity must be an integer'
            }
        },

        unitCost: {
            type: Number,
            required: true,
            min: [0, 'Unit cost cannot be negative']
        },

        lineTotal: {
            type: Number,
            required: true,
            min: [0, 'Line total cannot be negative']
        }
    },
    { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        purchaseOrderNumber: {
            type: String,
            required: true,
            trim: true
        },

        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Supplier',
            required: true
        },

        items: {
            type: [purchaseOrderItemSchema],
            required: true,
            validate: {
                validator: items => items.length > 0,
                message: 'A purchase order must contain at least one item'
            }
        },

        subtotal: {
            type: Number,
            required: true,
            min: [0, 'Subtotal cannot be negative']
        },

        status: {
            type: String,
            enum: [
                'pending',
                'ordered',
                'partially_received',
                'received',
                'cancelled'
            ],
            default: 'pending',
            required: true
        },

        receipts: {
            type: [{
                idempotencyKey: {
                    type: String,
                    required: true,
                    trim: true,
                    minlength: 1,
                    maxlength: 128
                },
                items: {
                    type: [{
                        productId: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: 'Product',
                            required: true
                        },
                        quantity: {
                            type: Number,
                            required: true,
                            min: 1,
                            validate: Number.isInteger
                        }
                    }],
                    required: true
                },
                receivedAt: {
                    type: Date,
                    required: true
                }
            }],
            default: []
        }
    },
    {
        timestamps: true,
        versionKey: '__v',
        optimisticConcurrency: true
    }
);

purchaseOrderSchema.index(
    { ownerId: 1, purchaseOrderNumber: 1 },
    { unique: true }
);

purchaseOrderSchema.index({ ownerId: 1, supplierId: 1 });
purchaseOrderSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model(
    'PurchaseOrder',
    purchaseOrderSchema
);