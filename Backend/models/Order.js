const { Model } = require('sequelize');

class Order extends Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      order_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      customer_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: 'Customer name is required' },
          len: [1, 255]
        }
      },
      customer_email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: { msg: 'Must be a valid email address' }
        }
      },
      customer_phone: {
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
      shipping_address: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      billing_address: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        validate: {
          min: { args: [0], msg: 'Subtotal must be greater than or equal to 0' }
        }
      },
      tax_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        validate: {
          min: { args: [0], msg: 'Tax amount must be greater than or equal to 0' }
        }
      },
      shipping_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        validate: {
          min: { args: [0], msg: 'Shipping cost must be greater than or equal to 0' }
        }
      },
      discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        validate: {
          min: { args: [0], msg: 'Discount amount must be greater than or equal to 0' }
        }
      },
      total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        validate: {
          min: { args: [0], msg: 'Total must be greater than or equal to 0' }
        }
      },
      status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'),
        defaultValue: 'pending'
      },
      payment_status: {
        type: DataTypes.ENUM('pending', 'paid', 'partially_paid', 'refunded', 'failed'),
        defaultValue: 'pending'
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      shipped_date: {
        type: DataTypes.DATE,
        allowNull: true
      },
      delivered_date: {
        type: DataTypes.DATE,
        allowNull: true
      },
      cancelled_date: {
        type: DataTypes.DATE,
        allowNull: true
      },
      cancellation_reason: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'Order',
      tableName: 'orders',
      indexes: [
        { unique: true, fields: ['order_number'] },
        { fields: ['customer_email'] },
        { fields: ['status'] },
        { fields: ['payment_status'] },
        { fields: ['created_at'] }
      ],
      hooks: {
        beforeCreate: async (order) => {
          if (!order.order_number) {
            const count = await Order.count();
            order.order_number = `ORD-${String(count + 1).padStart(6, '0')}`;
          }
        },
        beforeValidate: (order) => {
          if (order.customer_name) order.customer_name = order.customer_name.trim();
          if (order.customer_email) order.customer_email = order.customer_email.trim().toLowerCase();
          if (order.customer_phone) order.customer_phone = order.customer_phone.trim();
          if (order.shipping_address) order.shipping_address = order.shipping_address.trim();
          if (order.billing_address) order.billing_address = order.billing_address.trim();
          if (order.payment_method) order.payment_method = order.payment_method.trim();
          if (order.notes) order.notes = order.notes.trim();
          if (order.cancellation_reason) order.cancellation_reason = order.cancellation_reason.trim();
        },
        beforeSave: (order) => {
          order.total = parseFloat(order.subtotal) + parseFloat(order.tax_amount) +
                        parseFloat(order.shipping_cost) - parseFloat(order.discount_amount);
        }
      }
    });
  }

  static associate(models) {
    this.hasMany(models.OrderItem, {
      foreignKey: 'orderId',
      as: 'orderItems',
      onDelete: 'CASCADE'
    });
  }

  // ─── Instance Methods ──────────────────────────────────────

  async calculateTotalFromItems() {
    const OrderItem = require('./OrderItem');
    const items = await OrderItem.findAll({
      where: { order_id: this.id }
    });

    this.subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    this.total = this.subtotal + this.tax_amount + this.shipping_cost - this.discount_amount;

    return this.save();
  }

  async getItemCount() {
    const OrderItem = require('./OrderItem');
    return await OrderItem.count({ where: { order_id: this.id } });
  }

  async getTotalQuantity() {
    const OrderItem = require('./OrderItem');
    const result = await OrderItem.sum('quantity', { where: { order_id: this.id } });
    return result || 0;
  }

  canBeCancelled() {
    return ['pending', 'confirmed'].includes(this.status);
  }

  canBeShipped() {
    return ['confirmed', 'processing'].includes(this.status) && this.payment_status === 'paid';
  }

  cancel(reason = null) {
    if (!this.canBeCancelled()) {
      throw new Error('Order cannot be cancelled in current status');
    }

    this.status = 'cancelled';
    this.cancelled_date = new Date();
    this.cancellation_reason = reason;

    return this.save();
  }

  markAsShipped() {
    if (!this.canBeShipped()) {
      throw new Error('Order cannot be shipped in current status');
    }

    this.status = 'shipped';
    this.shipped_date = new Date();

    return this.save();
  }

  markAsDelivered() {
    if (this.status !== 'shipped') {
      throw new Error('Order must be shipped before marking as delivered');
    }

    this.status = 'delivered';
    this.delivered_date = new Date();

    return this.save();
  }

  complete() {
    if (this.status !== 'delivered') {
      throw new Error('Order must be delivered before completion');
    }

    this.status = 'completed';
    return this.save();
  }

  // ─── Class Methods ──────────────────────────────────────

  static getOrdersByStatus(status) {
    return this.findAll({
      where: { status },
      include: ['OrderItems'],
      order: [['created_at', 'DESC']]
    });
  }

  static getRecentOrders(limit = 10) {
    return this.findAll({
      limit,
      order: [['created_at', 'DESC']],
      include: ['OrderItems']
    });
  }

  static async getOrderStats() {
    const total = await this.count();
    const pending = await this.count({ where: { status: 'pending' } });
    const completed = await this.count({ where: { status: 'completed' } });
    const cancelled = await this.count({ where: { status: 'cancelled' } });

    const totalRevenue = await this.sum('total', {
      where: { status: 'completed' }
    }) || 0;

    const avgOrderValue = completed > 0 ? totalRevenue / completed : 0;

    return {
      total,
      pending,
      completed,
      cancelled,
      totalRevenue: parseFloat(totalRevenue),
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2))
    };
  }
}

module.exports = Order;
