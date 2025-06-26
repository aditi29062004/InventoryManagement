const { Model } = require('sequelize');

class PurchaseOrder extends Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      supplier_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Suppliers',
          key: 'id'
        }
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false
      },
      total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        validate: {
          min: 0
        }
      },
      expected_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      received_date: {
        type: DataTypes.DATE,
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      po_number: {
        type: DataTypes.VIRTUAL,
        get() {
          return `PO-${String(this.id).padStart(4, '0')}`;
        }
      }
    }, {
      sequelize,
      modelName: 'PurchaseOrder',
      tableName: 'purchase_orders',
      timestamps: true,
      indexes: [
        { fields: ['supplier_id'] },
        { fields: ['status'] },
        { fields: ['created_at'] }
      ],
      hooks: {
        afterUpdate: async (purchaseOrder) => {
          if (purchaseOrder.changed('status') && purchaseOrder.status === 'completed') {
            const PurchaseOrderItem = sequelize.models.PurchaseOrderItem;
            const Product = sequelize.models.Product;

            const items = await PurchaseOrderItem.findAll({
              where: { purchase_order_id: purchaseOrder.id }
            });

            for (const item of items) {
              await Product.increment('stock', {
                by: item.quantity,
                where: { id: item.product_id }
              });
            }

            purchaseOrder.received_date = new Date();
            await purchaseOrder.save({ hooks: false });
          }
        }
      }
    });
  }

  static associate(models) {
    this.belongsTo(models.Supplier, {
      foreignKey: 'supplierId',
      as: 'supplier'
    });

    this.hasMany(models.PurchaseOrderItem, {
      foreignKey: 'purchaseOrderId',
      as: 'purchaseOrderItems'
    });
  }
}

module.exports = PurchaseOrder;
