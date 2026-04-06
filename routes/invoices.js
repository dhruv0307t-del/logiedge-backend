const express = require('express');
const router = express.Router();
const { getAllInvoices, getInvoiceById, createInvoice, getDashboardStats } = require('../controllers/invoiceController');

router.get('/stats/dashboard', getDashboardStats);
router.get('/', getAllInvoices);
router.get('/:id', getInvoiceById);
router.post('/', createInvoice);

module.exports = router;
