import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

const db = new sqlite3.Database('./cerita-kita.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Buat tabel Users
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user'
        )`, (err) => {
            if (!err) {
                // Seed Admin User
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync('admin123', salt);
                db.run(`INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)`, 
                    [1, 'Admin Toko', 'admin@ceritakita.com', hash, 'admin']);
            }
        });

        // Buat tabel Books
        db.run(`CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            author TEXT,
            genre TEXT,
            price TEXT,
            rating REAL,
            cover TEXT,
            synopsis TEXT,
            publisher TEXT,
            pages INTEGER,
            isbn TEXT
        )`, (err) => {
            if (!err) {
                // Insert dummy book if empty
                db.get("SELECT count(*) as count FROM books", (err, row) => {
                    if (row && row.count === 0) {
                        db.run(`INSERT INTO books (title, author, genre, price, rating, cover, synopsis, publisher, pages, isbn) VALUES 
                            ('Hujan Bulan Juni', 'Sapardi Djoko Damono', 'romance', 'Rp 85.000', 4.8, 'hujan.png', 'Kumpulan puisi cinta legendaris yang menyentuh hati dan jiwa.', 'Gramedia Pustaka Utama', 120, '978-602-03-1843-1'),
                            ('Dilan 1990', 'Pidi Baiq', 'romance', 'Rp 75.000', 4.7, 'dilan.webp', 'Kisah cinta masa SMA yang manis dan penuh warna di Bandung tahun 1990.', 'Pastel Books', 332, '978-602-7870-41-3'),
                            ('Secret High School', 'Queena', 'thriller', 'Rp 89.000', 4.6, 'secret.png', 'Misteri kelam di balik sekolah elit yang menyimpan rahasia mematikan.', 'Bukune', 280, '978-602-220-334-7'),
                            ('Supernova', 'Dee Lestari', 'fantasy', 'Rp 100.000', 4.6, 'super.png', 'Kisah fiksi sains fantasi yang menggabungkan romansa, spiritualitas, dan sains modern.', 'Bentang Pustaka', 300, '978-979-1227-01-2')`);
                    }
                });
            }
        });

        // Buat tabel Orders
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            total_amount TEXT,
            status TEXT DEFAULT 'Diproses',
            items TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Buat tabel Wishlists
        db.run(`CREATE TABLE IF NOT EXISTS wishlists (
            user_id INTEGER,
            book_id INTEGER,
            PRIMARY KEY (user_id, book_id)
        )`);

        // Buat tabel Cart Items
        db.run(`CREATE TABLE IF NOT EXISTS cart_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            book_id INTEGER,
            quantity INTEGER DEFAULT 1
        )`);
    }
});

export default db;
