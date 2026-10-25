
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const models = require('../models/mongo');

test('all six MongoDB models compile', () => {
    const expected = [
        'User',
        'Product',
        'Supplier',
        'Order',
        'PurchaseOrder',
        'StockMovement'
    ];

    for (const name of expected) {
        assert.ok(models[name], `${name} should be exported`);
        assert.ok(models[name].schema, `${name} should have a schema`);
    }
});

test('User email is normalized', async () => {
    const user = new models.User({
        name: 'Test User',
        email: 'TEST@EXAMPLE.COM',
        passwordHash: 'test-hash'
    });

    assert.equal(user.email, 'test@example.com');
});

test('Product SKU is normalized and scoped unique index exists', () => {
    const product = new models.Product({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Test Product',
        sku: ' test-001 '
    });

    assert.equal(product.sku, 'TEST-001');

    const hasIndex = models.Product.schema.indexes().some(
        ([keys, options]) =>
            keys.ownerId === 1 &&
            keys.sku === 1 &&
            options.unique === true
    );

    assert.equal(hasIndex, true);
});

test('Supplier email is normalized', () => {
    const supplier = new models.Supplier({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Example Supplier',
        email: 'CONTACT@EXAMPLE.COM'
    });

    assert.equal(supplier.email, 'contact@example.com');
});

test('Order has an owner-scoped order number index', () => {
    const hasIndex = models.Order.schema.indexes().some(
        ([keys, options]) =>
            keys.ownerId === 1 &&
            keys.orderNumber === 1 &&
            options.unique === true
    );

    assert.equal(hasIndex, true);
});

test('PurchaseOrder supports partial receipts', () => {
    const purchaseOrder = new models.PurchaseOrder({
        ownerId: new mongoose.Types.ObjectId(),
        purchaseOrderNumber: 'PO-TEST-001',
        supplierId: new mongoose.Types.ObjectId(),
        items: [{
            productId: new mongoose.Types.ObjectId(),
            productName: 'Test Product',
            quantityOrdered: 10,
            quantityReceived: 4,
            unitCost: 50,
            lineTotal: 500
        }],
        subtotal: 500,
        status: 'partially_received'
    });

    assert.equal(purchaseOrder.items[0].quantityReceived, 4);
    assert.equal(purchaseOrder.status, 'partially_received');
});

test('StockMovement validates stock arithmetic', async () => {
    const movement = new models.StockMovement({
        ownerId: new mongoose.Types.ObjectId(),
        productId: new mongoose.Types.ObjectId(),
        type: 'sale',
        quantityChange: -3,
        quantityBefore: 10,
        quantityAfter: 7,
        referenceType: 'order',
        referenceId: new mongoose.Types.ObjectId(),
        idempotencyKey: 'test-order-001'
    });

    await movement.validate();

    movement.quantityAfter = 8;

    await assert.rejects(
        movement.validate(),
        error => Boolean(error.errors.quantityAfter)
    );
});
