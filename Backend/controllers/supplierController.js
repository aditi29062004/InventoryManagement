// controllers/supplierController.js
const { Supplier, Product } = require('../models');
const { Op } = require('sequelize');

const supplierController = {
  // Get all suppliers with optional filtering
  getAllSuppliers: async (req, res) => {
    try {
      const { 
        search,
        page = 1, 
        limit = 50 
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

      // Apply search filter
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { contact_person: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }

      const suppliers = await Supplier.findAndCountAll({
        where,
        include: [{
          model: Product,
          as: 'products',
          attributes: ['id', 'name', 'stock'],
          required: false
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      // Add product count to each supplier
      const suppliersWithCount = suppliers.rows.map(supplier => ({
        ...supplier.toJSON(),
        product_count: supplier.products ? supplier.products.length : 0
      }));

      res.json({
        success: true,
        data: suppliersWithCount,
        pagination: {
          total: suppliers.count,
          page: parseInt(page),
          pages: Math.ceil(suppliers.count / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get suppliers error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch suppliers',
        error: error.message
      });
    }
  },

  // Get single supplier by ID
  getSupplierById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const supplier = await Supplier.findByPk(id, {
        include: [{
          model: Product,
          as: 'products',
          attributes: ['id', 'name', 'sku', 'stock', 'min_stock', 'price']
        }]
      });

      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      res.json({
        success: true,
        data: supplier
      });
    } catch (error) {
      console.error('Get supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch supplier',
        error: error.message
      });
    }
  },

  // Create new supplier
  createSupplier: async (req, res) => {
    try {
      const {
        name,
        contact_person,
        email,
        phone,
        address
      } = req.body;

      // Validation
      const errors = [];
      if (!name?.trim()) errors.push('Company name is required');
      if (!email?.trim()) errors.push('Email is required');
      
      // Email format validation
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Invalid email format');
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      // Check for duplicate email
      const existingEmail = await Supplier.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      const supplier = await Supplier.create({
        name: name.trim(),
        contact_person: contact_person?.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim(),
        address: address?.trim()
      });

      res.status(201).json({
        success: true,
        message: 'Supplier created successfully',
        data: supplier
      });
    } catch (error) {
      console.error('Create supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create supplier',
        error: error.message
      });
    }
  },

  // Update supplier
  updateSupplier: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        contact_person,
        email,
        phone,
        address
      } = req.body;

      const supplier = await Supplier.findByPk(id);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      // Validation
      const errors = [];
      if (name !== undefined && !name?.trim()) errors.push('Company name is required');
      if (email !== undefined && !email?.trim()) errors.push('Email is required');
      
      // Email format validation
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Invalid email format');
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      // Check for duplicate email (excluding current supplier)
      if (email && email.toLowerCase() !== supplier.email) {
        const existingEmail = await Supplier.findOne({ 
          where: { 
            email: email.toLowerCase(),
            id: { [Op.ne]: id }
          } 
        });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'Email already exists'
          });
        }
      }

      // Update supplier
      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (contact_person !== undefined) updateData.contact_person = contact_person?.trim();
      if (email !== undefined) updateData.email = email.trim().toLowerCase();
      if (phone !== undefined) updateData.phone = phone?.trim();
      if (address !== undefined) updateData.address = address?.trim();

      await supplier.update(updateData);

      res.json({
        success: true,
        message: 'Supplier updated successfully',
        data: supplier
      });
    } catch (error) {
      console.error('Update supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update supplier',
        error: error.message
      });
    }
  },

  // Delete supplier
  deleteSupplier: async (req, res) => {
    try {
      const { id } = req.params;
      
      const supplier = await Supplier.findByPk(id);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      // Check if supplier has any products
      const productCount = await Product.count({ where: { supplier_id: id } });
      if (productCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete supplier with associated products',
          product_count: productCount
        });
      }

      await supplier.destroy();

      res.json({
        success: true,
        message: 'Supplier deleted successfully'
      });
    } catch (error) {
      console.error('Delete supplier error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete supplier',
        error: error.message
      });
    }
  },

  // Get supplier's products
  getSupplierProducts: async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        low_stock,
        page = 1, 
        limit = 20 
      } = req.query;

      const supplier = await Supplier.findByPk(id);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      const offset = (page - 1) * limit;
      const where = { supplier_id: id };

      // Filter for low stock if requested
      if (low_stock === 'true') {
        where[Op.and] = [
          { stock: { [Op.lte]: { [Op.col]: 'min_stock' } } }
        ];
      }

      const products = await Product.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['name', 'ASC']]
      });

      res.json({
        success: true,
        data: {
          supplier,
          products: products.rows,
          pagination: {
            total: products.count,
            page: parseInt(page),
            pages: Math.ceil(products.count / limit),
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get supplier products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch supplier products',
        error: error.message
      });
    }
  },

  // Get supplier statistics
  getSupplierStats: async (req, res) => {
    try {
      const { id } = req.params;

      const supplier = await Supplier.findByPk(id);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      // Get product statistics
      const products = await Product.findAll({
        where: { supplier_id: id },
        attributes: ['id', 'stock', 'min_stock', 'cost', 'price']
      });

      const stats = {
        total_products: products.length,
        low_stock_products: products.filter(p => p.stock <= p.min_stock).length,
        out_of_stock_products: products.filter(p => p.stock === 0).length,
        total_inventory_value: products.reduce((sum, p) => sum + (p.stock * p.cost), 0),
        total_inventory_items: products.reduce((sum, p) => sum + p.stock, 0)
      };

      res.json({
        success: true,
        data: {
          supplier: {
            id: supplier.id,
            name: supplier.name,
            contact_person: supplier.contact_person,
            email: supplier.email
          },
          stats
        }
      });
    } catch (error) {
      console.error('Get supplier stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch supplier statistics',
        error: error.message
      });
    }
  },

  // Get suppliers with low stock products
  getSuppliersWithLowStock: async (req, res) => {
    try {
      const suppliers = await Supplier.findAll({
        include: [{
          model: Product,
          as: 'products',
          where: {
            [Op.and]: [
              { stock: { [Op.lte]: { [Op.col]: 'min_stock' } } }
            ]
          },
          attributes: ['id', 'name', 'sku', 'stock', 'min_stock'],
          required: true
        }],
        order: [['name', 'ASC']]
      });

      // Format response with low stock count for each supplier
      const suppliersWithLowStock = suppliers.map(supplier => ({
        ...supplier.toJSON(),
        low_stock_count: supplier.products.length,
        low_stock_products: supplier.products
      }));

      res.json({
        success: true,
        data: suppliersWithLowStock,
        count: suppliersWithLowStock.length
      });
    } catch (error) {
      console.error('Get suppliers with low stock error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch suppliers with low stock',
        error: error.message
      });
    }
  },

  // Get all suppliers for dropdown/select purposes
  getSuppliersForSelect: async (req, res) => {
    try {
      const suppliers = await Supplier.findAll({
        attributes: ['id', 'name', 'contact_person'],
        order: [['name', 'ASC']]
      });

      res.json({
        success: true,
        data: suppliers
      });
    } catch (error) {
      console.error('Get suppliers for select error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch suppliers',
        error: error.message
      });
    }
  }
};

module.exports = supplierController;