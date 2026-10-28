require('dotenv').config();

const mongoose = require('mongoose');
const models = require('../models/mongo');

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/inventory_management_phase23_test';

    try {
        await mongoose.connect(uri.toString(), {
            serverSelectionTimeoutMS: 10000
        });

        for (const [name, Model] of Object.entries(models)) {
            await Model.createIndexes();
            console.log(`Indexes created/verified: ${name}`);
        }

        const orderIndexes = await mongoose.connection.db
            .collection('orders')
            .listIndexes()
            .toArray();

        console.log('\nOrder indexes:');
        console.log(JSON.stringify(orderIndexes, null, 2));
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
}

main().catch(error => {
    console.error('Test database index initialization failed:', error.message);
    process.exitCode = 1;
});
