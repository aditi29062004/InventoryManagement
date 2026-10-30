
const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
    {
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: false
        },

        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },

        type: {
            type: String,
            enum: [
                'sale',
                'sale_cancelled',
                'purchase_received',
                'adjustment',
                'return',
                'opening_balance'
            ],
            required: true
        },

        reason: {
            type: String,
            trim: true,
            maxlength: 250
        },

        quantityChange: {
            type: Number,
            required: true,
            validate: {
                validator: Number.isInteger,
                message: 'Quantity change must be an integer.'
            }
        },

        quantityBefore: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: Number.isInteger,
                message: 'Quantity before must be an integer.'
            }
        },

        quantityAfter: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: Number.isInteger,
                message: 'Quantity after must be an integer.'
            }
        },

        referenceType: {
            type: String,
            enum: ['order', 'purchaseOrder', 'adjustment', 'migration'],
            required: true
        },

        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        idempotencyKey: {
            type: String,
            required: true,
            trim: true,
            minlength: 1
        }
    },
    {
        timestamps: {
            createdAt: true,
            updatedAt: false
        },
        versionKey: false
    }
);

// A stock movement must represent a real change.
stockMovementSchema.path('quantityChange').validate({
    validator(value) {
        return Number.isInteger(value) && value !== 0;
    },
    message: 'Quantity change must be a non-zero integer.'
});

// Ensure the recorded stock arithmetic is consistent.
stockMovementSchema.pre('validate', function () {
    if (
        Number.isInteger(this.quantityBefore) &&
        Number.isInteger(this.quantityChange) &&
        Number.isInteger(this.quantityAfter) &&
        this.quantityAfter !== this.quantityBefore + this.quantityChange
    ) {
        this.invalidate(
            'quantityAfter',
            'Quantity after must equal quantity before plus quantity change.'
        );
    }
});

// Prevent duplicate operations for the same user.
stockMovementSchema.index(
    { ownerId: 1, idempotencyKey: 1 },
    { unique: true }
);

// Support a product's chronological stock history.
stockMovementSchema.index({
    ownerId: 1,
    productId: 1,
    createdAt: -1
});

// Support finding movements linked to an order or purchase order.
stockMovementSchema.index({
    ownerId: 1,
    referenceType: 1,
    referenceId: 1
});

module.exports = mongoose.model('StockMovement', stockMovementSchema);
