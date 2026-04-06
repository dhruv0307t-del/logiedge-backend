const pool = require('../db/pool');

const GST_RATE = 0.18;

const generateInvoiceId = async () => {
  let id;
  let exists = true;
  while (exists) {
    const num = Math.floor(100000 + Math.random() * 900000);
    id = `INVC${num}`;
    const result = await pool.query('SELECT id FROM invoices WHERE id = $1', [id]);
    exists = result.rows.length > 0;
  }
  return id;
};

// GET all invoices (with customer info)
const getAllInvoices = async (req, res) => {
  try {
    const { customer_id, search } = req.query;
    let query = `
      SELECT i.*, c.name as customer_name, c.gstin
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (customer_id) {
      params.push(customer_id);
      conditions.push(`i.customer_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.id ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY i.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
  }
};

// GET single invoice with items
const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const invResult = await pool.query(
      `SELECT i.*, c.name as customer_name,
              c.address as customer_address, c.pan, c.gstin
       FROM invoices i JOIN customers c ON i.customer_id = c.id
       WHERE i.id = $1`,
      [id]
    );
    if (invResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Invoice not found' });

    const itemsResult = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
      [id]
    );
    res.json({
      success: true,
      data: { ...invResult.rows[0], items: itemsResult.rows }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch invoice' });
  }
};

// POST create invoice
const createInvoice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, items } = req.body;

    if (!customer_id || !items || !items.length)
      return res.status(400).json({ success: false, message: 'Customer and at least one item are required' });

    // Fetch customer
    const custResult = await client.query('SELECT * FROM customers WHERE id = $1', [customer_id]);
    if (custResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Customer not found' });

    const customer = custResult.rows[0];
    const gstRegistered = !!customer.gstin;

    // Fetch and validate items
    const itemDetails = [];
    let subtotal = 0;
    for (const entry of items) {
      const itemResult = await client.query('SELECT * FROM items WHERE id = $1', [entry.item_id]);
      if (itemResult.rows.length === 0)
        return res.status(404).json({ success: false, message: `Item ${entry.item_id} not found` });
      const item = itemResult.rows[0];
      const qty = parseInt(entry.quantity, 10);
      if (qty < 1)
        return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
      const amount = parseFloat(item.unit_price) * qty;
      subtotal += amount;
      itemDetails.push({ item, qty, amount });
    }

    const gstApplied = !gstRegistered;
    const gstAmount = gstApplied ? parseFloat((subtotal * GST_RATE).toFixed(2)) : 0;
    const total = parseFloat((subtotal + gstAmount).toFixed(2));
    const invoiceId = await generateInvoiceId();

    await client.query('BEGIN');

    // Insert invoice
    const invResult = await client.query(
      `INSERT INTO invoices (id, customer_id, subtotal, gst_amount, gst_applied, total)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [invoiceId, customer_id, subtotal.toFixed(2), gstAmount, gstApplied, total]
    );

    // Insert invoice items
    for (const { item, qty, amount } of itemDetails) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_id, item_name, unit_price, quantity, amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [invoiceId, item.id, item.name, item.unit_price, qty, amount.toFixed(2)]
      );
    }

    await client.query('COMMIT');

    // Return full invoice
    const itemsResult = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]
    );
    res.status(201).json({
      success: true,
      data: {
        ...invResult.rows[0],
        customer_name: customer.name,
        customer_email: customer.email,
        items: itemsResult.rows
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to create invoice' });
  } finally {
    client.release();
  }
};

// GET dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    const [invoiceStats, customerCount, itemCount, recent] = await Promise.all([
      pool.query('SELECT COUNT(*) as total_invoices, COALESCE(SUM(total),0) as total_revenue FROM invoices'),
      pool.query('SELECT COUNT(*) as count FROM customers'),
      pool.query('SELECT COUNT(*) as count FROM items'),
      pool.query(`
        SELECT i.id, i.total, i.gst_applied, i.created_at, c.name as customer_name
        FROM invoices i JOIN customers c ON i.customer_id = c.id
        ORDER BY i.created_at DESC LIMIT 8
      `)
    ]);
    res.json({
      success: true,
      data: {
        total_invoices: parseInt(invoiceStats.rows[0].total_invoices),
        total_revenue: parseFloat(invoiceStats.rows[0].total_revenue),
        customer_count: parseInt(customerCount.rows[0].count),
        item_count: parseInt(itemCount.rows[0].count),
        recent_invoices: recent.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

module.exports = { getAllInvoices, getInvoiceById, createInvoice, getDashboardStats };
