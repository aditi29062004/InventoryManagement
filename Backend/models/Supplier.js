const { Model } = require('sequelize');

class Supplier extends Model {
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
          notEmpty: { msg: 'Company name is required' },
          len: [1, 255]
        }
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [0, 255]
        }
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: { msg: 'Must be a valid email address' },
          notEmpty: { msg: 'Email is required' }
        }
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [0, 20],
          is: {
            args: /^[\d\s\-\+\(\)]*$/,
            msg: 'Phone number contains invalid characters'
          }
        }
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      website: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isUrl: { msg: 'Must be a valid URL' }
        }
      },
      tax_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      payment_terms: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Net 30'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'blocked'),
        defaultValue: 'active'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      rating: {
        type: DataTypes.DECIMAL(2, 1),
        allowNull: true,
        validate: {
          min: { args: [1.0], msg: 'Rating must be between 1.0 and 5.0' },
          max: { args: [5.0], msg: 'Rating must be between 1.0 and 5.0' }
        }
      }
    }, {
      sequelize,
      modelName: 'Supplier',
      tableName: 'suppliers',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['email'] },
        {
          unique: true,
          fields: ['tax_id'],
          where: {
            tax_id: {
              [sequelize.Sequelize.Op.ne]: null
            }
          }
        },
        { fields: ['status'] },
        { fields: ['name'] }
      ],
      hooks: {
        beforeValidate: (supplier) => {
          if (supplier.name) supplier.name = supplier.name.trim();
          if (supplier.contact_person) supplier.contact_person = supplier.contact_person.trim();
          if (supplier.email) supplier.email = supplier.email.trim().toLowerCase();
          if (supplier.phone) supplier.phone = supplier.phone.trim();
          if (supplier.address) supplier.address = supplier.address.trim();
          if (supplier.website) supplier.website = supplier.website.trim();
          if (supplier.tax_id) supplier.tax_id = supplier.tax_id.trim();
          if (supplier.payment_terms) supplier.payment_terms = supplier.payment_terms.trim();
          if (supplier.notes) supplier.notes = supplier.notes.trim();
        }
      }
    });
  }

  static associate(models) {
    this.hasMany(models.Product, {
      foreignKey: 'supplier_id',
      as: 'products'
    });

    this.hasMany(models.PurchaseOrder, {
      foreignKey: 'supplier_id',
      as: 'purchaseOrders'
    });
  }

  async getProductCount() {
    const Product = this.sequelize.models.Product;
    return await Product.count({ where: { supplier_id: this.id } });
  }

  async getTotalPurchaseAmount(startDate = null, endDate = null) {
    const PurchaseOrder = this.sequelize.models.PurchaseOrder;
    const whereClause = {
      supplier_id: this.id,
      status: 'completed'
    };

    if (startDate && endDate) {
      whereClause.created_at = {
        [this.sequelize.Sequelize.Op.between]: [startDate, endDate]
      };
    }

    const result = await PurchaseOrder.sum('total', { where: whereClause });
    return result || 0;
  }

  async getAverageDeliveryTime() {
    const PurchaseOrder = this.sequelize.models.PurchaseOrder;
    const orders = await PurchaseOrder.findAll({
      where: {
        supplier_id: this.id,
        status: 'completed',
        expected_date: { [this.sequelize.Sequelize.Op.ne]: null },
        received_date: { [this.sequelize.Sequelize.Op.ne]: null }
      },
      attributes: ['expected_date', 'received_date']
    });

    if (orders.length === 0) return null;

    const totalDays = orders.reduce((sum, order) => {
      const expected = new Date(order.expected_date);
      const received = new Date(order.received_date);
      return sum + Math.abs((received - expected) / (1000 * 60 * 60 * 24));
    }, 0);

    return Math.round(totalDays / orders.length);
  }

  static async getActiveSuppliers() {
    return await this.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']]
    });
  }

  static async getSupplierStats() {
    const total = await this.count();
    const active = await this.count({ where: { status: 'active' } });
    const inactive = await this.count({ where: { status: 'inactive' } });
    const blocked = await this.count({ where: { status: 'blocked' } });

    return { total, active, inactive, blocked };
  }
}

module.exports = Supplier;
