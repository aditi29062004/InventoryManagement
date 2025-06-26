const { Model } = require('sequelize');

class PurchaseOrderItem extends Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      purchase_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'PurchaseOrders',
          key: 'id'
        }
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Products',
          key: 'id'
        }
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      unit_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: 0
        }
      },
      total_cost: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.quantity * this.unit_cost;
        }
      },
      received_quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: 0,
          // max can't dynamically access this.quantity here, so enforce in hooks/logic
        }
      },
      received_date: {
        type: DataTypes.DATE,
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'PurchaseOrderItem',
      tableName: 'purchase_order_items',
      timestamps: true,
      hooks: {
        beforeCreate: async (item) => {
          const Product = sequelize.models.Product;
          const product = await Product.findByPk(item.product_id);
          if (!product) throw new Error('Product not found');
        },
        afterCreate: async (item) => {
          await updatePurchaseOrderTotal(item.purchase_order_id, sequelize);
        },
        afterUpdate: async (item) => {
          await updatePurchaseOrderTotal(item.purchase_order_id, sequelize);
        },
        afterDestroy: async (item) => {
          await updatePurchaseOrderTotal(item.purchase_order_id, sequelize);
        }
      }
    });
  }

  static associate(models) {
    this.belongsTo(models.PurchaseOrder, {
      foreignKey: 'purchaseOrderId',
      as: 'purchaseOrder'
    });

    this.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product'
    });
  }
}

module.exports = PurchaseOrderItem;

// ──────────────────────────────────────────────
// ✅ Helper to update Purchase Order total
async function updatePurchaseOrderTotal(purchaseOrderId, sequelize) {
  const PurchaseOrder = sequelize.models.PurchaseOrder;
  const PurchaseOrderItem = sequelize.models.PurchaseOrderItem;

  const items = await PurchaseOrderItem.findAll({
    where: { purchase_order_id: purchaseOrderId }
  });

  const total = items.reduce((sum, item) => {
    return sum + parseFloat(item.quantity) * parseFloat(item.unit_cost);
  }, 0);

  await PurchaseOrder.update(
    { total },
    { where: { id: purchaseOrderId }, hooks: false }
  );
}
