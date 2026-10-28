
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


test('Supplier email is normalized and optional', () => {
    const ownerId = new mongoose.Types.ObjectId();

    const supplier = new models.Supplier({
        ownerId,
        name: 'Example Supplier',
        email: 'CONTACT@EXAMPLE.COM'
    });

    const supplierWithoutEmail = new models.Supplier({
        ownerId,
        name: 'Supplier Without Email'
    });

    const supplierWithBlankEmail = new models.Supplier({
        ownerId,
        name: 'Supplier With Blank Email',
        email: '   '
    });

    assert.equal(supplier.email, 'contact@example.com');
    assert.equal(supplierWithoutEmail.email, null);
    assert.equal(supplierWithBlankEmail.email, null);
});

test('Supplier email has a unique owner-scoped partial index', () => {
    const hasIndex = models.Supplier.schema.indexes().some(
        ([keys, options]) =>
            keys.ownerId === 1 &&
            keys.email === 1 &&
            options.unique === true &&
            options.partialFilterExpression?.email?.$type === 'string'
    );
    assert.equal(hasIndex, true);
});

test('Supplier tax ID has a unique owner-scoped partial index', () => {
    const hasIndex = models.Supplier.schema.indexes().some(
        ([keys, options]) =>
            keys.ownerId === 1 &&
            keys.taxId === 1 &&
            options.unique === true &&
            options.partialFilterExpression?.taxId?.$type === 'string'
    );

    assert.equal(hasIndex, true);
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


test('Order has a unique owner-scoped idempotency index', () => {
    const hasIndex = models.Order.schema.indexes().some(
        ([keys, options]) =>
            keys.ownerId === 1 &&
            keys.idempotencyKey === 1 &&
            options.unique === true &&
            options.partialFilterExpression?.idempotencyKey?.$type === 'string'
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

test('Product status defaults to active and accepts valid statuses', () => {
    const ownerId = new mongoose.Types.ObjectId();

    const product = new models.Product({
        ownerId,
        name: 'Test Product',
        sku: 'STATUS-001'
    });

    assert.equal(product.status, 'active');

    for (const status of ['active', 'inactive', 'discontinued']) {
        product.status = status;
        assert.equal(product.status, status);
    }
});

test('Product rejects an invalid status', async () => {
    const product = new models.Product({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Test Product',
        sku: 'STATUS-002',
        status: 'archived'
    });

    await assert.rejects(
        product.validate(),
        error => Boolean(error.errors.status)
    );
});

test('Product barcode is trimmed and optional', () => {
    const ownerId = new mongoose.Types.ObjectId();

    const productWithBarcode = new models.Product({
        ownerId,
        name: 'Product With Barcode',
        sku: 'BARCODE-001',
        barcode: '  123456789  '
    });

    const productWithoutBarcode = new models.Product({
        ownerId,
        name: 'Product Without Barcode',
        sku: 'BARCODE-002'
    });

    assert.equal(productWithBarcode.barcode, '123456789');
    assert.equal(productWithoutBarcode.barcode, null);
});

test('Product barcode has a unique owner-scoped partial index', () => {
    const hasIndex = models.Product.schema.indexes().some(
        ([keys, options]) =>
            keys.ownerId === 1 &&
            keys.barcode === 1 &&
            options.unique === true &&
            options.partialFilterExpression?.barcode?.$type === 'string'
    );

    assert.equal(hasIndex, true);
});
test('Product converts blank barcodes to null', () => {
    const ownerId = new mongoose.Types.ObjectId();

    for (const barcode of ['', '   ']) {
        const product = new models.Product({
            ownerId,
            name: 'Test Product',
            sku: `BLANK-${barcode.length}`,
            barcode
        });

        assert.equal(product.barcode, null);
    }
});

test('Supplier profile fields are normalized and optional', () => {
    const supplier = new models.Supplier({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Example Supplier',
        taxId: '  gstin123  ',
        contactPerson: '  Priya Sharma  ',
        website: '  https://example.com  '
    });

    assert.equal(supplier.taxId, 'GSTIN123');
    assert.equal(supplier.contactPerson, 'Priya Sharma');
    assert.equal(supplier.website, 'https://example.com');

    const minimalSupplier = new models.Supplier({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Minimal Supplier'
    });

    assert.equal(minimalSupplier.taxId, null);
    assert.equal(minimalSupplier.rating, null);
    assert.equal(minimalSupplier.paymentTerms, '');
});

test('Supplier rating must be between 0 and 5', async () => {
    const supplier = new models.Supplier({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Example Supplier',
        rating: 6
    });

    await assert.rejects(
        supplier.validate(),
        error => Boolean(error.errors.rating)
    );
});

test('Supplier status defaults to active and rejects invalid values', async () => {
    const supplier = new models.Supplier({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'Example Supplier'
    });

    assert.equal(supplier.status, 'active');

    for (const status of ['active', 'inactive', 'blocked']) {
        supplier.status = status;
        assert.equal(supplier.status, status);
    }

    supplier.status = 'deleted';

    await assert.rejects(
        supplier.validate(),
        error => Boolean(error.errors.status)
    );
});
