// Konfigurasi API
const API_URL = 'http://localhost:3000/api';

let booksData = [];
let currentFilter = 'semua';
let currentBooks = [];
let userWishlist = [];

// FUNGSI MENGAMBIL BUKU DARI BACKEND
async function fetchBooks(queryParams = '') {
    try {
        const response = await fetch(`${API_URL}/books${queryParams}`);
        const data = await response.json();
        
        // Fetch wishlist if logged in
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const wRes = await fetch(`${API_URL}/wishlist`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                userWishlist = await wRes.json();
            } catch (e) {
                console.error('Gagal mengambil wishlist');
            }
        }
        
        booksData = data.map(book => {
            if (!book.reviews) {
                book.reviews = [
                    { name: "Pembaca Setia", rating: Math.round(book.rating || 4), text: "Buku yang sangat bagus!" }
                ];
            }
            return book;
        });
        
        currentBooks = [...booksData];
        renderBooks(currentBooks);
        await fetchCart(); // Ambil keranjang dari server jika login
    } catch (error) {
        console.error("Gagal mengambil data buku:", error);
        document.getElementById('book-grid').innerHTML = '<p class="text-center col-span-full text-red-500 py-8">Gagal memuat buku. Pastikan server backend berjalan.</p>';
    }
}

let cartItems = JSON.parse(localStorage.getItem('cartItems')) || [];
let cartCount = cartItems.reduce((sum, item) => sum + (item.cart_quantity || 1), 0);
let promoDiscount = 0; // 0.20 = 20%


// LOGIKA KERANJANG (CART)
async function fetchCart() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const res = await fetch(`${API_URL}/cart`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            cartItems = data.map(item => ({ ...item, cart_quantity: item.quantity }));
            cartCount = cartItems.reduce((sum, item) => sum + item.cart_quantity, 0);
            updateCart();
        } catch (e) { console.error('Gagal memuat keranjang', e); }
    } else {
        cartCount = cartItems.reduce((sum, item) => sum + (item.cart_quantity || 1), 0);
        updateCart();
    }
}

async function addToCart(book) {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            await fetch(`${API_URL}/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ book_id: book.id })
            });
            await fetchCart();
            alert(book.title + ' dimasukkan ke keranjang (tersimpan di server)!');
        } catch (e) { console.error(e); }
    } else {
        const exist = cartItems.find(i => i.id === book.id);
        if (exist) { exist.cart_quantity = (exist.cart_quantity || 1) + 1; }
        else { cartItems.push({ ...book, cart_quantity: 1 }); }
        localStorage.setItem('cartItems', JSON.stringify(cartItems));
        cartCount = cartItems.reduce((sum, item) => sum + (item.cart_quantity || 1), 0);
        updateCart();
        alert(book.title + ' dimasukkan ke keranjang (lokal)!');
    }
}

async function removeFromCart(bookId, index) {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            await fetch(`${API_URL}/cart/${bookId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await fetchCart();
        } catch (e) { console.error(e); }
    } else {
        cartItems.splice(index, 1);
        localStorage.setItem('cartItems', JSON.stringify(cartItems));
        cartCount = cartItems.reduce((sum, item) => sum + (item.cart_quantity || 1), 0);
        updateCart();
    }
}

async function applyPromo() {
    const code = document.getElementById('promo-code-input').value;
    const msg = document.getElementById('promo-message');
    msg.classList.remove('hidden', 'text-emerald-500', 'text-red-500');
    
    try {
        const res = await fetch(`${API_URL}/cart/promo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        const textTarget = document.getElementById('promo-message-text') || msg;
        if (data.success) {
            promoDiscount = data.discount;
            textTarget.textContent = data.message;
            msg.classList.add('text-emerald-500', 'flex');
            updateCart();
        } else {
            promoDiscount = 0;
            textTarget.textContent = data.message;
            msg.classList.add('text-red-500', 'flex');
            updateCart();
        }
    } catch (e) {
        const textTarget = document.getElementById('promo-message-text') || msg;
        textTarget.textContent = "Terjadi kesalahan.";
        msg.classList.add('text-red-500', 'flex');
    }
}

// FUNGSI CHECKOUT
function openCheckoutModal() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Silakan login terlebih dahulu untuk melanjutkan pembayaran.');
        openAuthModal();
        return;
    }
    
    if (cartItems.length === 0) {
        alert('Keranjang belanja Anda masih kosong.');
        return;
    }

    document.getElementById('checkout-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Render items in checkout
    const itemsList = document.getElementById('checkout-items-list');
    itemsList.innerHTML = '';
    
    cartItems.forEach(item => {
        const qty = item.cart_quantity || 1;
        const div = document.createElement('div');
        div.className = 'flex items-center gap-4';
        div.innerHTML = `
            <img src="${item.cover}" alt="${item.title}" class="w-12 h-16 object-cover rounded shadow-sm">
            <div class="flex-1">
                <p class="font-bold text-slate-900 text-sm mb-0.5 line-clamp-1">${item.title}</p>
                <p class="text-[11px] text-slate-500 mb-1">${item.price} &times; ${qty}</p>
            </div>
        `;
        itemsList.appendChild(div);
    });

    updateCheckoutTotal();
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function updateCheckoutTotal() {
    let subtotal = 0;
    cartItems.forEach(item => {
        const qty = item.cart_quantity || 1;
        const price = parseInt(item.price.replace(/\D/g, ''));
        subtotal += price * qty;
    });

    const discountAmount = subtotal * promoDiscount;
    const discountedSubtotal = subtotal - discountAmount;

    // Update styling for shipping labels
    const shippingRadios = document.querySelectorAll('input[name="shipping"]');
    let shippingCost = 0;
    
    shippingRadios.forEach(radio => {
        const label = radio.closest('label');
        if (radio.checked) {
            shippingCost = parseInt(radio.value);
            label.classList.remove('border-slate-200');
            label.classList.add('border-purple-200', 'bg-purple-50');
        } else {
            label.classList.remove('border-purple-200', 'bg-purple-50');
            label.classList.add('border-slate-200');
        }
    });

    const finalTotal = discountedSubtotal + shippingCost;

    document.getElementById('checkout-subtotal').textContent = 'Rp' + subtotal.toLocaleString('id-ID');
    
    const discountRow = document.getElementById('checkout-discount-row');
    const badge = document.getElementById('checkout-promo-badge');
    
    if (promoDiscount > 0) {
        discountRow.classList.remove('hidden');
        discountRow.classList.add('flex');
        document.getElementById('checkout-discount').textContent = '-Rp' + discountAmount.toLocaleString('id-ID');
        
        const code = document.getElementById('promo-code-input').value;
        document.getElementById('checkout-discount-label').textContent = `Diskon (${promoDiscount * 100}%)`;
        
        if (badge) {
            badge.classList.remove('hidden');
            document.getElementById('checkout-promo-badge-text').textContent = `${code.toUpperCase()} diterapkan`;
        }
    } else {
        discountRow.classList.add('hidden');
        discountRow.classList.remove('flex');
        if (badge) badge.classList.add('hidden');
    }

    document.getElementById('checkout-total-belanja').textContent = 'Rp' + discountedSubtotal.toLocaleString('id-ID');
    document.getElementById('checkout-shipping').textContent = 'Rp' + shippingCost.toLocaleString('id-ID');
    document.getElementById('checkout-final-total').textContent = 'Rp' + finalTotal.toLocaleString('id-ID');
}

function updateCart() {
    const badge = document.getElementById('cart-count');
    if (badge) badge.textContent = cartCount;
    
    const subtitle = document.getElementById('cart-subtitle');
    if (subtitle) subtitle.textContent = `${cartCount} buku untuk cerita barumu`;
    
    const cartList = document.getElementById('cart-list');
    if (!cartList) return;
    
    cartList.innerHTML = '';
    let subtotal = 0;
    
    if (cartItems.length === 0) {
        cartList.innerHTML = '<li class="text-center text-slate-400 py-8 text-sm">Keranjang masih kosong</li>';
    } else {
        cartItems.forEach((item, index) => {
            const qty = item.cart_quantity || 1;
            const price = parseInt(item.price.replace(/\D/g, ''));
            subtotal += price * qty;

            const li = document.createElement('li');
            li.className = 'flex items-start justify-between border-b border-slate-100 pb-4 pt-2 last:border-0 last:pb-0';
            li.innerHTML = `
            <div class="flex gap-4">
                <img src="${item.cover}" alt="${item.title}" class="w-14 h-20 object-cover rounded shadow-sm">
                <div class="flex flex-col">
                    <p class="font-bold text-slate-900 text-sm mb-0.5 line-clamp-1">${item.title}</p>
                    <p class="text-[11px] text-slate-500 mb-1">${item.author || '-'}</p>
                    <p class="text-[11px] text-slate-400 mb-1">x${qty}</p>
                    <p class="text-sm font-bold text-slate-900">${item.price}</p>
                </div>
            </div>
            <button onclick="removeFromCart(${item.id}, ${index})" class="text-red-400 hover:text-red-600 font-bold p-1 hover:bg-red-50 rounded smooth-transition flex-shrink-0">&times;</button>
            `;
            cartList.appendChild(li);
        });
    }
    
    const discountAmount = subtotal * promoDiscount;
    const finalTotal = subtotal - discountAmount;
    
    const subtotalEl = document.getElementById('cart-subtotal');
    const discountRow = document.getElementById('discount-row');
    const discountAmountEl = document.getElementById('cart-discount-amount');
    const discountLabel = document.getElementById('cart-discount-label');
    const totalEl = document.getElementById('cart-total');
    
    if(subtotalEl) subtotalEl.textContent = 'Rp' + subtotal.toLocaleString('id-ID');
    
    if(discountRow) {
        if(promoDiscount > 0) {
            discountRow.classList.remove('hidden');
            discountRow.classList.add('flex');
            discountAmountEl.textContent = '-Rp' + discountAmount.toLocaleString('id-ID');
            if(discountLabel) {
                const code = document.getElementById('promo-code-input').value;
                discountLabel.textContent = `Diskon ${code.toUpperCase()} (${promoDiscount * 100}%)`;
            }
        } else {
            discountRow.classList.add('hidden');
            discountRow.classList.remove('flex');
        }
    }
    
    if(totalEl) totalEl.textContent = 'Rp' + finalTotal.toLocaleString('id-ID');
}

function renderBooks(books) {
    const bookGrid = document.getElementById('book-grid');
    bookGrid.innerHTML = '';

    books.forEach(book => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100 overflow-hidden smooth-transition cursor-pointer group relative';
        
        bookCard.innerHTML = `
            <div class="cursor-pointer book-detail-trigger flex flex-col h-full">
                <!-- Cover Image & Floating Wishlist -->
                <div class="aspect-[3/4] relative overflow-hidden bg-slate-100">
                    <img src="${book.cover}" alt="${book.title}" class="w-full h-full object-cover smooth-transition group-hover:scale-105"
                        onerror="this.src=''; this.alt='Cover tidak tersedia'; this.style.display='none';">
                    
                    <button class="wishlist-btn absolute bottom-2 right-2 md:bottom-auto md:top-3 md:right-3 bg-white/90 backdrop-blur-sm p-1.5 md:p-2 rounded-full shadow-sm text-sm md:text-lg smooth-transition hover:scale-110 z-10" title="Tambah ke Wishlist">
                        ${userWishlist.includes(book.id) ? '❤️' : '🤍'}
                    </button>
                </div>
                
                <!-- Card Content -->
                <div class="p-3 md:p-5 flex flex-col flex-1">
                    <h4 class="font-bold text-sm md:text-lg text-slate-800 mb-1 line-clamp-1 group-hover:text-purple-600 smooth-transition">${book.title}</h4>
                    <p class="text-slate-500 text-xs md:text-sm mb-2 md:mb-3 truncate">${book.author}</p>
                    
                    <div class="flex items-center mb-3 md:mb-4">
                        <span class="text-yellow-400 text-xs md:text-sm mr-1">⭐</span>
                        <span class="text-xs md:text-sm font-semibold text-slate-800 mr-1">${book.rating}</span>
                        <span class="text-[10px] md:text-xs text-slate-400 hidden sm:inline-block">(${book.reviews.length} ulasan)</span>
                    </div>
                    
                    <div class="flex items-center justify-between mt-auto">
                        <span class="text-sm md:text-xl font-bold text-[#d946ef]">${book.price}</span>
                        <button class="buy-btn bg-[#10b981] hover:bg-[#059669] text-white px-3 md:px-4 py-1 md:py-1.5 rounded-full font-semibold text-xs md:text-sm smooth-transition flex items-center space-x-1 shadow-sm hover:shadow-md z-10">
                            <span class="hidden md:inline">+</span>
                            <span>Beli</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Event listener tombol Wishlist
        bookCard.querySelector('.wishlist-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleWishlist(book.id);
        });

        // Event listener klik gambar/judul untuk buka detail
        bookCard.querySelector('.book-detail-trigger').addEventListener('click', function() {
            openBookDetail(book.id);
        });

        // Event listener tombol Beli 
        const buyBtn = bookCard.querySelector('.buy-btn');
        if (buyBtn) {
            buyBtn.addEventListener('click', async function(e) {
                e.stopPropagation();
                await addToCart(book);
            });
        }

        // Event listener tombol Lihat Ulasan
        const reviewBtn = bookCard.querySelector('.review-btn');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                openReviewModal(book.id);
            });
        }

        bookGrid.appendChild(bookCard);
    });
}

// FUNGSI PENCARIAN & FILTER SERVER-SIDE
let currentSearch = '';

function searchBooks(query) {
    currentSearch = query;
    triggerServerFetch();
}

function filterBooks(genre) {
    currentFilter = genre;
    
    // Update tampilan tombol filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-genre') === 'semua') {
            btn.className = 'filter-btn px-4 py-2 rounded-lg font-medium smooth-transition bg-gradient-to-r from-blue-100 to-purple-100 text-purple-700 hover:from-blue-200 hover:to-purple-200';
        } else if (btn.getAttribute('data-genre') === 'romance') {
            btn.className = 'filter-btn px-4 py-2 rounded-lg font-medium smooth-transition bg-gradient-to-r from-blue-100 to-purple-100 text-purple-700 hover:from-blue-200 hover:to-purple-200';
        } else if (btn.getAttribute('data-genre') === 'thriller') {
            btn.className = 'filter-btn px-4 py-2 rounded-lg font-medium smooth-transition bg-gradient-to-r from-green-100 to-teal-100 text-teal-700 hover:from-green-200 hover:to-teal-200';
        } else if (btn.getAttribute('data-genre') === 'fantasy') {
            btn.className = 'filter-btn px-4 py-2 rounded-lg font-medium smooth-transition bg-gradient-to-r from-pink-100 to-rose-100 text-rose-700 hover:from-pink-200 hover:to-rose-200';
        } else if (btn.getAttribute('data-genre') === 'drama') {
            btn.className = 'filter-btn px-4 py-2 rounded-lg font-medium smooth-transition bg-gradient-to-r from-orange-100 to-yellow-100 text-orange-700 hover:from-orange-200 hover:to-yellow-200';
        }
    });
    
    const activeBtn = document.querySelector(`[data-genre="${genre}"]`);
    if(activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.className = 'filter-btn active px-4 py-2 rounded-lg font-medium smooth-transition bg-gradient-to-r from-purple-500 to-pink-500 text-white';
    }
    
    triggerServerFetch();
}

function triggerServerFetch() {
    let queryParams = [];
    if (currentSearch.trim() !== '') {
        queryParams.push(`search=${encodeURIComponent(currentSearch)}`);
    }
    if (currentFilter !== 'semua') {
        queryParams.push(`genre=${encodeURIComponent(currentFilter)}`);
    }
    
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    fetchBooks(queryString);
}

// FUNGSI TOGGLE WISHLIST
async function toggleWishlist(bookId) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Silakan login terlebih dahulu untuk menyimpan ke Wishlist.');
        openAuthModal();
        return;
    }

    try {
        const res = await fetch(`${API_URL}/wishlist/toggle`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ book_id: bookId })
        });
        const data = await res.json();
        
        if (data.action === 'added') {
            userWishlist.push(bookId);
        } else if (data.action === 'removed') {
            userWishlist = userWishlist.filter(id => id !== bookId);
        }
        renderBooks(currentBooks); // Re-render untuk update ikon hati
    } catch (err) {
        console.error('Error toggling wishlist', err);
    }
}

// FUNGSI MODAL DETAIL BUKU
function openBookDetail(bookId) {
    const book = booksData.find(b => b.id === bookId);
    if (!book) return;

    document.getElementById('detail-cover').src = book.cover;
    document.getElementById('detail-genre').textContent = book.genre;
    document.getElementById('detail-rating').textContent = book.rating || 0;
    
    // New fields for the updated mockup
    if(document.getElementById('detail-reviews-count')) {
        document.getElementById('detail-reviews-count').textContent = book.reviews ? book.reviews.length : 0;
    }
    if(document.getElementById('detail-stock')) {
        document.getElementById('detail-stock').textContent = book.stock !== undefined ? book.stock : 42;
    }
    
    document.getElementById('detail-title').textContent = book.title;
    document.getElementById('detail-author').textContent = book.author;
    document.getElementById('detail-price').textContent = book.price;
    
    // Fallback info if DB doesn't have it
    document.getElementById('detail-synopsis').textContent = book.synopsis || "Sinopsis tidak tersedia untuk buku ini.";
    document.getElementById('detail-publisher').textContent = book.publisher || "-";
    document.getElementById('detail-pages').textContent = book.pages || "-";
    document.getElementById('detail-isbn').textContent = book.isbn || "-";
    
    // Update button states
    const wishlistBtn = document.getElementById('detail-wishlist-btn');
    wishlistBtn.textContent = userWishlist.includes(book.id) ? '❤️' : '🤍';
    wishlistBtn.onclick = () => {
        toggleWishlist(book.id);
        wishlistBtn.textContent = userWishlist.includes(book.id) ? '❤️' : '🤍';
    };
    
    document.getElementById('detail-buy-btn').onclick = async () => {
        await addToCart(book);
    };

    document.getElementById('book-detail-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeBookDetail() {
    document.getElementById('book-detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

// Auth State Management
function updateNavbarState() {
    const user = JSON.parse(localStorage.getItem('user'));
    const navAuthBtn = document.getElementById('nav-auth-btn');
    if (navAuthBtn) {
        if (user) {
            navAuthBtn.textContent = "Profil Saya";
            navAuthBtn.onclick = openProfileModal;
            navAuthBtn.className = "hidden md:block bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-5 py-2 rounded-xl font-semibold smooth-transition shadow-lg transform hover:scale-105";
        } else {
            navAuthBtn.textContent = "Masuk";
            navAuthBtn.onclick = openAuthModal;
            navAuthBtn.className = "hidden md:block bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white px-5 py-2 rounded-xl font-semibold smooth-transition shadow-lg transform hover:scale-105";
        }
    }
}

// EVENT LISTENERS - Menangani interaksi pengguna
document.addEventListener('DOMContentLoaded', function() {
    updateNavbarState();
    // Ambil buku dari Backend
    fetchBooks();
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const genre = this.getAttribute('data-genre');
            filterBooks(genre);
        });
    });

    // Toggle keranjang saat ikon 🛒 diklik
    document.getElementById('cart-button').addEventListener('click', function() {
        const cartSection = document.getElementById('keranjang');
        cartSection.classList.toggle('hidden');
        updateCart();
    });

    // Search functionality
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', function() {
        searchBooks(this.value);
    });
    
    // CTA Button scroll to catalog
    document.getElementById('cta-button').addEventListener('click', function() {
        document.getElementById('katalog').scrollIntoView({ 
            behavior: 'smooth' 
        });
    });

    // Checkout functionality
    const checkoutBtn = document.getElementById('checkout-btn');
    if(checkoutBtn) {
        checkoutBtn.addEventListener('click', openCheckoutModal);
    }
    
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const shippingRadio = document.querySelector('input[name="shipping"]:checked');
            const paymentSelect = document.getElementById('checkout-payment').value;
            const address = document.getElementById('checkout-address').value;
            const totalText = document.getElementById('checkout-final-total').textContent;
            
            const payload = {
                shipping_method: shippingRadio.parentElement.querySelector('span.font-bold').textContent,
                shipping_cost: shippingRadio.value,
                payment_method: paymentSelect,
                address: address,
                items: cartItems,
                total_amount: totalText
            };
            
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/checkout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if(data.success) {
                    if (data.snap_token) {
                        window.snap.pay(data.snap_token, {
                            onSuccess: function(result){
                                finalizeCheckoutSuccess();
                            },
                            onPending: function(result){
                                finalizeCheckoutSuccess();
                            },
                            onError: function(result){
                                alert('Pembayaran gagal!');
                            },
                            onClose: function(){
                                alert('Anda menutup popup sebelum menyelesaikan pembayaran.');
                                finalizeCheckoutSuccess();
                            }
                        });
                    } else {
                        alert(data.message);
                        finalizeCheckoutSuccess();
                    }
                } else {
                    alert('Gagal: ' + data.message);
                }
            } catch (err) {
                alert('Terjadi kesalahan koneksi saat memproses Midtrans.');
            }
        });
    }
    
    function finalizeCheckoutSuccess() {
        closeCheckoutModal();
        document.getElementById('keranjang').classList.add('hidden');
        
        cartItems = [];
        cartCount = 0;
        promoDiscount = 0;
        updateCart();
        
        openProfileModal(); // Buka profil agar user bisa lihat pesanannya
    }
    
    // Review form submission
    const reviewForm = document.getElementById('review-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const bookId = parseInt(document.getElementById('review-book-id').value);
            const name = document.getElementById('review-name').value;
            const rating = parseInt(document.getElementById('review-rating').value);
            const text = document.getElementById('review-text').value;
            
            const book = booksData.find(b => b.id === bookId);
            if (book) {
                book.reviews.push({ name, rating, text });
                
                // Update average rating
                const totalRating = book.reviews.reduce((sum, rev) => sum + rev.rating, 0);
                book.rating = (totalRating / book.reviews.length).toFixed(1);
                
                // Refresh modal and grid
                openReviewModal(bookId);
                renderBooks(currentBooks);
                
                // Clear form
                reviewForm.reset();
            }
        });
    }
});

// FUNGSI MODAL REVIEW
function openReviewModal(bookId) {
    const book = booksData.find(b => b.id === bookId);
    if (!book) return;
    
    document.getElementById('review-book-id').value = bookId;
    document.getElementById('modal-book-title').textContent = "Ulasan: " + book.title;
    
    const reviewsList = document.getElementById('reviews-list');
    reviewsList.innerHTML = '';
    
    if (book.reviews && book.reviews.length > 0) {
        book.reviews.forEach(review => {
            const stars = '⭐'.repeat(review.rating);
            reviewsList.innerHTML += `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-slate-800">${review.name}</span>
                        <span>${stars}</span>
                    </div>
                    <p class="text-slate-600">${review.text}</p>
                </div>
            `;
        });
    } else {
        reviewsList.innerHTML = '<p class="text-center text-slate-500 py-4">Belum ada ulasan untuk buku ini.</p>';
    }
    
    document.getElementById('review-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // prevent scrolling behind modal
}

function closeReviewModal() {
    document.getElementById('review-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

// FUNGSI MODAL AUTENTIKASI
function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');
    
    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        
        loginTab.className = 'flex-1 pb-3 text-purple-600 border-b-2 border-purple-600';
        registerTab.className = 'flex-1 pb-3 text-slate-400 hover:text-slate-600 border-b-2 border-transparent smooth-transition';
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        
        registerTab.className = 'flex-1 pb-3 text-purple-600 border-b-2 border-purple-600';
        loginTab.className = 'flex-1 pb-3 text-slate-400 hover:text-slate-600 border-b-2 border-transparent smooth-transition';
    }
}

// FUNGSI MODAL PROFILE & ORDERS
async function openProfileModal() {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');
    if (!user || !token) return;

    // Update Profile sidebar text
    const firstName = user.name.split(' ')[0];
    document.getElementById('profile-name-first').textContent = firstName;
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email || 'user@email.com';
    document.getElementById('profile-role').textContent = 'Role: ' + (user.role.charAt(0).toUpperCase() + user.role.slice(1));
    
    if (user.role === 'admin') {
        document.getElementById('profile-admin-btn').classList.remove('hidden');
    } else {
        document.getElementById('profile-admin-btn').classList.add('hidden');
    }
    
    document.getElementById('profile-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    const ordersList = document.getElementById('orders-list');
    const ordersCountLabel = document.getElementById('orders-count-label');
    
    try {
        const res = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const orders = await res.json();
        
        if (orders.length > 0) {
            ordersCountLabel.textContent = `${orders.length} pesanan`;
            ordersList.innerHTML = orders.map(order => {
                const date = new Date(order.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'});
                const isPending = order.status.toLowerCase() === 'pending' || order.status.toLowerCase() === 'menunggu';
                const isProcess = order.status.toLowerCase() === 'diproses';
                const isSent = order.status.toLowerCase() === 'dikirim';
                
                let badgeClass = 'bg-teal-100 text-teal-700';
                let displayStatus = 'Selesai';
                let actionText = 'Lihat Detail &rarr;';
                let noteText = 'Terima kasih sudah membawa cerita ini pulang.';
                let coversHTML = `<img src="https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=150" class="w-12 h-16 object-cover rounded shadow-sm">`;
                let descHTML = `<p class="font-bold text-slate-800 text-sm mb-1">Buku Pilihan</p><p class="text-[11px] text-slate-500">1 buku • Masing-masing x1<br>Reguler Rp15.000</p>`;

                if (isPending) {
                    badgeClass = 'bg-[#fef08a] text-[#854d0e]';
                    displayStatus = 'Menunggu';
                    actionText = 'Lanjut Bayar &rarr;';
                    noteText = 'Selesaikan pembayaran sebelum besok, 15.00.';
                    coversHTML = `
                        <div class="flex -space-x-4">
                            <img src="https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=150" class="w-12 h-16 object-cover rounded shadow-sm border border-white z-10">
                            <img src="https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=150" class="w-12 h-16 object-cover rounded shadow-sm border border-white z-0">
                        </div>`;
                    descHTML = `<p class="font-bold text-slate-800 text-sm mb-1">Pesanan Buku Bundling</p><p class="text-[11px] text-slate-500">2 buku • Masing-masing x1<br>Promo CERITAKITA20 • Reguler Rp15.000</p>`;
                } else if (isProcess) {
                    badgeClass = 'bg-blue-100 text-blue-700';
                    displayStatus = 'Diproses';
                    noteText = 'Bukumu sedang disiapkan untuk dikirim.';
                } else if (isSent) {
                    badgeClass = 'bg-emerald-100 text-emerald-700';
                    displayStatus = 'Dikirim';
                    actionText = 'Lacak Pesanan &rarr;';
                    noteText = 'Dalam perjalanan ke alamatmu.';
                }
                
                return `
                <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col hover:shadow-md smooth-transition">
                    <div class="flex justify-between items-start mb-6">
                        <div>
                            <span class="font-bold text-slate-900 mr-3">#CK-${order.id + 1000}</span>
                            <span class="text-xs text-slate-400 font-medium">${date}</span>
                        </div>
                        <span class="px-3 py-1 text-[10px] font-bold rounded-full ${badgeClass}">${displayStatus}</span>
                    </div>
                    
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-4">
                            ${coversHTML}
                            <div>
                                ${descHTML}
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] text-slate-400 mb-0.5">Total pembayaran</p>
                            <p class="text-lg font-bold text-slate-900">${order.total_amount || 'Rp0'}</p>
                        </div>
                    </div>
                    
                    <div class="w-full h-px bg-slate-100 mb-4"></div>
                    
                    <div class="flex justify-between items-center">
                        <p class="text-[11px] font-medium ${isPending ? 'text-yellow-600' : 'text-slate-500'}">${noteText}</p>
                        <button class="text-[11px] font-bold text-purple-600 hover:text-purple-700">${actionText}</button>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            ordersCountLabel.textContent = '0 pesanan';
            ordersList.innerHTML = '<p class="text-slate-500 text-center py-4">Belum ada riwayat pembelian.</p>';
        }
    } catch (err) {
        ordersList.innerHTML = '<p class="text-red-500 text-center py-4">Gagal memuat pesanan.</p>';
    }
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    userWishlist = [];
    updateNavbarState();
    fetchBooks(); // Re-fetch to clear wishlist hearts
    closeProfileModal();
    alert('Anda berhasil keluar akun.');
}

async function handleAuth(event, type) {
    event.preventDefault();
    const form = event.target;
    
    if (type === 'login') {
        const email = form.querySelector('input[type="email"]').value;
        const password = form.querySelector('input[type="password"]').value;
        
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                updateNavbarState();
                fetchBooks(); // Re-fetch untuk memperbarui icon wishlist
                alert(`Login berhasil! Selamat datang ${data.user.name} (${data.user.role})`);
                closeAuthModal();
            } else {
                alert('Login Gagal: ' + data.message);
            }
        } catch (err) {
            alert('Kesalahan koneksi ke server Backend.');
        }
    } else {
        const name = form.querySelector('input[type="text"]').value;
        const email = form.querySelector('input[type="email"]').value;
        const password = form.querySelector('input[type="password"]').value;
        
        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();
            
            if (data.success) {
                alert(data.message);
                switchAuthTab('login');
                form.reset();
            } else {
                alert('Pendaftaran Gagal: ' + data.message);
            }
        } catch (err) {
            alert('Kesalahan koneksi ke server Backend.');
        }
    }
}

// FUNGSI ADMIN DASHBOARD
async function openAdminModal() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    closeProfileModal(); // Tutup profil jika terbuka

    document.getElementById('admin-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Default tab stats
    switchAdminTab('stats');
}

function closeAdminModal() {
    document.getElementById('admin-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function switchAdminTab(tabId) {
    ['stats', 'books', 'orders'].forEach(id => {
        document.getElementById(`admin-content-${id}`).classList.add('hidden');
        const btn = document.getElementById(`admin-tab-${id}`);
        // Reset to inactive state
        btn.classList.remove('bg-gradient-to-r', 'from-purple-500', 'to-pink-500', 'text-white');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
    });

    document.getElementById(`admin-content-${tabId}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`admin-tab-${tabId}`);
    // Set to active state
    activeBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
    activeBtn.classList.add('bg-gradient-to-r', 'from-purple-500', 'to-pink-500', 'text-white');

    if (tabId === 'stats') loadAdminStats();
    if (tabId === 'books') loadAdminBooks();
    if (tabId === 'orders') loadAdminOrders();
}

async function loadAdminStats() {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` }});
        const data = await res.json();
        document.getElementById('admin-stat-revenue').textContent = 'Rp' + (data.revenue || 0).toLocaleString('id-ID');
        document.getElementById('admin-stat-orders').textContent = data.orders || 0;
        document.getElementById('admin-stat-books').textContent = data.books || 0;
        document.getElementById('admin-stat-users').textContent = data.users || 0;
    } catch(e) { console.error(e); }
}

async function loadAdminBooks() {
    filterAdminBooks(); // initial render
}

function filterAdminBooks() {
    const searchVal = (document.getElementById('admin-books-search')?.value || '').toLowerCase();
    const genreVal = document.getElementById('admin-books-genre')?.value || 'Semua genre';
    
    let filtered = booksData.filter(b => {
        if (genreVal !== 'Semua genre' && (b.genre || 'Romance') !== genreVal) return false;
        if (searchVal) {
            const s = searchVal;
            if (!b.title.toLowerCase().includes(s) && !b.author.toLowerCase().includes(s) && !(`bk-00${b.id}`).includes(s)) return false;
        }
        return true;
    });
    
    renderAdminBooks(filtered);
}

function renderAdminBooks(data) {
    const tbody = document.getElementById('admin-books-tbody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-slate-500 text-sm">Buku tidak ditemukan.</td></tr>';
        return;
    }

    const generateStock = (id) => {
        const stocks = { 1: 42, 2: 35, 3: 28, 4: 51, 5: 19, 6: 32, 7: 24, 8: 38 };
        return stocks[id] || Math.floor(Math.random() * 50) + 10;
    };

    tbody.innerHTML = data.map(book => {
        const stock = generateStock(book.id);
        const isLowStock = stock < 20;
        const stockColor = isLowStock ? 'text-yellow-600 font-bold' : 'text-slate-600';
        
        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 smooth-transition">
            <td class="p-4 pl-6 text-slate-400 font-medium">BK-00${book.id}</td>
            <td class="p-4">
                <div class="flex items-center space-x-3">
                    <img src="${book.cover}" class="w-10 h-14 object-cover rounded shadow-sm">
                    <div>
                        <p class="font-bold text-slate-900">${book.title}</p>
                        <p class="text-[11px] text-slate-500">${book.author}</p>
                    </div>
                </div>
            </td>
            <td class="p-4">
                <span class="bg-purple-50 text-purple-600 px-3 py-1 rounded-full text-[10px] font-bold">${book.genre || 'Romance'}</span>
            </td>
            <td class="p-4 font-bold text-slate-900">${book.price.startsWith('Rp') ? book.price : 'Rp' + book.price}</td>
            <td class="p-4 ${stockColor}">${stock} buku</td>
            <td class="p-4">
                <div class="flex items-center space-x-4">
                    <button class="flex items-center space-x-1 text-purple-600 hover:text-purple-700 text-xs font-bold smooth-transition">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        <span>Edit</span>
                    </button>
                    <button class="flex items-center space-x-1 text-red-500 hover:text-red-600 text-xs font-bold smooth-transition" onclick="deleteBook(${book.id})">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        <span>Hapus</span>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}


let allAdminOrders = [];
let currentOrderFilter = 'Semua';

async function loadAdminOrders() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('admin-orders-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Memuat...</td></tr>';
    try {
        const res = await fetch(`${API_URL}/admin/orders`, { headers: { 'Authorization': `Bearer ${token}` }});
        allAdminOrders = await res.json();
        
        // Count statuses
        let counts = { 'Semua': allAdminOrders.length, 'Menunggu': 0, 'Diproses': 0, 'Dikirim': 0, 'Selesai': 0 };
        allAdminOrders.forEach(o => {
            let s = o.status;
            if (s === 'Menunggu Pembayaran' || s === 'Pending') s = 'Menunggu';
            if (counts[s] !== undefined) counts[s]++;
        });
        
        for (let k in counts) {
            const cEl = document.getElementById(`count-${k}`);
            if (cEl) cEl.textContent = counts[k];
        }

        renderAdminOrders();

    } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-500">Gagal memuat data</td></tr>'; }
}

function setOrderFilter(status) {
    currentOrderFilter = status;
    
    // Update button styles
    const filters = ['Semua', 'Menunggu', 'Diproses', 'Dikirim', 'Selesai'];
    filters.forEach(f => {
        const btn = document.getElementById(`filter-btn-${f}`);
        if (!btn) return;
        if (f === status) {
            btn.className = 'px-5 py-2.5 rounded-full border border-purple-500 text-purple-600 font-bold text-sm bg-purple-50 smooth-transition';
        } else {
            btn.className = 'px-5 py-2.5 rounded-full border border-slate-200 text-slate-600 font-bold text-sm bg-white hover:bg-slate-50 smooth-transition';
        }
    });

    renderAdminOrders();
}

function renderAdminOrders() {
    const tbody = document.getElementById('admin-orders-tbody');
    const searchVal = (document.getElementById('admin-orders-search')?.value || '').toLowerCase();
    
    let filteredOrders = allAdminOrders.filter(order => {
        let s = order.status;
        if (s === 'Menunggu Pembayaran' || s === 'Pending') s = 'Menunggu';
        
        if (currentOrderFilter !== 'Semua' && s !== currentOrderFilter) return false;
        
        if (searchVal) {
            const term = searchVal;
            const matchName = order.user_name.toLowerCase().includes(term);
            const matchId = (`#ck-${order.id+1000}`).includes(term);
            if (!matchName && !matchId) return false;
        }
        
        return true;
    });

    if (filteredOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-500 text-sm">Tidak ada pesanan yang sesuai.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredOrders.map((order, idx) => {
        const date = new Date(order.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'});
        
        // Dummy data for visual completion based on mockup
        const mockEmail = order.user_name.toLowerCase().replace(' ', '.') + '@email.com';
        const mockAddress = 'Bandung, Jawa Barat';
        let mockBookDesc = 'Di Antara Dua Senja &times; 1<br>Rumah untuk Pulang &times; 1';
        let promoHtml = '<p class="text-[10px] text-emerald-500 font-bold mt-0.5">CERITAKITA20 &bull; -Rp36.800</p>';
        
        if (idx % 2 !== 0) {
            mockBookDesc = 'Kota di Balik Kabut &times; 1';
            promoHtml = '';
        }

        // Status Styling
        let statusClasses = '';
        let statusBorderClasses = '';
        let statusCaretClasses = '';
        let currentStatus = order.status;

        // Normalization
        if (currentStatus === 'Menunggu Pembayaran' || currentStatus === 'Pending') currentStatus = 'Menunggu';

        if (currentStatus === 'Menunggu') {
            statusClasses = 'bg-[#fef08a] text-[#854d0e]';
            statusBorderClasses = 'border-[#fef08a] hover:border-yellow-400';
            statusCaretClasses = 'text-[#854d0e]';
        } else if (currentStatus === 'Diproses') {
            statusClasses = 'bg-blue-50 text-blue-700';
            statusBorderClasses = 'border-blue-100 hover:border-purple-300';
            statusCaretClasses = 'text-blue-700';
        } else if (currentStatus === 'Dikirim') {
            statusClasses = 'bg-emerald-50 text-emerald-700';
            statusBorderClasses = 'border-emerald-100 hover:border-emerald-300';
            statusCaretClasses = 'text-emerald-700';
        } else if (currentStatus === 'Selesai') {
            statusClasses = 'bg-purple-50 text-purple-700';
            statusBorderClasses = 'border-purple-100 hover:border-purple-300';
            statusCaretClasses = 'text-purple-700';
        } else {
            statusClasses = 'bg-slate-100 text-slate-700';
            statusBorderClasses = 'border-slate-200';
            statusCaretClasses = 'text-slate-500';
        }

        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50 smooth-transition">
            <td class="p-4 pl-6 align-top">
                <p class="font-bold text-slate-900">#CK-${order.id + 1000}</p>
                <p class="text-[11px] text-slate-400 mt-1">${date}</p>
            </td>
            <td class="p-4 align-top">
                <p class="font-bold text-slate-900">${order.user_name}</p>
                <p class="text-[11px] text-slate-500 mt-1">${mockEmail}</p>
                <p class="text-[11px] text-slate-500">${mockAddress}</p>
            </td>
            <td class="p-4 align-top">
                <p class="text-[13px] font-medium text-slate-800 leading-snug">${mockBookDesc}</p>
                <p class="text-[11px] text-slate-400 mt-1">Reguler &bull; Rp15.000</p>
                ${promoHtml}
            </td>
            <td class="p-4 align-top">
                <p class="font-bold text-slate-900">${order.total_amount || '-'}</p>
            </td>
            <td class="p-4 align-top w-40">
                <div class="relative w-full">
                    <select onchange="updateOrderStatus(${order.id}, this.value)" class="w-full appearance-none px-3 py-1.5 rounded-full text-[11px] font-bold outline-none cursor-pointer smooth-transition ${statusClasses} border ${statusBorderClasses} focus:ring-2 focus:ring-purple-200 focus:bg-white">
                        <option value="Menunggu" ${currentStatus === 'Menunggu' ? 'selected' : ''}>Menunggu</option>
                        <option value="Diproses" ${currentStatus === 'Diproses' ? 'selected' : ''}>Diproses</option>
                        <option value="Dikirim" ${currentStatus === 'Dikirim' ? 'selected' : ''}>Dikirim</option>
                        <option value="Selesai" ${currentStatus === 'Selesai' ? 'selected' : ''}>Selesai</option>
                    </select>
                    <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <svg class="w-3 h-3 ${statusCaretClasses}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
                <button class="mt-2 text-[10px] text-purple-600 hover:text-purple-700 font-bold px-1 smooth-transition" onclick="alert('Fitur Detail Pesanan sedang dirancang.')">Lihat detail &rarr;</button>
            </td>
        </tr>
        `;
    }).join('');
}

async function updateOrderStatus(orderId, status) {
    if(!status) return;
    const token = localStorage.getItem('token');
    try {
        await fetch(`${API_URL}/admin/orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status })
        });
        loadAdminOrders();
    } catch(e) { console.error(e); }
}

// ELEMENT SDK CONFIGURATION - Konfigurasi untuk editing
const defaultConfig = {
    store_name: "Cerita Kita",
    hero_title: "Temukan Cerita Terbaikmu",
    hero_subtitle: "Koleksi novel terlengkap untuk generasi digital. Dari romance hingga thriller, semua ada di sini.",
    cta_button: "Jelajahi Koleksi"
};

async function onConfigChange(config) {
    // Update store name
    const storeName = config.store_name || defaultConfig.store_name;
    document.getElementById('store-name').textContent = storeName;
    
    // Update hero section
    const heroTitle = config.hero_title || defaultConfig.hero_title;
    document.getElementById('hero-title').textContent = heroTitle;
    
    const heroSubtitle = config.hero_subtitle || defaultConfig.hero_subtitle;
    document.getElementById('hero-subtitle').textContent = heroSubtitle;
    
    const ctaButton = config.cta_button || defaultConfig.cta_button;
    document.getElementById('cta-button').textContent = ctaButton;
}

function mapToCapabilities(config) {
    return {
        recolorables: [],
        borderables: [],
        fontEditable: undefined,
        fontSizeable: undefined
    };
}

function mapToEditPanelValues(config) {
    return new Map([
        ["store_name", config.store_name || defaultConfig.store_name],
        ["hero_title", config.hero_title || defaultConfig.hero_title],
        ["hero_subtitle", config.hero_subtitle || defaultConfig.hero_subtitle],
        ["cta_button", config.cta_button || defaultConfig.cta_button]
    ]);
}

// Initialize Element SDK
if (window.elementSdk) {
    window.elementSdk.init({
        defaultConfig,
        onConfigChange,
        mapToCapabilities,
        mapToEditPanelValues
    });
}

// Tentukan waktu berakhir promo 
const promoEnd = new Date();
promoEnd.setHours(23, 59, 59, 999);

function updatePromoTimer() {
    const now = new Date().getTime();
    const distance = promoEnd - now;

    if (distance < 0) {
    document.getElementById('promo-timer').textContent = "Promo berakhir!";
    clearInterval(promoInterval);
    return;
    }

    const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((distance / (1000 * 60)) % 60);
    const seconds = Math.floor((distance / 1000) % 60);

    document.getElementById('promo-timer').textContent =
    `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
}

// Update setiap detik
const promoInterval = setInterval(updatePromoTimer, 1000);
updatePromoTimer();
