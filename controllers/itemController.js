const pool = require('../db/pool');

const generateItemId = async () => {
  const result = await pool.query("SELECT id FROM items ORDER BY id DESC LIMIT 1");
  if (result.rows.length === 0) return 'IT00001';
  const lastNum = parseInt(result.rows[0].id.replace('IT', ''), 10);
  return `IT${String(lastNum + 1).padStart(5, '0')}`;
};

const getAllItems = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
};

const getItemById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch item' });
  }
};

const createItem = async (req, res) => {
  try {
    const { name, description, unit_price, unit, is_active } = req.body;
    if (!name || unit_price == null || parseFloat(unit_price) < 0)
      return res.status(400).json({ success: false, message: 'Name and valid price are required' });
    const id = await generateItemId();
    const active = is_active !== undefined ? is_active : true;
    const result = await pool.query(
      `INSERT INTO items (id, name, description, unit_price, unit, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name.trim(), description || null, parseFloat(unit_price), unit?.trim() || 'pcs', active]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to create item' });
  }
};

const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    // Check if item is used in any invoice
    const used = await pool.query('SELECT id FROM invoice_items WHERE item_id = $1 LIMIT 1', [id]);
    if (used.rows.length > 0)
      return res.status(409).json({ success: false, message: 'Cannot delete item used in existing invoices.' });
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete item' });
  }
};

const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, unit_price, unit, is_active } = req.body;
    if (!name || unit_price == null || parseFloat(unit_price) < 0)
      return res.status(400).json({ success: false, message: 'Name and valid price are required' });
    const result = await pool.query(
      `UPDATE items 
       SET name = $1, description = $2, unit_price = $3, unit = $4, is_active = $5
       WHERE id = $6 RETURNING *`,
      [name.trim(), description || null, parseFloat(unit_price), unit?.trim() || 'pcs', is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to update item' });
  }
};

module.exports = { getAllItems, getItemById, createItem, updateItem, deleteItem };
