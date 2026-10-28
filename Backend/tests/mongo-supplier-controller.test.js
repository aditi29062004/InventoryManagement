
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyquire = require('proxyquire');

test('creating a supplier without a name returns 400 without writing to MongoDB', async () => {
    let createCalled = false;

    const Supplier = {
        create: async () => {
            createCalled = true;
            throw new Error('Supplier.create should not be called');
        }
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product: {},
            PurchaseOrder: {}
        }
    });

    const app = express();
    app.use(express.json());

    // Stub authentication for this controller-level test.
    app.post('/suppliers', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.createSupplier);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/suppliers`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'supplier@example.com' })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'VALIDATION_ERROR');
        assert.equal(createCalled, false);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});


test('getting another user’s supplier returns 404', async () => {
    const supplierId = '507f1f77bcf86cd799439012';
    let queriedFilter;

    const Supplier = {
        findOne: (filter) => {
            queriedFilter = filter;
            return {
                lean: async () => null
            };
        }
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product: {},
            PurchaseOrder: {}
        }
    });

    const app = express();
    app.use(express.json());

    app.get('/suppliers/:id', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.getSupplierById);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/suppliers/${supplierId}`
        );

        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(body.error.code, 'SUPPLIER_NOT_FOUND');
        assert.equal(
            String(queriedFilter.ownerId),
            '507f1f77bcf86cd799439011'
        );
        assert.equal(String(queriedFilter._id), supplierId);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});


test('duplicate supplier identifiers return 409 Conflict', async () => {
    const duplicateError = Object.assign(
        new Error('Duplicate key'),
        { code: 11000 }
    );

    const Supplier = {
        create: async () => {
            throw duplicateError;
        }
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product: {},
            PurchaseOrder: {}
        }
    });

    const app = express();
    app.use(express.json());

    app.post('/suppliers', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.createSupplier);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/suppliers`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Example Supplier',
                    email: 'existing@example.com'
                })
            }
        );

        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.error.code, 'DUPLICATE_SUPPLIER_IDENTIFIER');
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});


test('supplier deletion is blocked when products reference it', async () => {
    const supplierId = '507f1f77bcf86cd799439012';
    let deleteCalled = false;

    const Supplier = {
        findOne: () => ({
            lean: async () => ({
                _id: supplierId,
                ownerId: '507f1f77bcf86cd799439011',
                name: 'Referenced Supplier'
            })
        }),
        deleteOne: async () => {
            deleteCalled = true;
        }
    };

    const Product = {
        countDocuments: async () => 1
    };

    const PurchaseOrder = {
        countDocuments: async () => 0
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product,
            PurchaseOrder
        }
    });

    const app = express();
    app.use(express.json());

    app.delete('/suppliers/:id', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.deleteSupplier);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/suppliers/${supplierId}`,
            { method: 'DELETE' }
        );

        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.error.code, 'SUPPLIER_IN_USE');
        assert.equal(body.error.details.productCount, 1);
        assert.equal(body.error.details.purchaseOrderCount, 0);
        assert.equal(deleteCalled, false);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});

test('supplier deletion is blocked when purchase orders reference it', async () => {
    const supplierId = '507f1f77bcf86cd799439012';
    let deleteCalled = false;

    const Supplier = {
        findOne: () => ({
            lean: async () => ({
                _id: supplierId,
                ownerId: '507f1f77bcf86cd799439011',
                name: 'Referenced Supplier'
            })
        }),
        deleteOne: async () => {
            deleteCalled = true;
        }
    };

    const Product = {
        countDocuments: async () => 0
    };

    const PurchaseOrder = {
        countDocuments: async () => 2
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product,
            PurchaseOrder
        }
    });

    const app = express();
    app.use(express.json());

    app.delete('/suppliers/:id', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.deleteSupplier);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/suppliers/${supplierId}`,
            { method: 'DELETE' }
        );

        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.error.code, 'SUPPLIER_IN_USE');
        assert.equal(body.error.details.productCount, 0);
        assert.equal(body.error.details.purchaseOrderCount, 2);
        assert.equal(deleteCalled, false);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});


test('malformed pagination returns 400', async () => {
    const Supplier = {
        find: () => {
            throw new Error('Supplier.find should not be called');
        },
        countDocuments: async () => {
            throw new Error('countDocuments should not be called');
        }
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product: {},
            PurchaseOrder: {}
        }
    });

    const app = express();
    app.get('/suppliers', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.listSuppliers);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/suppliers?page=2abc`
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'INVALID_PAGINATION');
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});


test('invalid optional-field types return 400 without writing to MongoDB', async () => {
    let createCalled = false;

    const Supplier = {
        create: async () => {
            createCalled = true;
            throw new Error('Supplier.create should not be called');
        }
    };

    const controller = proxyquire('../controllers/mongoSupplierController', {
        '../models/mongo': {
            Supplier,
            Product: {},
            PurchaseOrder: {}
        }
    });

    const app = express();
    app.use(express.json());

    app.post('/suppliers', (req, res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
    }, controller.createSupplier);

    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        for (const payload of [
            { name: 'Example Supplier', phone: 12345 },
            { name: 'Example Supplier', email: { address: 'supplier@example.com' } }
        ]) {
            const response = await fetch(
                `http://127.0.0.1:${server.address().port}/suppliers`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );

            const body = await response.json();

            assert.equal(response.status, 400);
            assert.equal(body.success, false);
        }

        assert.equal(createCalled, false);
    } finally {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    }
});
