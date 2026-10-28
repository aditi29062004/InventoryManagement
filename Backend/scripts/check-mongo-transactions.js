require('dotenv').config();

const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');

async function main() {
    const originalUri = process.env.MONGODB_URI;

    if (!originalUri) {
        throw new Error('MONGODB_URI is missing');
    }

    const uri = new URL(originalUri);
    uri.pathname = '/inventory_management_phase23_test';

    const collectionName = `transaction_smoke_${randomUUID().replace(/-/g, '')}`;
    let collection;
    let session;

    try {
        await mongoose.connect(uri.toString(), {
            serverSelectionTimeoutMS: 10000
        });

        collection = mongoose.connection.db.collection(collectionName);
        await mongoose.connection.db.createCollection(collectionName);

        session = await mongoose.startSession();
        session.startTransaction();

        await collection.insertOne(
            { testRun: randomUUID(), purpose: 'transaction-smoke-test' },
            { session }
        );

        await session.abortTransaction();

        const persistedCount = await collection.countDocuments({});

        if (persistedCount !== 0) {
            throw new Error(
                `Transaction abort check failed: ${persistedCount} document(s) persisted`
            );
        }

        console.log(JSON.stringify({
            connected: true,
            database: mongoose.connection.name,
            transactionStarted: true,
            insertAborted: true,
            persistedDocumentsAfterAbort: persistedCount,
            success: true
        }, null, 2));
    } finally {
        if (session?.inTransaction()) {
            await session.abortTransaction().catch(() => {});
        }

        await session?.endSession().catch(() => {});

        if (collection && mongoose.connection.readyState === 1) {
            await mongoose.connection.db.dropCollection(collectionName).catch(() => {});
        }

        await mongoose.disconnect().catch(() => {});
    }
}

main().catch(error => {
    console.error('Transaction smoke test failed:', error.message);
    process.exitCode = 1;
});
