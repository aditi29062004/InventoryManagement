require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');

const {
    User,
    Product,
    Order,
    StockMovement
} = require('../models/mongo');

const {
    createMongoOrder,
    completeMongoOrder,
    cancelMongoOrder,
    OrderServiceError
} = require('../services/mongoOrderService');

test('Mongo order service creates orders safely and prevents duplicate stock deductions', async () => {
    assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be configured');

    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/inventory_management_phase23_test';

    const ownerIds = [];
    const productIds = [];
    let connected = false;

    try {
        await mongoose.connect(uri.toString(), {
            serverSelectionTimeoutMS: 10000
        });
        connected = true;

        const suffix = randomUUID();

        const owner = await User.create({
            name: 'Phase 2.3 Test Owner',
            email: `phase23-owner-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(owner._id);

        const otherOwner = await User.create({
            name: 'Phase 2.3 Other Owner',
            email: `phase23-other-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(otherOwner._id);

        const product = await Product.create({
            ownerId: owner._id,
            name: 'Phase 2.3 Test Product',
            sku: `P23-${suffix.slice(0, 12)}`,
            price: 25,
            costPrice: 10,
            stockQuantity: 10
        });
        productIds.push(product._id);

        const scarceProduct = await Product.create({
            ownerId: owner._id,
            name: 'Phase 2.3 Scarce Product',
            sku: `P23S-${suffix.slice(0, 10)}`,
            price: 12,
            costPrice: 5,
            stockQuantity: 1
        });
        productIds.push(scarceProduct._id);

        const foreignProduct = await Product.create({
            ownerId: otherOwner._id,
            name: 'Phase 2.3 Foreign Product',
            sku: `P23F-${suffix.slice(0, 10)}`,
            price: 50,
            costPrice: 20,
            stockQuantity: 5
        });
        productIds.push(foreignProduct._id);

        // A valid sale must deduct stock and record an audit movement.
        const first = await createMongoOrder({
            ownerId: owner._id,
            items: [{ productId: product._id, quantity: 3 }],
            idempotencyKey: `p23-sale-${suffix}`
        });

        assert.equal(first.replayed, false);
        assert.equal(first.order.items[0].unitPrice, 25);
        assert.equal(first.order.total, 75);
        assert.equal(first.order.stockCommitted, true);

        let updatedProduct = await Product.findById(product._id);
        assert.equal(updatedProduct.stockQuantity, 7);

        let movements = await StockMovement.find({
            ownerId: owner._id,
            referenceId: first.order._id
        });
        assert.equal(movements.length, 1);
        assert.equal(movements[0].type, 'sale');
        assert.equal(movements[0].quantityChange, -3);
        assert.equal(movements[0].quantityBefore, 10);
        assert.equal(movements[0].quantityAfter, 7);

        // Retrying the same request must return the original order.
        const retry = await createMongoOrder({
            ownerId: owner._id,
            items: [{ productId: product._id, quantity: 3 }],
            idempotencyKey: `p23-sale-${suffix}`
        });

        assert.equal(retry.replayed, true);
        assert.equal(String(retry.order._id), String(first.order._id));

        updatedProduct = await Product.findById(product._id);
        assert.equal(updatedProduct.stockQuantity, 7);

        // Completing an order must not deduct stock a second time.
        const completedOrder = await completeMongoOrder({
            ownerId: owner._id,
            orderId: first.order._id
        });

        assert.equal(completedOrder.status, 'completed');

        updatedProduct = await Product.findById(product._id);
        assert.equal(updatedProduct.stockQuantity, 7);

        // Repeated completion and cancellation of a completed order must fail.
        await assert.rejects(
            completeMongoOrder({
                ownerId: owner._id,
                orderId: first.order._id
            }),
            error =>
                error instanceof OrderServiceError &&
                error.code === 'INVALID_ORDER_TRANSITION'
        );

        await assert.rejects(
            cancelMongoOrder({
                ownerId: owner._id,
                orderId: first.order._id
            }),
            error =>
                error instanceof OrderServiceError &&
                error.code === 'INVALID_ORDER_TRANSITION'
        );

        // Another user must not be able to complete this order.
        await assert.rejects(
            completeMongoOrder({
                ownerId: otherOwner._id,
                orderId: first.order._id
            }),
            error =>
                error instanceof OrderServiceError &&
                error.code === 'ORDER_NOT_FOUND'
        );

        // Cancellation restores stock and creates a compensating movement.
        const cancellationOrder = await createMongoOrder({
            ownerId: owner._id,
            items: [{ productId: product._id, quantity: 2 }],
            idempotencyKey: `p23-cancel-${suffix}`
        });

        updatedProduct = await Product.findById(product._id);
        assert.equal(updatedProduct.stockQuantity, 5);

        const cancelledOrder = await cancelMongoOrder({
            ownerId: owner._id,
            orderId: cancellationOrder.order._id
        });

        assert.equal(cancelledOrder.status, 'cancelled');
        assert.equal(cancelledOrder.stockCommitted, false);

        updatedProduct = await Product.findById(product._id);
        assert.equal(updatedProduct.stockQuantity, 7);

        const cancellationMovement = await StockMovement.findOne({
            ownerId: owner._id,
            referenceId: cancellationOrder.order._id,
            type: 'sale_cancelled'
        });

        assert.ok(cancellationMovement);
        assert.equal(cancellationMovement.quantityChange, 2);
        assert.equal(cancellationMovement.quantityBefore, 5);
        assert.equal(cancellationMovement.quantityAfter, 7);

        // Repeated cancellation must not restore the stock again.
        await assert.rejects(
            cancelMongoOrder({
                ownerId: owner._id,
                orderId: cancellationOrder.order._id
            }),
            error =>
                error instanceof OrderServiceError &&
                error.code === 'INVALID_ORDER_TRANSITION'
        );

        updatedProduct = await Product.findById(product._id);
        assert.equal(updatedProduct.stockQuantity, 7);

                // Concurrent completion and cancellation must allow only one transition.
        const concurrentOrder = await createMongoOrder({
            ownerId: owner._id,
            items: [{ productId: product._id, quantity: 1 }],
            idempotencyKey: `p23-concurrent-transition-${suffix}`
        });

        const stockBeforeTransition = (
            await Product.findById(product._id)
        ).stockQuantity;

        const transitionResults = await Promise.allSettled([
            completeMongoOrder({
                ownerId: owner._id,
                orderId: concurrentOrder.order._id
            }),
            cancelMongoOrder({
                ownerId: owner._id,
                orderId: concurrentOrder.order._id
            })
        ]);

        const transition = await Order.findById(concurrentOrder.order._id);
        const stockAfterTransition = (
            await Product.findById(product._id)
        ).stockQuantity;

        assert.ok(
            ['completed', 'cancelled'].includes(transition.status),
            'The order must end in exactly one terminal state'
        );

        assert.equal(
            transitionResults.filter(result => result.status === 'fulfilled').length,
            1,
            'Exactly one transition should succeed'
        );

        assert.equal(
            transitionResults.filter(
                result =>
                    result.status === 'rejected' &&
                    result.reason.code === 'INVALID_ORDER_TRANSITION'
            ).length,
            1,
            'The losing transition should be rejected as invalid'
        );

        assert.equal(
            stockAfterTransition,
            transition.status === 'cancelled'
                ? stockBeforeTransition + 1
                : stockBeforeTransition,
            'Stock must be restored exactly once only if cancellation wins'
        );

        const concurrentCancellationMovements = await StockMovement.countDocuments({
            ownerId: owner._id,
            referenceId: concurrentOrder.order._id,
            type: 'sale_cancelled'
        });

        assert.equal(
            concurrentCancellationMovements,
            transition.status === 'cancelled' ? 1 : 0,
            'Cancellation must create exactly one compensating movement'
        );

        // Insufficient stock must fail without creating a partial order.
        await assert.rejects(
            createMongoOrder({
                ownerId: owner._id,
                items: [{ productId: scarceProduct._id, quantity: 2 }],
                idempotencyKey: `p23-insufficient-${suffix}`
            }),
            error =>
                error instanceof OrderServiceError &&
                error.code === 'INSUFFICIENT_STOCK'
        );

        const unchangedScarceProduct = await Product.findById(
            scarceProduct._id
        );
        assert.equal(unchangedScarceProduct.stockQuantity, 1);

        // A user must not be able to order another user's product.
        await assert.rejects(
            createMongoOrder({
                ownerId: owner._id,
                items: [{ productId: foreignProduct._id, quantity: 1 }],
                idempotencyKey: `p23-foreign-${suffix}`
            }),
            error =>
                error instanceof OrderServiceError &&
                error.code === 'PRODUCT_NOT_FOUND'
        );

        const unchangedForeignProduct = await Product.findById(
            foreignProduct._id
        );
        assert.equal(unchangedForeignProduct.stockQuantity, 5);

        const ownerOrders = await Order.countDocuments({
            ownerId: owner._id
        });
        assert.equal(ownerOrders, 3);

        const ownerMovements = await StockMovement.countDocuments({
            ownerId: owner._id
        });

        const expectedOwnerMovements =
            transition.status === 'cancelled' ? 5 : 4;

        assert.equal(ownerMovements, expectedOwnerMovements);

        console.log('Order integration checks passed:', JSON.stringify({
            createdOrder: true,
            stockDeductedOnce: true,
            retryReturnedOriginalOrder: true,
            insufficientStockRolledBack: true,
            crossUserProductRejected: true,
            orderCount: ownerOrders,
            stockMovementCount: ownerMovements
        }, null, 2));
    } finally {
        if (connected) {
            // Remove only records associated with the temporary test users/products.
            if (ownerIds.length) {
                await Order.deleteMany({
                    ownerId: { $in: ownerIds }
                }).catch(() => {});

                await StockMovement.deleteMany({
                    ownerId: { $in: ownerIds }
                }).catch(() => {});

                await User.deleteMany({
                    _id: { $in: ownerIds }
                }).catch(() => {});
            }

            if (productIds.length) {
                await Product.deleteMany({
                    _id: { $in: productIds }
                }).catch(() => {});
            }
        }

        await mongoose.disconnect().catch(() => {});
    }
});
