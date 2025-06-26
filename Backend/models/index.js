const { sequelize } = require('../config/database');
const Sequelize = require('sequelize');

// Import class-based model definitions (not invoked yet)
const Product = require('./Product');
const Supplier = require('./Supplier');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const PurchaseOrder = require('./PurchaseOrder');
const PurchaseOrderItem = require('./PurchaseOrderItem');

// Initialize models
Product.init(sequelize, Sequelize.DataTypes);
Supplier.init(sequelize, Sequelize.DataTypes);
Order.init(sequelize, Sequelize.DataTypes);
OrderItem.init(sequelize, Sequelize.DataTypes);
PurchaseOrder.init(sequelize, Sequelize.DataTypes);
PurchaseOrderItem.init(sequelize, Sequelize.DataTypes);

// Collect models in a DB object for easy reference
const db = {
  sequelize,
  Sequelize,
  Product,
  Supplier,
  Order,
  OrderItem,
  PurchaseOrder,
  PurchaseOrderItem
};

// Setup associations after all models are initialized
Product.associate?.(db);
Supplier.associate?.(db);
Order.associate?.(db);
OrderItem.associate?.(db);
PurchaseOrder.associate?.(db);
PurchaseOrderItem.associate?.(db);

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    process.exit(1);
  }
};

// Sync database
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log(`✅ Database synchronized successfully${force ? ' (forced)' : ''}.`);
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
  }
};

// Initialize database
const initializeDatabase = async () => {
  await testConnection();
  await syncDatabase(false); // force = true for reset
};

// Export all
module.exports = {
  ...db,
  initializeDatabase,
  syncDatabase,
  testConnection
};
