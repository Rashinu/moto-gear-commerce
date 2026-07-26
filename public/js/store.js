// Alanya Racing Motors - vitrin mantığı (API üzerinden veri çeker)

let PRODUCTS = [];
let CATEGORIES_RAW = [];
let SETTINGS = {};
let WHATSAPP_NUMBER = "905550000000";

let state = { category: "Tümü", search: "", sort: "default" };
let cart = JSON.parse(localStorage.getItem("arm_cart") || "[]");

async function loadStorefront() {
  try {
    const res = await fetch("/api/storefront");
    if (!res.ok) throw new Error("Sunucudan veri alınamadı");
    const data = await res.json();
    SETTINGS = data.settings || {};
    CATEGORIES_RAW = data.categories || [];
    PRODUCTS = data.products || [];
    WHATSAPP_NUMBER = SETTINGS.whatsapp || WHATSAPP_NUMBER;

    applySettingsToPage();
    renderAll();
    renderCart();
    document.getElementById("loadingMsg").style.display = "none";
  } catch (err) {
    document.getElementById("loadingMsg").textContent =
      "Ürünler yüklenemedi. Sunucunun çalıştığından emin olun (npm start).";
    console.error(err);
  }
}

function applySettingsToPage() {
  document.title = `${SETTINGS.siteName || "Alanya Racing Motors"} | Motosiklet Aksesuar Mağazası`;
  document.getElementById("heroTitle").childNodes[0].textContent = (SETTINGS.heroTitle || "") + " ";
  document.getElementById("heroHighlight").textContent = SETTINGS.heroHighlight || "";
  document.getElementById("heroSubtitle").textContent = SETTINGS.heroSubtitle || "";
  document.getElementById("headerPhoneText").textContent = SETTINGS.phone || "";
  document.getElementById("headerPhone").href = `tel:${(SETTINGS.phone || "").replace(/\s/g, "")}`;
  document.getElementById("footerPhone").textContent = `📞 ${SETTINGS.phone || ""}`;
  document.getElementById("footerEmail").textContent = `✉️ ${SETTINGS.email || ""}`;
  document.getElementById("footerAddress").textContent = `📍 ${SETTINGS.address || ""}`;
  document.getElementById("footerCopyName").textContent = SETTINGS.siteName || "Alanya Racing Motors";
  document.getElementById("footerSiteName").textContent = SETTINGS.siteName || "Alanya Racing Motors";

  const hero = document.getElementById("heroSection");
  if (SETTINGS.heroImage) {
    hero.classList.add("has-image");
    hero.style.backgroundImage = `url('${SETTINGS.heroImage}')`;
  } else {
    hero.classList.remove("has-image");
    hero.style.backgroundImage = "";
  }
}

function getCategoryNames() {
  return ["Tümü", ...CATEGORIES_RAW.map(c => c.name)];
}

function renderCategoryUI() {
  const nav = document.getElementById("categoryNav");
  const sidebar = document.getElementById("sidebarCategories");
  nav.innerHTML = "";
  sidebar.innerHTML = "";

  getCategoryNames().forEach(cat => {
    const pill = document.createElement("span");
    pill.className = "cat-pill" + (cat === state.category ? " active" : "");
    pill.textContent = cat;
    pill.onclick = () => { state.category = cat; renderAll(); };
    nav.appendChild(pill);

    const li = document.createElement("li");
    li.className = cat === state.category ? "active" : "";
    li.textContent = cat;
    li.onclick = () => { state.category = cat; renderAll(); };
    sidebar.appendChild(li);
  });
}

function getFilteredProducts() {
  let list = PRODUCTS.filter(p => {
    const matchCat = state.category === "Tümü" || p.category === state.category;
    const q = state.search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (state.sort === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  else list.sort((a, b) => (a.order || 0) - (b.order || 0));
  return list;
}

function renderProducts() {
  const grid = document.getElementById("productGrid");
  const noResults = document.getElementById("noResults");
  const list = getFilteredProducts();

  document.getElementById("resultTitle").textContent = state.category;
  document.getElementById("resultCount").textContent = `${list.length} ürün`;

  grid.innerHTML = "";
  noResults.style.display = list.length === 0 ? "block" : "none";

  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.onclick = (e) => {
      if (e.target.classList.contains("add-btn")) return;
      openProductModal(p.id);
    };

    card.innerHTML = `
      <div class="product-thumb">
        ${p.badge ? `<span class="badge ${p.badge.replace(" ", "")}">${p.badge}</span>` : ""}
        <img src="${p.img}" alt="${p.name}" loading="lazy">
      </div>
      <div class="product-info">
        <span class="product-cat">${p.category}</span>
        <span class="product-name">${p.name}</span>
        <div class="price-row">
          <span class="price-now">${formatPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="price-old">${formatPrice(p.oldPrice)}</span>` : ""}
        </div>
        <button class="add-btn" data-id="${p.id}">Sepete Ekle</button>
      </div>
    `;
    card.querySelector(".add-btn").onclick = (e) => { e.stopPropagation(); addToCart(p.id); };
    grid.appendChild(card);
  });
}

function formatPrice(n) { return Number(n).toLocaleString("tr-TR") + " TL"; }

function renderAll() { renderCategoryUI(); renderProducts(); }

function openProductModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const images = Array.isArray(p.images) && p.images.length ? p.images : [p.img];
  const body = document.getElementById("productModalBody");
  body.innerHTML = `
    <div class="modal-gallery">
      <img src="${images[0]}" alt="${p.name}" id="modalMainImg">
      ${images.length > 1 ? `
        <div class="modal-thumbs">
          ${images.map((img, i) => `<img src="${img}" class="modal-thumb${i === 0 ? " active" : ""}" data-src="${img}" alt="${p.name} ${i + 1}">`).join("")}
        </div>` : ""}
    </div>
    <div>
      <div class="modal-cat">${p.category}</div>
      <h2 class="modal-name">${p.name}</h2>
      <div class="modal-price-row">
        <span class="price-now">${formatPrice(p.price)}</span>
        ${p.oldPrice ? `<span class="price-old">${formatPrice(p.oldPrice)}</span>` : ""}
      </div>
      <div class="modal-stock">${p.stock > 0 ? `✔ Stokta (${p.stock} adet)` : "Stokta yok"}</div>
      <p class="modal-desc">Bu ürün açıklaması admin panelinden düzenlenebilir.</p>
      <button class="btn-primary full-width" id="modalAddBtn">Sepete Ekle</button>
    </div>
  `;
  body.querySelectorAll(".modal-thumb").forEach(thumb => {
    thumb.onclick = () => {
      document.getElementById("modalMainImg").src = thumb.dataset.src;
      body.querySelectorAll(".modal-thumb").forEach(t => t.classList.remove("active"));
      thumb.classList.add("active");
    };
  });
  document.getElementById("modalAddBtn").onclick = () => { addToCart(p.id); closeProductModal(); };
  document.getElementById("productModalOverlay").classList.add("open");
}
function closeProductModal() { document.getElementById("productModalOverlay").classList.remove("open"); }

function addToCart(id) {
  const existing = cart.find(item => item.id === id);
  if (existing) existing.qty += 1; else cart.push({ id, qty: 1 });
  saveCart(); renderCart(); openCart();
}
function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart(); renderCart();
}
function removeFromCart(id) { cart = cart.filter(i => i.id !== id); saveCart(); renderCart(); }
function saveCart() { localStorage.setItem("arm_cart", JSON.stringify(cart)); }

function renderCart() {
  const container = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  const countEl = document.getElementById("cartCount");
  countEl.textContent = cart.reduce((sum, i) => sum + i.qty, 0);

  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-cart">Sepetiniz boş.</div>`;
    totalEl.textContent = formatPrice(0);
    return;
  }
  let total = 0;
  container.innerHTML = cart.map(item => {
    const p = PRODUCTS.find(x => x.id === item.id);
    if (!p) return "";
    const lineTotal = p.price * item.qty;
    total += lineTotal;
    return `
      <div class="cart-item">
        <img src="${p.img}" alt="${p.name}">
        <div class="cart-item-info">
          <div class="name">${p.name}</div>
          <div>${formatPrice(p.price)}</div>
          <div class="qty-controls">
            <button onclick="changeQty('${p.id}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="changeQty('${p.id}', 1)">+</button>
          </div>
          <span class="remove-item" onclick="removeFromCart('${p.id}')">Kaldır</span>
        </div>
      </div>
    `;
  }).join("");
  totalEl.textContent = formatPrice(total);
}

function openCart() { document.getElementById("cartDrawer").classList.add("open"); document.getElementById("cartOverlay").classList.add("open"); }
function closeCartFn() { document.getElementById("cartDrawer").classList.remove("open"); document.getElementById("cartOverlay").classList.remove("open"); }

function checkout() {
  if (cart.length === 0) { alert("Sepetiniz boş."); return; }
  document.getElementById("checkoutFirstName").value = "";
  document.getElementById("checkoutLastName").value = "";
  document.getElementById("checkoutModalOverlay").classList.add("open");
}
function closeCheckoutModal() { document.getElementById("checkoutModalOverlay").classList.remove("open"); }

function sendOrderToWhatsapp(e) {
  e.preventDefault();
  const firstName = document.getElementById("checkoutFirstName").value.trim();
  const lastName = document.getElementById("checkoutLastName").value.trim();
  if (!firstName || !lastName) return;

  let msg = "Merhaba, aşağıdaki ürünleri sipariş etmek istiyorum:%0A%0A";
  msg += `Ad Soyad: ${firstName} ${lastName}%0A%0A`;
  let total = 0;
  cart.forEach(item => {
    const p = PRODUCTS.find(x => x.id === item.id);
    if (!p) return;
    total += p.price * item.qty;
    msg += `- ${p.name} x${item.qty} (${formatPrice(p.price * item.qty)})%0A`;
  });
  msg += `%0AToplam: ${formatPrice(total)}`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");

  closeCheckoutModal();
  cart = [];
  saveCart();
  renderCart();
  closeCartFn();
}

document.getElementById("cartBtn").onclick = openCart;
document.getElementById("closeCart").onclick = closeCartFn;
document.getElementById("cartOverlay").onclick = closeCartFn;
document.getElementById("closeModal").onclick = closeProductModal;
document.getElementById("productModalOverlay").onclick = (e) => { if (e.target.id === "productModalOverlay") closeProductModal(); };
document.getElementById("checkoutBtn").onclick = checkout;
document.getElementById("closeCheckoutModal").onclick = closeCheckoutModal;
document.getElementById("checkoutModalOverlay").onclick = (e) => { if (e.target.id === "checkoutModalOverlay") closeCheckoutModal(); };
document.getElementById("checkoutForm").addEventListener("submit", sendOrderToWhatsapp);
document.getElementById("catScrollLeft").onclick = () => {
  document.querySelector(".category-nav").scrollBy({ left: -220, behavior: "smooth" });
};
document.getElementById("catScrollRight").onclick = () => {
  document.querySelector(".category-nav").scrollBy({ left: 220, behavior: "smooth" });
};
document.getElementById("sortSelect").onchange = (e) => { state.sort = e.target.value; renderProducts(); };
document.getElementById("searchBtn").onclick = runSearch;
document.getElementById("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
function runSearch() {
  state.search = document.getElementById("searchInput").value;
  state.category = "Tümü";
  renderAll();
}

loadStorefront();
