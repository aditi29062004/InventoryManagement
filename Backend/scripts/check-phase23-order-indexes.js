require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/inventory_management_phase23_test';

    try {
        await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 10000 });

        const indexes = await mongoose.connection.db
            .collection('orders')
            .listIndexes()
            .toArray();

        console.log(JSON.stringify(
            indexes.map(index => ({
                name: index.name,
                key: index.key,
                unique: index.unique || false,
                partialFilterExpression: index.partialFilterExpression || null
            })),
            null,
            2
        ));
    } finally {
        await mongoose.disconnect().catch(() => {});
    }
}

main().catch(error => {
    console.error('Index check failed:', error.message);
    process.exitCode = 1;
});
