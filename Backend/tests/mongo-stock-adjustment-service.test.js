
const test = require('node:test');
const assert = require('node:assert/strict');
const realMongoose = require('mongoose');
const proxyquire = require('proxyquire');

const ownerId = new realMongoose.Types.ObjectId().toString();
const productId = new realMongoose.Types.ObjectId().toString();

function createHarness(options = {}) {
    const calls = {
        movementFilter: null,
        productFilter: null,
        updateFilter: null,
        updateValue: null,
        movementInput: null,
        movementCreated: false,
        stock: options.initialStock ?? 5,
        sessionEnded: false,
        transactionStarted: false
    };

    const existingMovement = options.existingMovement ?? null;

    const session = {
        async withTransaction(callback) {
            calls.transactionStarted = true;
            return callback();
        },
        async endSession() {
            calls.sessionEnded = true;
        }
    };

    const mongoose = {
        ...realMongoose,
        startSession: async () => session
    };

    function query(value) {
        return {
            session: async () => value,
            then(resolve, reject) {
                return Promise.resolve(value).then(resolve, reject);
            }
        };
    }

    const Product = {
        findOne(filter) {
            calls.productFilter = filter;

            const product = options.productMissing
                ? null
                : {
                    _id: productId,
                    ownerId,
                    stockQuantity: calls.stock
                };

            return query(product);
        },

        async findOneAndUpdate(filter, update) {
            calls.updateFilter = filter;
            calls.updateValue = update;

            if (options.concurrentStockChange) {
                return null;
            }

            calls.stock = update.$set.stockQuantity;

            return {
                _id: productId,
                ownerId,
                stockQuantity: calls.stock
            };
        }
    };

    const StockMovement = {
        findOne(filter) {
            calls.movementFilter = filter;

            // The same result is returned for both the pre-check
            // and the in-transaction idempotency check.
            return query(existingMovement);
        },

        async create(documents) {
            if (options.movementFails) {
                throw new Error('Simulated stock movement failure');
            }

            calls.movementCreated = true;
            calls.movementInput = documents[0];

            return [{
                ...documents[0],
                _id: new realMongoose.Types.ObjectId()
            }];
        }
    };

    const service = proxyquire(
        '../services/mongoStockAdjustmentService',
        {
            mongoose,
            '../models/mongo': {
                Product,
                StockMovement
            }
        }
    );

    return { service, calls };
}

const validInput = {
    ownerId,
    productId,
    stockQuantity: 10,
    reason: 'Physical stock count',
    idempotencyKey: 'stock-adjustment-test-1'
};

async function expectServiceError(input, expectedCode, harness = createHarness()) {
    await assert.rejects(
        harness.service.adjustMongoStock(input),
        error =>
            error instanceof harness.service.StockAdjustmentServiceError &&
            error.code === expectedCode
    );

    return harness;
}

test('rejects an invalid authenticated owner ID', async () => {
    await expectServiceError(
        { ...validInput, ownerId: 'invalid-owner' },
        'INVALID_OWNER'
    );
});

test('rejects an invalid product ID', async () => {
    await expectServiceError(
        { ...validInput, productId: 'invalid-product' },
        'INVALID_PRODUCT_ID'
    );
});

test('rejects invalid stock quantities', async () => {
    for (const stockQuantity of [
        -1, 1.5, '10', NaN, Infinity,
        Number.MAX_SAFE_INTEGER + 1
    ]) {
        await expectServiceError(
            { ...validInput, stockQuantity },
            'INVALID_STOCK_QUANTITY'
        );
    }
});

test('rejects a missing idempotency key', async () => {
    const { idempotencyKey, ...input } = validInput;
    await expectServiceError(input, 'INVALID_IDEMPOTENCY_KEY');
});

test('rejects an empty idempotency key', async () => {
    await expectServiceError(
        { ...validInput, idempotencyKey: '   ' },
        'INVALID_IDEMPOTENCY_KEY'
    );
});

test('rejects an idempotency key longer than 128 characters', async () => {
    await expectServiceError(
        { ...validInput, idempotencyKey: 'k'.repeat(129) },
        'INVALID_IDEMPOTENCY_KEY'
    );
});

test('rejects a missing or blank reason', async () => {
    for (const reason of [undefined, '', '   ']) {
        await expectServiceError(
            { ...validInput, reason },
            'INVALID_REASON'
        );
    }
});

test('rejects a reason longer than 250 characters', async () => {
    await expectServiceError(
        { ...validInput, reason: 'r'.repeat(251) },
        'INVALID_REASON'
    );
});

test('records a successful adjustment and its audit movement', async () => {
    const harness = createHarness({ initialStock: 5 });

    const result = await harness.service.adjustMongoStock(validInput);

    assert.equal(result.replayed, false);
    assert.equal(harness.calls.stock, 10);
    assert.equal(harness.calls.movementCreated, true);
    assert.equal(harness.calls.movementInput.type, 'adjustment');
    assert.equal(harness.calls.movementInput.quantityBefore, 5);
    assert.equal(harness.calls.movementInput.quantityChange, 5);
    assert.equal(harness.calls.movementInput.quantityAfter, 10);
    assert.equal(harness.calls.movementInput.reason, validInput.reason);
    assert.equal(
        String(harness.calls.productFilter.ownerId),
        ownerId
    );
    assert.equal(harness.calls.transactionStarted, true);
    assert.equal(harness.calls.sessionEnded, true);
});

test('accepts zero as a target stock quantity', async () => {
    const harness = createHarness({ initialStock: 5 });

    const result = await harness.service.adjustMongoStock({
        ...validInput,
        stockQuantity: 0
    });

    assert.equal(result.replayed, false);
    assert.equal(harness.calls.stock, 0);
    assert.equal(harness.calls.movementInput.quantityChange, -5);
    assert.equal(harness.calls.movementInput.quantityAfter, 0);
});

test('returns the existing movement for an identical retry', async () => {
    const existingMovement = {
        productId: new realMongoose.Types.ObjectId(productId),
        quantityAfter: 10,
        reason: validInput.reason
    };

    const harness = createHarness({ existingMovement });

    const result = await harness.service.adjustMongoStock(validInput);

    assert.equal(result.replayed, true);
    assert.equal(result.movement, existingMovement);
    assert.equal(harness.calls.transactionStarted, false);
    assert.equal(harness.calls.movementCreated, false);
});

test('rejects reuse of an idempotency key for a different adjustment', async () => {
    const existingMovement = {
        productId: new realMongoose.Types.ObjectId(productId),
        quantityAfter: 10,
        reason: validInput.reason
    };

    const harness = createHarness({ existingMovement });

    await expectServiceError(
        { ...validInput, stockQuantity: 12 },
        'IDEMPOTENCY_KEY_REUSED',
        harness
    );
});

test('returns not found when the product is not owned by the user', async () => {
    const harness = createHarness({ productMissing: true });

    await expectServiceError(
        validInput,
        'PRODUCT_NOT_FOUND',
        harness
    );

    assert.equal(harness.calls.movementCreated, false);
    assert.equal(harness.calls.sessionEnded, true);
});

test('rejects an adjustment when stock is already at the target', async () => {
    const harness = createHarness({ initialStock: 10 });

    await expectServiceError(
        validInput,
        'NO_STOCK_CHANGE',
        harness
    );

    assert.equal(harness.calls.movementCreated, false);
    assert.equal(harness.calls.sessionEnded, true);
});

test('ends the transaction session when audit creation fails', async () => {
    const harness = createHarness({ movementFails: true });

    await assert.rejects(
        harness.service.adjustMongoStock(validInput),
        /Simulated stock movement failure/
    );

    assert.equal(harness.calls.sessionEnded, true);
});
