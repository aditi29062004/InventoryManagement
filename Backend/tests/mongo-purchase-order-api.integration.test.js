require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');
const { randomUUID } = require('node:crypto');

const {
    User,
    Product,
    Supplier,
    PurchaseOrder,
    StockMovement
} = require('../models/mongo');

const mongoPurchaseOrderRoutes =
    require('../routes/mongoPurchaseOrderRoutes');

test('Mongo purchase-order API supports safe partial and final receipts', async () => {
    assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be configured');
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be configured');

    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/inventory_management_phase23_test';

    const ownerIds = [];
    const productIds = [];
    const supplierIds = [];
    const purchaseOrderIds = [];
    let connected = false;
    let server;

    try {
        await mongoose.connect(uri.toString(), {
            serverSelectionTimeoutMS: 10000
        });
        connected = true;

        const suffix = randomUUID();

        const owner = await User.create({
            name: 'Phase 2.3 PO Test Owner',
            email: `phase23-po-owner-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(owner._id);

        const otherOwner = await User.create({
            name: 'Phase 2.3 PO Other Owner',
            email: `phase23-po-other-${suffix}@example.com`,
            passwordHash: 'test-only-hash'
        });
        ownerIds.push(otherOwner._id);

        const supplier = await Supplier.create({
            ownerId: owner._id,
            name: 'Phase 2.3 PO Test Supplier',
            email: `phase23-po-supplier-${suffix}@example.com`,
            status: 'active',
            isActive: true
        });
        supplierIds.push(supplier._id);

        const product = await Product.create({
            ownerId: owner._id,
            name: 'Phase 2.3 PO Test Product',
            sku: `P23PO-${suffix.slice(0, 12)}`,
            price: 25,
            costPrice: 10,
            stockQuantity: 5,
            supplierId: supplier._id
        });
        productIds.push(product._id);

        const app = express();
        app.use(express.json());
        app.use('/api/v1/purchase-orders', mongoPurchaseOrderRoutes);

        server = await new Promise((resolve, reject) => {
            const listener = app.listen(0, '127.0.0.1', () => {
                resolve(listener);
            });
            listener.once('error', reject);
        });

        const address = server.address();
        const baseUrl =
            `http://127.0.0.1:${address.port}/api/v1/purchase-orders`;

        const ownerToken = jwt.sign(
            { sub: String(owner._id) },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '5m' }
        );

        const otherToken = jwt.sign(
            { sub: String(otherOwner._id) },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '5m' }
        );

        async function api(path = '', options = {}) {
            const response = await fetch(`${baseUrl}${path}`, {
                ...options,
                headers: {
                    ...(options.body
                        ? { 'Content-Type': 'application/json' }
                        : {}),
                    ...(options.headers || {})
                }
            });

            return {
                status: response.status,
                body: await response.json()
            };
        }

        const unauthenticated = await api();
        assert.equal(unauthenticated.status, 401);

        const created = await api('', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                supplierId: String(supplier._id),
                purchaseOrderNumber: `PO-P23-${suffix}`,
                items: [{
                    productId: String(product._id),
                    quantityOrdered: 5,
                    unitCost: 10
                }]
            })
        });

        assert.equal(created.status, 201);
        assert.equal(created.body.success, true);
        assert.equal(created.body.data.status, 'pending');
        assert.equal(created.body.data.subtotal, 50);

        const purchaseOrderId = created.body.data._id;
        assert.ok(purchaseOrderId);
        purchaseOrderIds.push(purchaseOrderId);

        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            5
        );

        const foreignReceive = await api(
            `/${purchaseOrderId}/receive`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${otherToken}`,
                    'Idempotency-Key': `po-foreign-${suffix}`
                },
                body: JSON.stringify({
                    items: [{
                        productId: String(product._id),
                        quantity: 1
                    }]
                })
            }
        );

        assert.equal(foreignReceive.status, 404);
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            5
        );

        const firstReceiptKey = `po-receipt-1-${suffix}`;
        const firstReceiptBody = {
            items: [{
                productId: String(product._id),
                quantity: 2
            }]
        };

        const partial = await api(`/${purchaseOrderId}/receive`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`,
                'Idempotency-Key': firstReceiptKey
            },
            body: JSON.stringify(firstReceiptBody)
        });

        assert.equal(partial.status, 200);
        assert.equal(partial.body.replayed, false);
        assert.equal(partial.body.data.status, 'partially_received');
        assert.equal(
            partial.body.data.items[0].quantityReceived,
            2
        );
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            7
        );

        const replay = await api(`/${purchaseOrderId}/receive`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`,
                'Idempotency-Key': firstReceiptKey
            },
            body: JSON.stringify(firstReceiptBody)
        });

        assert.equal(replay.status, 200);
        assert.equal(replay.body.replayed, true);
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            7
        );

        const mismatchedReplay = await api(
            `/${purchaseOrderId}/receive`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`,
                    'Idempotency-Key': firstReceiptKey
                },
                body: JSON.stringify({
                    items: [{
                        productId: String(product._id),
                        quantity: 1
                    }]
                })
            }
        );

        assert.equal(mismatchedReplay.status, 409);
        assert.equal(
            mismatchedReplay.body.error.code,
            'IDEMPOTENCY_KEY_REUSED'
        );
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            7
        );

        const overReceipt = await api(
            `/${purchaseOrderId}/receive`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`,
                    'Idempotency-Key': `po-over-${suffix}`
                },
                body: JSON.stringify({
                    items: [{
                        productId: String(product._id),
                        quantity: 4
                    }]
                })
            }
        );

        assert.equal(overReceipt.status, 409);
        assert.equal(overReceipt.body.error.code, 'OVER_RECEIVING');
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            7
        );

        const finalReceipt = await api(
            `/${purchaseOrderId}/receive`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`,
                    'Idempotency-Key': `po-final-${suffix}`
                },
                body: JSON.stringify({
                    items: [{
                        productId: String(product._id),
                        quantity: 3
                    }]
                })
            }
        );

        assert.equal(finalReceipt.status, 200);
        assert.equal(finalReceipt.body.replayed, false);
        assert.equal(finalReceipt.body.data.status, 'received');
        assert.equal(
            finalReceipt.body.data.items[0].quantityReceived,
            5
        );
        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            10
        );

        const movements = await StockMovement.find({
            ownerId: owner._id,
            referenceType: 'purchaseOrder',
            referenceId: purchaseOrderId
        }).sort({ quantityBefore: 1 });

        assert.equal(movements.length, 2);
        assert.deepEqual(
            movements.map(movement => movement.quantityChange).sort(
                (a, b) => a - b
            ),
            [2, 3]
        );

                // Concurrent receipts must not over-receive the same purchase order.
        const concurrentOrderResponse = await api('', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                supplierId: String(supplier._id),
                purchaseOrderNumber: `PO-P23-CONCURRENT-${suffix}`,
                items: [{
                    productId: String(product._id),
                    quantityOrdered: 5,
                    unitCost: 10
                }]
            })
        });

        assert.equal(concurrentOrderResponse.status, 201);

        const concurrentOrderId = concurrentOrderResponse.body.data._id;
        purchaseOrderIds.push(concurrentOrderId);

        const concurrentReceipts = await Promise.all([
            api(`/${concurrentOrderId}/receive`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`,
                    'Idempotency-Key': `po-concurrent-a-${suffix}`
                },
                body: JSON.stringify({
                    items: [{
                        productId: String(product._id),
                        quantity: 4
                    }]
                })
            }),
            api(`/${concurrentOrderId}/receive`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`,
                    'Idempotency-Key': `po-concurrent-b-${suffix}`
                },
                body: JSON.stringify({
                    items: [{
                        productId: String(product._id),
                        quantity: 4
                    }]
                })
            })
        ]);

        assert.equal(
            concurrentReceipts.filter(response => response.status === 200).length,
            1,
            'Exactly one concurrent receipt should succeed'
        );

        assert.equal(
            concurrentReceipts.filter(
                response =>
                    response.status === 409 &&
                    response.body.error.code === 'OVER_RECEIVING'
            ).length,
            1,
            'The other receipt should be rejected as over-receiving'
        );

        const concurrentOrder = await PurchaseOrder.findById(
            concurrentOrderId
        );

        assert.equal(concurrentOrder.items[0].quantityReceived, 4);
        assert.equal(concurrentOrder.status, 'partially_received');

        assert.equal(
            (await Product.findById(product._id)).stockQuantity,
            14,
            'Only four additional units should be added to the existing stock of ten'
        );

        const concurrentMovements = await StockMovement.find({
            ownerId: owner._id,
            referenceType: 'purchaseOrder',
            referenceId: concurrentOrderId
        });

        assert.equal(
            concurrentMovements.length,
            1,
            'Only one stock movement should be created for the successful receipt'
        );

        console.log(
            'Purchase-order API integration checks passed:',
            JSON.stringify({
                authenticationRequired: true,
                purchaseOrderCreated: true,
                foreignOwnerRejected: true,
                partialReceiptUpdatedStock: true,
                idempotentReplayDidNotDuplicateStock: true,
                mismatchedReplayRejected: true,
                overReceivingRejected: true,
                finalReceiptCompletedOrder: true,
                stockMovementCount: movements.length
            }, null, 2)
        );
    } finally {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }

        if (connected) {
            if (purchaseOrderIds.length) {
                await PurchaseOrder.deleteMany({
                    _id: { $in: purchaseOrderIds }
                }).catch(() => {});
            }

            if (ownerIds.length) {
                await StockMovement.deleteMany({
                    ownerId: { $in: ownerIds }
                }).catch(() => {});
            }

            if (productIds.length) {
                await Product.deleteMany({
                    _id: { $in: productIds }
                }).catch(() => {});
            }

            if (supplierIds.length) {
                await Supplier.deleteMany({
                    _id: { $in: supplierIds }
                }).catch(() => {});
            }

            if (ownerIds.length) {
                await User.deleteMany({
                    _id: { $in: ownerIds }
                }).catch(() => {});
            }
        }

        await mongoose.disconnect().catch(() => {});
    }
});
