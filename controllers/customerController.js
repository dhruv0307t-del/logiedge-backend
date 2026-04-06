const pool = require('../db/pool');

const generateCustomerId = async () => {
  const result = await pool.query("SELECT id FROM customers ORDER BY id DESC LIMIT 1");
  if (result.rows.length === 0) return 'C00001';
  const lastNum = parseInt(result.rows[0].id.replace('C', ''), 10);
  return `C${String(lastNum + 1).padStart(5, '0')}`;
};

const getAllCustomers = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch customers' });
  }
};

const getCustomerById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch customer' });
  }
};

const createCustomer = async (req, res) => {
  try {
    const { name, address, pan, gstin, is_active } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const id = await generateCustomerId();
    const active = is_active !== undefined ? is_active : true;
    const result = await pool.query(
      `INSERT INTO customers (id, name, address, pan, gstin, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name.trim(), address || null, pan?.trim() || null, gstin?.trim() || null, active]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Customer already exists' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to create customer' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    // Check if customer has invoices
    const inv = await pool.query('SELECT id FROM invoices WHERE customer_id = $1 LIMIT 1', [id]);
    if (inv.rows.length > 0)
      return res.status(409).json({ success: false, message: 'Cannot delete customer with existing invoices.' });
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete customer' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, pan, gstin, is_active } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const result = await pool.query(
      `UPDATE customers 
       SET name = $1, address = $2, pan = $3, gstin = $4, is_active = $5
       WHERE id = $6 RETURNING *`,
      [name.trim(), address || null, pan?.trim() || null, gstin?.trim() || null, is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Customer details conflict' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update customer' });
  }
};

module.exports = { getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer };
