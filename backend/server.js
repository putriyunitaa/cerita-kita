import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './database.js';
import midtransClient from 'midtrans-client';
import nodemailer from 'nodemailer';

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'cerita-kita-rahasia'; // Dalam production gunakan environment variables

// Konfigurasi Midtrans (Sandbox)
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: 'SB-Mid-server-zG_rI9yP2Z9Mly62Vz118sOq',
    clientKey: 'SB-Mid-client-A2wSjY-F0Xb13C0f'
});

// Konfigurasi NodeMailer (Gunakan Gmail atau Ethereal untuk testing lokal)
const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'jessyca.gottlieb82@ethereal.email', // Mock email Ethereal
        pass: '6XzM6S7X9qZbJ3wK9j'
    }
});

// Helper untuk kirim email
const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: '"Cerita Kita" <hello@ceritakita.com>',
            to,
            subject,
            html
        });
        console.log("Email terkirim! Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error("Gagal mengirim email:", error);
    }
};

app.use(cors());
app.use(express.json());

// Middleware Otentikasi
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user; // Menyimpan data user (termasuk role) ke dalam request
        next();
    });
};

// Middleware Khusus Admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Akses ditolak, fitur ini hanya untuk Admin' });
    }
    next();
};

// =======================
// AUTH ENDPOINTS (Login & Register)
// =======================
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ success: false, message: 'Email tidak ditemukan' });

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) return res.status(400).json({ success: false, message: 'Password salah' });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ success: true, token, user: { name: user.name, role: user.role } });
    });
});

app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, hash], function(err) {
        if (err) return res.status(400).json({ success: false, message: 'Email sudah terdaftar atau format salah' });
        
        sendEmail(
            email, 
            'Selamat Datang di Cerita Kita!', 
            `<h3>Halo ${name}!</h3><p>Terima kasih telah mendaftar di Cerita Kita. Temukan ribuan novel menarik dan mulai petualangan membacamu hari ini.</p>`
        );
        
        res.json({ success: true, message: 'Registrasi berhasil, silakan login.' });
    });
});

// =======================
// CRUD BOOKS ENDPOINTS
// =======================

// READ (All Books) - Bisa diakses siapa saja (mendukung pencarian lanjutan)
app.get('/api/books', (req, res) => {
    const { search, genre, author, minRating, maxPrice } = req.query;
    
    let query = `SELECT * FROM books WHERE 1=1`;
    let params = [];
    
    if (search) {
        query += ` AND (title LIKE ? OR author LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    if (genre && genre !== 'semua') {
        query += ` AND genre = ?`;
        params.push(genre);
    }
    if (author) {
        query += ` AND author LIKE ?`;
        params.push(`%${author}%`);
    }
    if (minRating) {
        query += ` AND rating >= ?`;
        params.push(parseFloat(minRating));
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let results = rows;
        if (maxPrice) {
            const max = parseInt(maxPrice);
            results = results.filter(book => {
                const priceNum = parseInt(book.price.replace(/\\D/g, ''));
                return priceNum <= max;
            });
        }
        
        res.json(results);
    });
});

// CREATE Book - Hanya Admin
app.post('/api/books', authenticateToken, requireAdmin, (req, res) => {
    const { title, author, genre, price, rating, cover } = req.body;
    db.run(`INSERT INTO books (title, author, genre, price, rating, cover) VALUES (?, ?, ?, ?, ?, ?)`,
        [title, author, genre, price, rating, cover], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID, message: 'Buku berhasil ditambahkan' });
        });
});

// UPDATE Book - Hanya Admin
app.put('/api/books/:id', authenticateToken, requireAdmin, (req, res) => {
    const { title, author, genre, price, rating, cover } = req.body;
    db.run(`UPDATE books SET title = ?, author = ?, genre = ?, price = ?, rating = ?, cover = ? WHERE id = ?`,
        [title, author, genre, price, rating, cover, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Data buku berhasil diperbarui' });
        });
});

// DELETE Book - Hanya Admin
app.delete('/api/books/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run(`DELETE FROM books WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Buku berhasil dihapus dari katalog' });
    });
});

// =======================
// ORDERS ENDPOINTS
// =======================

// GET User Orders - Menampilkan riwayat pesanan user yang sedang login
app.get('/api/orders', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// =======================
// WISHLISTS ENDPOINTS
// =======================

// GET User Wishlist
app.get('/api/wishlist', authenticateToken, (req, res) => {
    db.all(`SELECT book_id FROM wishlists WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.book_id));
    });
});

// POST Toggle Wishlist
app.post('/api/wishlist/toggle', authenticateToken, (req, res) => {
    const { book_id } = req.body;
    db.get(`SELECT * FROM wishlists WHERE user_id = ? AND book_id = ?`, [req.user.id, book_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            db.run(`DELETE FROM wishlists WHERE user_id = ? AND book_id = ?`, [req.user.id, book_id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ action: 'removed', book_id });
            });
        } else {
            db.run(`INSERT INTO wishlists (user_id, book_id) VALUES (?, ?)`, [req.user.id, book_id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ action: 'added', book_id });
            });
        }
    });
});

// =======================
// CART ENDPOINTS
// =======================

// GET User Cart
app.get('/api/cart', authenticateToken, (req, res) => {
    db.all(`SELECT c.book_id, c.quantity, b.* FROM cart_items c JOIN books b ON c.book_id = b.id WHERE c.user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST Add to Cart
app.post('/api/cart', authenticateToken, (req, res) => {
    const { book_id } = req.body;
    db.get(`SELECT * FROM cart_items WHERE user_id = ? AND book_id = ?`, [req.user.id, book_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            db.run(`UPDATE cart_items SET quantity = quantity + 1 WHERE id = ?`, [row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Kuantitas ditambah' });
            });
        } else {
            db.run(`INSERT INTO cart_items (user_id, book_id) VALUES (?, ?)`, [req.user.id, book_id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Dimasukkan ke keranjang' });
            });
        }
    });
});

// DELETE Remove from Cart
app.delete('/api/cart/:book_id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM cart_items WHERE user_id = ? AND book_id = ?`, [req.user.id, req.params.book_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Dihapus dari keranjang' });
    });
});

// POST Apply Promo (Mock)
app.post('/api/cart/promo', (req, res) => {
    const { code } = req.body;
    if (code && code.toUpperCase() === 'CERITAKITA20') {
        res.json({ success: true, discount: 0.20, message: 'Diskon 20% diterapkan!' });
    } else {
        res.status(400).json({ success: false, message: 'Kode promo tidak valid atau kadaluarsa.' });
    }
});

// =======================
// CHECKOUT & ORDERS ENDPOINTS
// =======================

app.post('/api/checkout', authenticateToken, async (req, res) => {
    const { shipping_method, shipping_cost, payment_method, address, items, total_amount } = req.body;
    
    // Ambil angka dari string "Rp 150.000"
    const grossAmount = parseInt(total_amount.replace(/\D/g, ''));
    const orderId = 'CK-' + Date.now() + '-' + req.user.id;
    
    const parameter = {
        "transaction_details": {
            "order_id": orderId,
            "gross_amount": grossAmount
        },
        "customer_details": {
            "first_name": req.user.name || "Pelanggan",
            "email": req.user.email || "user@ceritakita.com",
            "shipping_address": {
                "address": address
            }
        }
    };

    try {
        const transaction = await snap.createTransaction(parameter);
        const snapToken = transaction.token;
        
        db.run(`INSERT INTO orders (user_id, total_amount, status, items) VALUES (?, ?, ?, ?)`,
            [req.user.id, total_amount, 'Menunggu Pembayaran', JSON.stringify(items)], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                db.run(`DELETE FROM cart_items WHERE user_id = ?`, [req.user.id], function(err2) {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ success: true, snap_token: snapToken, message: 'Silakan lanjutkan pembayaran via Midtrans.' });
                });
            });
    } catch (e) {
        console.error("Midtrans Error:", e);
        res.status(500).json({ error: 'Gagal menghubungi Payment Gateway', details: e.message });
    }
});

// =======================
// ADMIN DASHBOARD ENDPOINTS
// =======================

app.get('/api/admin/orders', authenticateToken, requireAdmin, (req, res) => {
    db.all(`SELECT o.*, u.name as user_name FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    db.get(`SELECT COUNT(*) as total_orders, SUM(CAST(REPLACE(REPLACE(total_amount, 'Rp ', ''), '.', '') AS INTEGER)) as revenue FROM orders`, (err, orderStats) => {
        db.get(`SELECT COUNT(*) as total_books FROM books`, (err, bookStats) => {
            db.get(`SELECT COUNT(*) as total_users FROM users WHERE role = 'user'`, (err, userStats) => {
                res.json({
                    revenue: orderStats ? orderStats.revenue || 0 : 0,
                    orders: orderStats ? orderStats.total_orders || 0 : 0,
                    books: bookStats ? bookStats.total_books || 0 : 0,
                    users: userStats ? userStats.total_users || 0 : 0
                });
            });
        });
    });
});

app.put('/api/admin/orders/:id', authenticateToken, requireAdmin, (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // Dapatkan email user untuk notifikasi
        db.get(`SELECT u.email, u.name, o.id FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`, [req.params.id], (err, row) => {
            if (row && status === 'Dikirim') {
                sendEmail(
                    row.email,
                    'Pesanan Anda Sedang Dikirim! 🚚',
                    `<h3>Halo ${row.name},</h3><p>Kabar gembira! Pesanan Anda dengan ID #${row.id} telah diserahkan ke pihak kurir dan sedang dalam perjalanan menuju alamat Anda.</p><p>Terima kasih telah berbelanja di Cerita Kita.</p>`
                );
            }
        });
        
        res.json({ success: true, message: 'Status pesanan diperbarui!' });
    });
});

app.listen(PORT, () => {
    console.log(`Server Backend berjalan pada http://localhost:${PORT}`);
});
