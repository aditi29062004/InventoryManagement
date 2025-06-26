// controllers/productController.js
const { Product, Supplier } = require('../models');
const { Op } = require('sequelize');

const productController = {
  // Get all products with optional filtering
  getAllProducts: async (req, res) => {
    try {
      const { 
        category, 
        lowStock, 
        supplier_id, 
        search,
        page = 1, 
        limit = 50 
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

      // Apply filters
      if (category) where.category = category;
      if (supplier_id) where.supplier_id = supplier_id;
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { sku: { [Op.like]: `%${search}%` } },
          { barcode: { [Op.like]: `%${search}%` } }
        ];
      }
      if (lowStock === 'true') {
        where[Op.and] = [
          { stock: { [Op.lte]: { [Op.col]: 'min_stock' } } }
        ];
      }

      const products = await Product.findAndCountAll({
        where,
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'contact_person']
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: products.rows,
        pagination: {
          total: products.count,
          page: parseInt(page),
          pages: Math.ceil(products.count / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch products',
        error: error.message
      });
    }
  },

  // Get single product by ID
  getProductById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const product = await Product.findByPk(id, {
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'contact_person', 'email']
        }]
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      console.error('Get product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch product',
        error: error.message
      });
    }
  },

  // Create new product
  createProduct: async (req, res) => {
    try {
      const {
        name,
        sku,
        barcode,
        category,
        price,
        cost,
        stock,
        min_stock,
        supplier_id,
        description
      } = req.body;

      // Validation
      const errors = [];
      if (!name?.trim()) errors.push('Product name is required');
      if (!sku?.trim()) errors.push('SKU is required');
      if (!price || price <= 0) errors.push('Price must be greater than 0');
      if (!cost || cost <= 0) errors.push('Cost must be greater than 0');
      if (stock < 0) errors.push('Stock cannot be negative');
      if (min_stock < 0) errors.push('Minimum stock cannot be negative');

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      // Check for duplicate SKU
      const existingSKU = await Product.findOne({ where: { sku } });
      if (existingSKU) {
        return res.status(400).json({
          success: false,
          message: 'SKU already exists'
        });
      }

      // Verify supplier exists if provided
      if (supplier_id) {
        const supplier = await Supplier.findByPk(supplier_id);
        if (!supplier) {
          return res.status(400).json({
            success: false,
            message: 'Supplier not found'
          });
        }
      }

      const product = await Product.create({
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode?.trim(),
        category,
        price: parseFloat(price),
        cost: parseFloat(cost),
        stock: parseInt(stock),
        min_stock: parseInt(min_stock),
        supplier_id: supplier_id || null,
        description: description?.trim()
      });

      // Fetch the created product with supplier info
      const createdProduct = await Product.findByPk(product.id, {
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'contact_person']
        }]
      });

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: createdProduct
      });
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create product',
        error: error.message
      });
    }
  },

  // Update product
  updateProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        sku,
        barcode,
        category,
        price,
        cost,
        stock,
        min_stock,
        supplier_id,
        description
      } = req.body;

      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Validation
      const errors = [];
      if (name !== undefined && !name?.trim()) errors.push('Product name is required');
      if (sku !== undefined && !sku?.trim()) errors.push('SKU is required');
      if (price !== undefined && (price <= 0)) errors.push('Price must be greater than 0');
      if (cost !== undefined && (cost <= 0)) errors.push('Cost must be greater than 0');
      if (stock !== undefined && stock < 0) errors.push('Stock cannot be negative');
      if (min_stock !== undefined && min_stock < 0) errors.push('Minimum stock cannot be negative');

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      // Check for duplicate SKU (excluding current product)
      if (sku && sku !== product.sku) {
        const existingSKU = await Product.findOne({ 
          where: { 
            sku,
            id: { [Op.ne]: id }
          } 
        });
        if (existingSKU) {
          return res.status(400).json({
            success: false,
            message: 'SKU already exists'
          });
        }
      }

      // Verify supplier exists if provided
      if (supplier_id) {
        const supplier = await Supplier.findByPk(supplier_id);
        if (!supplier) {
          return res.status(400).json({
            success: false,
            message: 'Supplier not found'
          });
        }
      }

      // Update product
      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (sku !== undefined) updateData.sku = sku.trim();
      if (barcode !== undefined) updateData.barcode = barcode?.trim();
      if (category !== undefined) updateData.category = category;
      if (price !== undefined) updateData.price = parseFloat(price);
      if (cost !== undefined) updateData.cost = parseFloat(cost);
      if (stock !== undefined) updateData.stock = parseInt(stock);
      if (min_stock !== undefined) updateData.min_stock = parseInt(min_stock);
      if (supplier_id !== undefined) updateData.supplier_id = supplier_id || null;
      if (description !== undefined) updateData.description = description?.trim();

      await product.update(updateData);

      // Fetch updated product with supplier info
      const updatedProduct = await Product.findByPk(id, {
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'contact_person']
        }]
      });

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct
      });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update product',
        error: error.message
      });
    }
  },

  // Delete product
  deleteProduct: async (req, res) => {
    try {
      const { id } = req.params;
      
      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if product has any orders (you might want to prevent deletion)
      // This would require checking OrderItems if you want to prevent deletion
      
      await product.destroy();

      res.json({
        success: true,
        message: 'Product deleted successfully',
        data: { id: product.id, name: product.name, sku: product.sku }
      });
    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete product',
        error: error.message
      });
    }
  },

  // Adjust product stock
  adjustStock: async (req, res) => {
    try {
      const { id } = req.params;
      const { stock, adjustment_type, reason } = req.body;

      if (stock === undefined || stock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid stock quantity is required'
        });
      }

      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      const oldStock = product.stock;
      await product.update({ stock: parseInt(stock) });

      // You could log this adjustment in a separate table if needed
      console.log(`Stock adjustment for ${product.name}: ${oldStock} -> ${stock} (${adjustment_type}: ${reason})`);

      res.json({
        success: true,
        message: 'Stock adjusted successfully',
        data: {
          product_id: product.id,
          old_stock: oldStock,
          new_stock: parseInt(stock),
          adjustment: parseInt(stock) - oldStock
        }
      });
    } catch (error) {
      console.error('Adjust stock error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to adjust stock',
        error: error.message
      });
    }
  },

  // Get low stock products
  getLowStockProducts: async (req, res) => {
    try {
      const products = await Product.findAll({
        where: {
          [Op.and]: [
            { stock: { [Op.lte]: { [Op.col]: 'min_stock' } } }
          ]
        },
        include: [{
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'contact_person']
        }],
        order: [['stock', 'ASC']]
      });

      res.json({
        success: true,
        data: products,
        count: products.length
      });
    } catch (error) {
      console.error('Get low stock products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch low stock products',
        error: error.message
      });
    }
  },

  // Get product categories
  getCategories: async (req, res) => {
    try {
      const categories = await Product.findAll({
        attributes: ['category'],
        where: {
          category: { [Op.ne]: null }
        },
        group: ['category'],
        raw: true
      });

      const categoryList = categories.map(c => c.category).filter(Boolean);

      res.json({
        success: true,
        data: categoryList
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: error.message
      });
    }
  },

  // Bulk update stock (for receiving purchase orders)
  bulkUpdateStock: async (req, res) => {
    try {
      const { updates } = req.body; // Array of { product_id, quantity_to_add }

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Updates array is required'
        });
      }

      const results = [];
      
      for (const update of updates) {
        const { product_id, quantity_to_add } = update;
        
        if (!product_id || quantity_to_add === undefined) {
          continue;
        }

        const product = await Product.findByPk(product_id);
        if (product) {
          const oldStock = product.stock;
          const newStock = oldStock + parseInt(quantity_to_add);
          
          await product.update({ stock: newStock });
          
          results.push({
            product_id,
            name: product.name,
            old_stock: oldStock,
            added: parseInt(quantity_to_add),
            new_stock: newStock
          });
        }
      }

      res.json({
        success: true,
        message: 'Stock updated successfully',
        data: results
      });
    } catch (error) {
      console.error('Bulk update stock error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update stock',
        error: error.message
      });
    }
  },
  // Add this function inside your productController object, before the closing brace

// Get product analytics
getProductAnalytics: async (req, res) => {
  try {
    // Total products count
    const totalProducts = await Product.count();
    
    // Low stock products count
    const lowStockCount = await Product.count({
      where: {
        [Op.and]: [
          { stock: { [Op.lte]: { [Op.col]: 'min_stock' } } }
        ]
      }
    });
    
    // Total inventory value
    const inventoryValue = await Product.sum('price', {
      where: {
        stock: { [Op.gt]: 0 }
      }
    }) || 0;
    
    // Category breakdown
    const categoryStats = await Product.findAll({
      attributes: [
        'category',
        [Product.sequelize.fn('COUNT', Product.sequelize.col('id')), 'count'],
        [Product.sequelize.fn('SUM', Product.sequelize.col('stock')), 'total_stock'],
        [Product.sequelize.fn('SUM', Product.sequelize.col('price')), 'total_value']
      ],
      where: {
        category: { [Op.ne]: null }
      },
      group: ['category'],
      raw: true
    });
    
    // Top products by stock value
    const topProductsByValue = await Product.findAll({
      attributes: ['id', 'name', 'sku', 'stock', 'price', 
        [Product.sequelize.literal('stock * price'), 'total_value']
      ],
      order: [[Product.sequelize.literal('stock * price'), 'DESC']],
      limit: 10,
      raw: true
    });
    
    // Stock status distribution
    const stockStatus = {
      in_stock: await Product.count({
        where: { stock: { [Op.gt]: { [Op.col]: 'min_stock' } } }
      }),
      low_stock: lowStockCount,
      out_of_stock: await Product.count({
        where: { stock: 0 }
      })
    };

    res.json({
      success: true,
      data: {
        overview: {
          total_products: totalProducts,
          low_stock_products: lowStockCount,
          total_inventory_value: parseFloat(inventoryValue.toFixed(2)),
          stock_status: stockStatus
        },
        category_breakdown: categoryStats.map(cat => ({
          category: cat.category,
          product_count: parseInt(cat.count),
          total_stock: parseInt(cat.total_stock || 0),
          total_value: parseFloat((cat.total_value || 0).toFixed(2))
        })),
        top_products_by_value: topProductsByValue.map(product => ({
          ...product,
          total_value: parseFloat(product.total_value.toFixed(2))
        }))
      }
    });
  } catch (error) {
    console.error('Get product analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product analytics',
      error: error.message
    });
  }
}
};

module.exports = productController;