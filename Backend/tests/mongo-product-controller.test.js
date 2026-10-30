const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const proxyquire = require('proxyquire');

async function withServer(t, harness, callback) {
    await new Promise(resolve =>
        harness.server.listen(0, '127.0.0.1', resolve)
    );

    t.after(() => new Promise((resolve, reject) => {
        harness.server.close(error =>
            error ? reject(error) : resolve()
        );
    }));

    const address = harness.server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await callback(baseUrl, harness);
}

test('lists products scoped to the authenticated owner', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(`${baseUrl}/products`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.deepEqual(body.data, harness.expectedProducts);
        assert.equal(body.pagination.page, 1);
        assert.equal(body.pagination.limit, 20);
        assert.equal(body.pagination.total, 1);
        assert.equal(harness.calls.findFilter.status, 'active');

        assert.equal(
            String(harness.calls.findFilter.ownerId),
            'user-123'
        );
        assert.equal(
            String(harness.calls.countFilter.ownerId),
            'user-123'
        );
        assert.equal(harness.calls.skip, 0);
        assert.equal(harness.calls.limit, 20);
    });
});

test('allows explicitly requesting inactive products', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products?status=inactive`
        );

        assert.equal(response.status, 200);
        assert.equal(harness.calls.findFilter.status, 'inactive');
    });
});

test('fetches a product scoped to the authenticated owner', async t => {
    const harness = createHarness();
    const productId = '507f1f77bcf86cd799439011';

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/${productId}`
        );
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(String(body.data._id), productId);
        assert.equal(
            String(harness.calls.findOneFilter.ownerId),
            'user-123'
        );
        assert.equal(
            String(harness.calls.findOneFilter._id),
            productId
        );
    });
});

test('rejects an invalid product ID', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/not-a-valid-id`
        );
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_PRODUCT_ID');
        assert.equal(harness.calls.findOneFilter, null);
    });
});

test('returns 404 when the product is not owned by the authenticated user', async t => {
    const harness = createHarness();
    harness.calls.productExists = false;

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011`
        );
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(body.error.code, 'PRODUCT_NOT_FOUND');
        assert.equal(
            String(harness.calls.findOneFilter.ownerId),
            'user-123'
        );
    });
});

test('supports pagination parameters', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products?page=2&limit=5`
        );
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.pagination.page, 2);
        assert.equal(body.pagination.limit, 5);
        assert.equal(harness.calls.skip, 5);
        assert.equal(harness.calls.limit, 5);
    });
});

test('rejects malformed pagination parameters', async t => {
    const invalidQueries = [
        '?page=0',
        '?page=2abc',
        '?page=1.5',
        '?limit=101',
        '?limit=-1'
    ];

    for (const query of invalidQueries) {
        const harness = createHarness();

        await withServer(t, harness, async baseUrl => {
            const response = await fetch(
                `${baseUrl}/products${query}`
            );
            const body = await response.json();

            assert.equal(response.status, 400, query);
            assert.equal(body.error.code, 'INVALID_PAGINATION', query);
            assert.equal(harness.calls.findFilter, null, query);
        });
    }
});

test('rejects invalid product status filters', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products?status=unknown`
        );
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_STATUS');
        assert.equal(harness.calls.findFilter, null);
    });
});

test('rejects malformed supplier IDs in query filters', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products?supplierId=not-an-object-id`
        );
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_SUPPLIER_ID');
        assert.equal(harness.calls.findFilter, null);
    });
});

test('supports low-stock filtering', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products?lowStock=true`
        );

        assert.equal(response.status, 200);
        assert.deepEqual(
            harness.calls.findFilter.$expr,
            { $lte: ['$stockQuantity', '$reorderLevel'] }
        );
    });
});


function createHarness() {
    const calls = {
    findFilter: null,
    countFilter: null,
    skip: null,
    limit: null,
    createInput: null,
    supplierFilter: null,
    stockMovementInput: null,
    supplierExists: true,
    stockMovementFails: false,
    findOneFilter: null,
    productExists: true,
    findOneAndUpdateFilter: null,
    findOneAndUpdateInput: null,
    updatedProductExists: true,
    updateFailsWithDuplicate: false,
};

    const expectedProducts = [
        { _id: 'product-1', name: 'Keyboard', sku: 'KEY-01' }
    ];

    const createdProduct = {
        _id: 'product-new',
        name: 'Mouse',
        sku: 'MOUSE-01',
        stockQuantity: 0
    };

    const Product = {
        find(filter) {
            calls.findFilter = filter;

            const query = {
                sort() { return query; },
                skip(value) {
                    calls.skip = value;
                    return query;
                },
                limit(value) {
                    calls.limit = value;
                    return query;
                },
                lean: async () => expectedProducts
            };

            return query;
        },

        countDocuments: async filter => {
            calls.countFilter = filter;
            return 1;
        },

        async create(input) {
            calls.createInput = input;
            return { ...createdProduct, ...input };
        },

        async deleteOne(filter) {
            calls.rollbackFilter = filter;
            return { deletedCount: 1 };
        },


        findOne(filter) {
            calls.findOneFilter = filter;
            return {
            lean: async () => calls.productExists
            ? {
                ...createdProduct,
                _id: filter._id,
                ownerId: filter.ownerId
            }
            : null
        };
        },


async findOneAndUpdate(filter, update, options) {
    calls.findOneAndUpdateFilter = filter;
    calls.findOneAndUpdateInput = { update, options };

    if (calls.updateFailsWithDuplicate) {
        const error = new Error('Duplicate product identifier');
        error.code = 11000;
        throw error;
    }

    if (!calls.updatedProductExists) {
        return null;
    }

    return {
        ...createdProduct,
        ...update.$set,
        _id: filter._id,
        ownerId: filter.ownerId
    };
},
    };

    const Supplier = {
    findOne(filter) {
        calls.supplierFilter = filter;

        return {
            lean: async () => calls.supplierExists
                ? {
                    _id: filter._id,
                    ownerId: filter.ownerId
                }
                : null
        };
    }
};

    const StockMovement = {
    async create(input) {
        calls.stockMovementInput = input;

        if (calls.stockMovementFails) {
            throw new Error('Simulated stock movement failure');
        }

        return { ...input };
    }
};

    const Order = {};
    const PurchaseOrder = {};

 const MockStockAdjustmentServiceError =
    class StockAdjustmentServiceError extends Error {
        constructor(statusCode, code, message) {
            super(message);
            this.statusCode = statusCode;
            this.code = code;
        }
    };

const stockAdjustmentCalls = {
    input: null,
    result: {
        replayed: false,
        movement: {
            _id: 'movement-123',
            type: 'adjustment',
            quantityBefore: 5,
            quantityChange: 5,
            quantityAfter: 10,
            reason: 'Physical stock count'
        }
    },
    error: null,
    ServiceError: MockStockAdjustmentServiceError
};

const stockAdjustmentService = {
    async adjustMongoStock(input) {
        stockAdjustmentCalls.input = input;

        if (stockAdjustmentCalls.error) {
            throw stockAdjustmentCalls.error;
        }

        return stockAdjustmentCalls.result;
    },
    StockAdjustmentServiceError: MockStockAdjustmentServiceError
};

    const controller = proxyquire(
    '../controllers/mongoProductController',
    {
        '../models/mongo': {
            Product,
            Supplier,
            Order,
            PurchaseOrder,
            StockMovement
        },
        '../services/mongoStockAdjustmentService': stockAdjustmentService
    }
);

    const app = express();
    app.use(express.json());
    // Simulate an authenticated user.
    app.use((req, res, next) => {
        req.user = { _id: 'user-123' };
        next();
    });
    app.use(express.json());
    // Simulate an authenticated user.
    app.use((req, res, next) => {
        req.user = { _id: 'user-123' };
        next();
    });

    app.get('/products', controller.listProducts);
    if (controller.getProductById) {
        app.get('/products/:id', controller.getProductById);
    }
    if (controller.updateProduct) {
        app.patch('/products/:id', controller.updateProduct);
    }
    if (controller.adjustProductStock) {
        app.patch('/products/:id/stock', controller.adjustProductStock);
    }
    if (controller.deleteProduct) {
        app.delete('/products/:id', controller.deleteProduct);
    }
    if (controller.createProduct) {
        app.post('/products', controller.createProduct);
    }

    const server = http.createServer(app);

    return {
        app,
        server,
        calls,
        expectedProducts,
        createdProduct,
        stockAdjustmentCalls
    };
}


test('creates a product with the authenticated owner', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(`${baseUrl}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: '  Mouse  ',
                sku: '  mouse-01  ',
                price: 799,
                costPrice: 450,
                stockQuantity: 0
            })
        });

        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.success, true);
        assert.equal(harness.calls.createInput.ownerId, 'user-123');
        assert.equal(harness.calls.createInput.name, 'Mouse');
        assert.equal(harness.calls.createInput.sku, 'MOUSE-01');
        assert.equal(harness.calls.stockMovementInput, null);
    });
});

test('rejects product creation when required fields are missing', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(`${baseUrl}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Mouse' })
        });

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.equal(harness.calls.createInput, null);
    });
});

test('rejects negative prices without writing to MongoDB', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(`${baseUrl}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Mouse',
                sku: 'MOUSE-01',
                price: -1,
                costPrice: 450
            })
        });

        assert.equal(response.status, 400);
        assert.equal(harness.calls.createInput, null);
    });
});

test('rejects a supplier ID that does not belong to the authenticated owner', async t => {
    const harness = createHarness();

    // Simulate the supplier not being found within the user's ownership scope.
    harness.calls.supplierExists = false;

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(`${baseUrl}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Mouse',
                sku: 'MOUSE-01',
                price: 799,
                costPrice: 450,
                supplierId: '507f1f77bcf86cd799439011'
            })
        });

        assert.equal(response.status, 404);
        assert.equal(harness.calls.createInput, null);
    });
});


test('attempts to roll back product creation when opening stock movement fails', async (t) => {
    const harness = createHarness();
    harness.calls.stockMovementFails = true;

    await withServer(t, harness, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Keyboard',
                sku: 'KEYBOARD-01',
                price: 1000,
                costPrice: 700,
                stockQuantity: 5
            })
        });

        const body = await response.json();

        assert.equal(response.status, 500);
        assert.equal(body.success, false);
        assert.equal(harness.calls.createInput.ownerId, 'user-123');
        assert.deepEqual(harness.calls.rollbackFilter, {
            _id: harness.createdProduct._id,
            ownerId: 'user-123'
        });
    });
});


test('updates product details within the authenticated owner scope', async t => {
    const harness = createHarness();
    const productId = '507f1f77bcf86cd799439011';

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/${productId}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: '  Updated Keyboard  ',
                    price: 1200,
                    sku: ' keyboard-02 '
                })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.name, 'Updated Keyboard');
        assert.equal(body.data.price, 1200);
        assert.equal(body.data.sku, 'KEYBOARD-02');

        assert.equal(
            String(harness.calls.findOneAndUpdateFilter._id),
            productId
        );
        assert.equal(
            String(harness.calls.findOneAndUpdateFilter.ownerId),
            'user-123'
        );
        assert.deepEqual(
            harness.calls.findOneAndUpdateInput.options,
            { new: true, runValidators: true }
        );
    });
});

test('rejects direct stock quantity changes during product update', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stockQuantity: 50 })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'STOCK_UPDATE_NOT_ALLOWED');
        assert.equal(harness.calls.findOneAndUpdateFilter, null);
    });
});

test('returns 404 when updating a product outside the owner scope', async t => {
    const harness = createHarness();
    harness.calls.updatedProductExists = false;

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Updated Keyboard' })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(body.error.code, 'PRODUCT_NOT_FOUND');
        assert.equal(
            String(harness.calls.findOneAndUpdateFilter.ownerId),
            'user-123'
        );
    });
});

test('rejects invalid product IDs during update', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/not-an-object-id`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Updated Keyboard' })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_PRODUCT_ID');
        assert.equal(harness.calls.findOneAndUpdateFilter, null);
    });
});

test('returns conflict for duplicate product identifiers', async t => {
    const harness = createHarness();
    harness.calls.updateFailsWithDuplicate = true;

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku: 'EXISTING-SKU' })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(
            body.error.code,
            'DUPLICATE_PRODUCT_IDENTIFIER'
        );
    });
});


test('soft-deletes a product within the authenticated owner scope', async t => {
    const harness = createHarness();
    const productId = '507f1f77bcf86cd799439011';

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/${productId}`,
            { method: 'DELETE' }
        );

        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.status, 'inactive');
        assert.equal(body.data.isActive, false);

        assert.equal(
            String(harness.calls.findOneAndUpdateFilter._id),
            productId
        );
        assert.equal(
            String(harness.calls.findOneAndUpdateFilter.ownerId),
            'user-123'
        );
        assert.deepEqual(
            harness.calls.findOneAndUpdateInput.update.$set,
            {
                status: 'inactive',
                isActive: false
            }
        );
    });
});

test('rejects invalid product IDs during soft deletion', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/not-a-valid-id`,
            { method: 'DELETE' }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_PRODUCT_ID');
        assert.equal(harness.calls.findOneAndUpdateFilter, null);
    });
});

test('returns 404 when soft-deleting a product outside the owner scope', async t => {
    const harness = createHarness();
    harness.calls.updatedProductExists = false;

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011`,
            { method: 'DELETE' }
        );

        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(body.error.code, 'PRODUCT_NOT_FOUND');
        assert.equal(
            String(harness.calls.findOneAndUpdateFilter.ownerId),
            'user-123'
        );
    });
});


test('adjusts product stock using the authenticated owner and idempotency key', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011/stock`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'adjust-stock-001'
                },
                body: JSON.stringify({
                    stockQuantity: 10,
                    reason: 'Physical stock count'
                })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.replayed, false);
        assert.equal(body.data.type, 'adjustment');
        assert.equal(
            harness.stockAdjustmentCalls.input.ownerId,
            'user-123'
        );
        assert.equal(
            harness.stockAdjustmentCalls.input.productId,
            '507f1f77bcf86cd799439011'
        );
        assert.equal(
            harness.stockAdjustmentCalls.input.idempotencyKey,
            'adjust-stock-001'
        );
        assert.equal(
            harness.stockAdjustmentCalls.input.stockQuantity,
            10
        );
        assert.equal(
            harness.stockAdjustmentCalls.input.reason,
            'Physical stock count'
        );
    });
});

test('returns 400 for an invalid product ID during stock adjustment', async t => {
    const harness = createHarness();

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/not-a-valid-id/stock`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'adjust-stock-002'
                },
                body: JSON.stringify({
                    stockQuantity: 10,
                    reason: 'Physical stock count'
                })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_PRODUCT_ID');
        assert.equal(harness.stockAdjustmentCalls.input, null);
    });
});

test('maps stock adjustment service errors to HTTP responses', async t => {
    const harness = createHarness();

    harness.stockAdjustmentCalls.error =
    new harness.stockAdjustmentCalls.ServiceError(
        409,
        'NO_STOCK_CHANGE',
        'The requested stock quantity is already set'
    );

    await withServer(t, harness, async baseUrl => {
        const response = await fetch(
            `${baseUrl}/products/507f1f77bcf86cd799439011/stock`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'adjust-stock-003'
                },
                body: JSON.stringify({
                    stockQuantity: 10,
                    reason: 'Physical stock count'
                })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.error.code, 'NO_STOCK_CHANGE');
    });
});