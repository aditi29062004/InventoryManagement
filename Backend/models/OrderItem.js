const { Model } = require('sequelize');

class OrderItem extends Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Orders',
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
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: 0
        }
      },
      total: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.quantity * this.price;
        }
      }
    }, {
      sequelize,
      modelName: 'OrderItem',
      tableName: 'order_items',
      timestamps: true,
      hooks: {
        beforeCreate: async (orderItem) => {
          const Product = sequelize.models.Product;
          const product = await Product.findByPk(orderItem.product_id);

          if (!product) {
            throw new Error('Product not found');
          }

          if (product.stock < orderItem.quantity) {
            throw new Error(`Insufficient stock. Available: ${product.stock}, Requested: ${orderItem.quantity}`);
          }
        },
        afterCreate: async (orderItem) => {
          const Product = sequelize.models.Product;
          await Product.decrement('stock', {
            by: orderItem.quantity,
            where: { id: orderItem.product_id }
          });
        },
        beforeDestroy: async (orderItem) => {
          orderItem._previousQuantity = orderItem.quantity;
          orderItem._previousProductId = orderItem.product_id;
        },
        afterDestroy: async (orderItem) => {
          const Product = sequelize.models.Product;
          await Product.increment('stock', {
            by: orderItem._previousQuantity,
            where: { id: orderItem._previousProductId }
          });
        }
      }
    });
  }

  static associate(models) {
    this.belongsTo(models.Order, {
      foreignKey: 'orderId',
      as: 'order'
    });

    this.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product'
    });
  }
}

module.exports = OrderItem;
