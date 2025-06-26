const { Model } = require('sequelize');

class Product extends Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: 'Product name is required' },
          len: [1, 255]
        }
      },
      sku: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: 'SKU is required' }
        }
      },
      barcode: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      category: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Other']]
        }
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: { args: [0], msg: 'Price must be greater than or equal to 0' },
          isDecimal: { msg: 'Price must be a valid decimal number' }
        }
      },
      cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: { args: [0], msg: 'Cost must be greater than or equal to 0' },
          isDecimal: { msg: 'Cost must be a valid decimal number' }
        }
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: 'Stock cannot be negative' },
          isInt: { msg: 'Stock must be an integer' }
        }
      },
      min_stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: 'Minimum stock cannot be negative' },
          isInt: { msg: 'Minimum stock must be an integer' }
        }
      },
      supplier_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Supplier',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'discontinued'),
        defaultValue: 'active'
      }
    }, {
      sequelize,
      modelName: 'Product',
      tableName: 'products',
      indexes: [
        { unique: true, fields: ['sku'] },
        {
          unique: true,
          fields: ['barcode'],
          where: {
            barcode: {
              [sequelize.Sequelize.Op.ne]: null
            }
          }
        },
        { fields: ['category'] },
        { fields: ['supplier_id'] }
      ],
      hooks: {
        beforeValidate: (product) => {
          if (product.name) product.name = product.name.trim();
          if (product.sku) product.sku = product.sku.trim().toUpperCase();
          if (product.barcode) product.barcode = product.barcode.trim();
          if (product.category) product.category = product.category.trim();
          if (product.description) product.description = product.description.trim();
        }
      }
    });
  }

  static associate(models) {
    this.belongsTo(models.Supplier, {
      foreignKey: 'supplierId',
      as: 'supplier'
    });

    this.hasMany(models.OrderItem, {
      foreignKey: 'productId',
      as: 'orderItems'
    });

    this.hasMany(models.PurchaseOrderItem, {
      foreignKey: 'productId',
      as: 'purchaseOrderItems'
    });
  }

  // ─── Instance Methods ──────────────────────────────────────

  isLowStock() {
    return this.stock <= this.min_stock;
  }

  getStockStatus() {
    if (this.stock === 0) return 'out';
    if (this.stock <= this.min_stock) return 'low';
    return 'active';
  }

  updateStock(quantity, operation = 'add') {
    if (operation === 'add') {
      this.stock += quantity;
    } else if (operation === 'subtract') {
      this.stock = Math.max(0, this.stock - quantity);
    } else if (operation === 'set') {
      this.stock = Math.max(0, quantity);
    }
    return this.save();
  }

  // ─── Class Methods ──────────────────────────────────────

  static getLowStockProducts() {
    return this.findAll({
      where: sequelize.where(
        sequelize.col('stock'),
        '<=',
        sequelize.col('min_stock')
      ),
      include: ['supplier']
    });
  }

  static getOutOfStockProducts() {
    return this.findAll({
      where: { stock: 0 },
      include: ['supplier']
    });
  }
}

module.exports = Product;
