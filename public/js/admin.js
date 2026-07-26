// Alanya Racing Motors - Admin panel mantığı

let allProducts = [];
let allCategories = [];
let currentHeroImage = "";
let currentProductImages = [];
let draggedRow = null;
let draggedGalleryIndex = null;

// ---------- yardımcılar ----------
function showToast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => { t.className = "toast"; }, 2800);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: opts.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin"
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* boş yanıt olabilir */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `İstek başarısız (${res.status})`);
  }
  return data;
}

function formatPrice(n) { return Number(n).toLocaleString("tr-TR") + " TL"; }

// ---------- AUTH ----------
async function checkAuth() {
  const data = await api("/api/auth/check");
  if (data.authenticated) {
    showShell();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("loginWrap").style.display = "flex";
  document.getElementById("adminShell").classList.remove("visible");
}

async function showShell() {
  document.getElementById("loginWrap").style.display = "none";
  document.getElementById("adminShell").classList.add("visible");
  await Promise.all([loadProducts(), loadCategories()]);
  await loadSettings();
}

document.getElementById("loginBtn").onclick = doLogin;
document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

async function doLogin() {
  const password = document.getElementById("loginPassword").value;
  const errBox = document.getElementById("loginError");
  errBox.style.display = "none";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
    document.getElementById("loginPassword").value = "";
    await showShell();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  }
}

document.getElementById("logoutBtn").onclick = async () => {
  await api("/api/auth/logout", { method: "POST" });
  showLogin();
};

document.getElementById("viewSiteBtn").onclick = () => window.open("/", "_blank");

// ---------- NAV ----------
document.querySelectorAll(".admin-nav button[data-panel]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".admin-nav button[data-panel]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById(btn.dataset.panel).classList.add("active");
  };
});

// =================== ÜRÜNLER ===================

async function loadProducts() {
  allProducts = await api("/api/admin/products");
  renderProductList();
}

function renderProductList(filter = "") {
  const wrap = document.getElementById("productList");
  wrap.innerHTML = "";
  const q = filter.toLowerCase();
  const list = allProducts
    .filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    .sort((a, b) => a.order - b.order);

  list.forEach(p => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.draggable = true;
    row.dataset.id = p.id;
    row.innerHTML = `
      <span class="drag-handle">⠿</span>
      <img src="${p.img}" alt="">
      <span>
        <div class="row-name">${p.name}</div>
        <div class="row-cat">${p.category}</div>
      </span>
      <span>${formatPrice(p.price)}${p.oldPrice ? `<br><small style="color:#999;text-decoration:line-through;">${formatPrice(p.oldPrice)}</small>` : ""}</span>
      <span class="row-stock">${p.stock}</span>
      <span class="row-badge">${p.badge || "-"}</span>
      <span class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit">Düzenle</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Sil</button>
      </span>
    `;
    row.querySelector('[data-action="edit"]').onclick = () => openProductModal(p.id);
    row.querySelector('[data-action="delete"]').onclick = () => deleteProduct(p.id);
    attachDragEvents(row, allProducts, "/api/admin/products/reorder/all");
    wrap.appendChild(row);
  });
}

document.getElementById("productSearch").addEventListener("input", (e) => renderProductList(e.target.value));

function attachDragEvents(row, listRef, reorderUrl) {
  row.addEventListener("dragstart", () => { draggedRow = row; row.classList.add("dragging"); });
  row.addEventListener("dragend", () => { row.classList.remove("dragging"); draggedRow = null; });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    const container = row.parentElement;
    const after = getRowAfter(container, e.clientY);
    if (!draggedRow || draggedRow === row) return;
    if (after == null) container.appendChild(draggedRow);
    else container.insertBefore(draggedRow, after);
  });
  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    const container = row.parentElement;
    const ids = [...container.querySelectorAll(".list-row, .cat-row")].map(r => r.dataset.id);
    try {
      await api(reorderUrl, { method: "PUT", body: JSON.stringify({ order: ids }) });
      showToast("Sıralama güncellendi.");
      if (reorderUrl.includes("products")) await loadProducts();
      else await loadCategories();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function getRowAfter(container, y) {
  const rows = [...container.querySelectorAll(".list-row:not(.dragging), .cat-row:not(.dragging)")];
  return rows.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function populateCategorySelect() {
  const sel = document.getElementById("pCategory");
  sel.innerHTML = allCategories
    .sort((a, b) => a.order - b.order)
    .map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

function openProductModal(id) {
  populateCategorySelect();
  const isEdit = !!id;
  document.getElementById("productModalTitle").textContent = isEdit ? "Ürünü Düzenle" : "Yeni Ürün";
  document.getElementById("productId").value = id || "";
  document.getElementById("pImageInput").value = "";
  currentProductImages = [];

  if (isEdit) {
    const p = allProducts.find(x => x.id === id);
    document.getElementById("pName").value = p.name;
    document.getElementById("pCategory").value = p.category;
    document.getElementById("pPrice").value = p.price;
    document.getElementById("pOldPrice").value = p.oldPrice || "";
    document.getElementById("pBadge").value = p.badge || "";
    document.getElementById("pStock").value = p.stock;
    currentProductImages = Array.isArray(p.images) && p.images.length ? [...p.images] : (p.img ? [p.img] : []);
  } else {
    document.getElementById("pName").value = "";
    document.getElementById("pPrice").value = "";
    document.getElementById("pOldPrice").value = "";
    document.getElementById("pBadge").value = "";
    document.getElementById("pStock").value = "10";
  }
  renderImageGallery();
  updateDiscountHint();
  document.getElementById("productModalBg").classList.add("open");
}

document.getElementById("addProductBtn").onclick = () => openProductModal(null);
document.getElementById("cancelProductBtn").onclick = () => document.getElementById("productModalBg").classList.remove("open");
document.getElementById("pAddImageBtn").onclick = () => document.getElementById("pImageInput").click();

// ---------- ürün fotoğraf galerisi ----------
function renderImageGallery() {
  const gallery = document.getElementById("pImageGallery");
  if (!currentProductImages.length) {
    gallery.innerHTML = `<div class="gallery-empty">Henüz fotoğraf eklenmedi.</div>`;
    return;
  }
  gallery.innerHTML = currentProductImages.map((url, i) => `
    <div class="gallery-item" draggable="true" data-index="${i}">
      ${i === 0 ? '<span class="cover-badge">Kapak</span>' : ""}
      <img src="${url}" alt="Ürün fotoğrafı ${i + 1}">
      <button type="button" class="remove-img" data-remove="${i}" title="Sil">×</button>
    </div>
  `).join("");

  gallery.querySelectorAll(".remove-img").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.remove);
      currentProductImages.splice(i, 1);
      renderImageGallery();
    };
  });

  gallery.querySelectorAll(".gallery-item").forEach(item => {
    item.addEventListener("dragstart", () => {
      draggedGalleryIndex = Number(item.dataset.index);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      gallery.querySelectorAll(".gallery-item").forEach(x => x.classList.remove("drag-over"));
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetIndex = Number(item.dataset.index);
      if (draggedGalleryIndex === null || draggedGalleryIndex === targetIndex) return;
      const [moved] = currentProductImages.splice(draggedGalleryIndex, 1);
      currentProductImages.splice(targetIndex, 0, moved);
      draggedGalleryIndex = null;
      renderImageGallery();
    });
  });
}

document.getElementById("pImageInput").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    try {
      const url = await uploadImage(file);
      currentProductImages.push(url);
      renderImageGallery();
    } catch (err) {
      showToast(err.message, true);
    }
  }
  e.target.value = "";
  showToast(files.length > 1 ? "Fotoğraflar yüklendi." : "Fotoğraf yüklendi.");
});

async function uploadImage(file) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Yükleme başarısız.");
  return data.url;
}

// ---------- indirim yüzdesi önizlemesi ----------
function updateDiscountHint() {
  const hint = document.getElementById("discountHint");
  const price = Number(document.getElementById("pPrice").value);
  const oldPrice = Number(document.getElementById("pOldPrice").value);
  if (!price || !oldPrice || oldPrice <= price) {
    hint.style.display = "none";
    return;
  }
  const pct = Math.round((1 - price / oldPrice) * 100);
  const diff = oldPrice - price;
  hint.textContent = `%${pct} indirim — ${oldPrice} TL yerine ${price} TL (${diff} TL fark)`;
  hint.style.display = "inline-block";
}
document.getElementById("pPrice").addEventListener("input", updateDiscountHint);
document.getElementById("pOldPrice").addEventListener("input", updateDiscountHint);

document.getElementById("saveProductBtn").onclick = async () => {
  const id = document.getElementById("productId").value;
  const payload = {
    name: document.getElementById("pName").value.trim(),
    category: document.getElementById("pCategory").value,
    price: Number(document.getElementById("pPrice").value) || 0,
    oldPrice: document.getElementById("pOldPrice").value ? Number(document.getElementById("pOldPrice").value) : null,
    badge: document.getElementById("pBadge").value || null,
    stock: Number(document.getElementById("pStock").value) || 0,
    images: currentProductImages
  };
  if (!payload.name) { showToast("Ürün adı zorunludur.", true); return; }
  try {
    if (id) await api(`/api/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("productModalBg").classList.remove("open");
    showToast("Ürün kaydedildi.");
    await loadProducts();
  } catch (err) {
    showToast(err.message, true);
  }
};

async function deleteProduct(id) {
  if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
  try {
    await api(`/api/admin/products/${id}`, { method: "DELETE" });
    showToast("Ürün silindi.");
    await loadProducts();
  } catch (err) {
    showToast(err.message, true);
  }
}

// =================== KATEGORİLER ===================

async function loadCategories() {
  allCategories = await api("/api/admin/categories");
  renderCategoryList();
}

function renderCategoryList() {
  const wrap = document.getElementById("categoryList");
  wrap.innerHTML = "";
  allCategories.sort((a, b) => a.order - b.order).forEach(c => {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.draggable = true;
    row.dataset.id = c.id;
    const count = allProducts.filter(p => p.category === c.name).length;
    row.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span>${c.name} <small style="color:#999;">(${count} ürün)</small></span>
      <span></span>
      <span class="row-actions">
        <button class="btn btn-secondary btn-sm" data-action="rename">Yeniden Adlandır</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Sil</button>
      </span>
    `;
    row.querySelector('[data-action="rename"]').onclick = () => renameCategory(c.id, c.name);
    row.querySelector('[data-action="delete"]').onclick = () => deleteCategory(c.id, c.name);
    attachDragEvents(row, allCategories, "/api/admin/categories/reorder/all");
    wrap.appendChild(row);
  });
}

document.getElementById("addCategoryBtn").onclick = async () => {
  const input = document.getElementById("newCategoryInput");
  const name = input.value.trim();
  if (!name) { showToast("Kategori adı girin.", true); return; }
  try {
    await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) });
    input.value = "";
    showToast("Kategori eklendi.");
    await loadCategories();
  } catch (err) {
    showToast(err.message, true);
  }
};

async function renameCategory(id, oldName) {
  const name = prompt("Yeni kategori adı:", oldName);
  if (!name || name.trim() === "" || name === oldName) return;
  try {
    await api(`/api/admin/categories/${id}`, { method: "PUT", body: JSON.stringify({ name: name.trim() }) });
    showToast("Kategori güncellendi.");
    await Promise.all([loadCategories(), loadProducts()]);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`"${name}" kategorisini silmek istediğinize emin misiniz?`)) return;
  try {
    await api(`/api/admin/categories/${id}`, { method: "DELETE" });
    showToast("Kategori silindi.");
    await Promise.all([loadCategories(), loadProducts()]);
  } catch (err) {
    if (err.message.includes("force=true") || err.message.includes("ürün var")) {
      if (confirm(`${err.message}\n\nYine de silmek istiyor musunuz? (Bu kategorideki ürünler "Kategorisiz" olacak)`)) {
        try {
          await api(`/api/admin/categories/${id}?force=true`, { method: "DELETE" });
          showToast("Kategori silindi.");
          await Promise.all([loadCategories(), loadProducts()]);
        } catch (e2) {
          showToast(e2.message, true);
        }
      }
    } else {
      showToast(err.message, true);
    }
  }
}

// =================== AYARLAR ===================

async function loadSettings() {
  const s = await api("/api/admin/settings");
  document.getElementById("setSiteName").value = s.siteName || "";
  document.getElementById("setHeroTitle").value = s.heroTitle || "";
  document.getElementById("setHeroHighlight").value = s.heroHighlight || "";
  document.getElementById("setHeroSubtitle").value = s.heroSubtitle || "";
  document.getElementById("setPhone").value = s.phone || "";
  document.getElementById("setWhatsapp").value = s.whatsapp || "";
  document.getElementById("setEmail").value = s.email || "";
  document.getElementById("setAddress").value = s.address || "";
  currentHeroImage = s.heroImage || "";
  const prev = document.getElementById("heroPreview");
  if (currentHeroImage) { prev.src = currentHeroImage; prev.style.display = "block"; }
  else { prev.style.display = "none"; }
}

document.getElementById("heroImageInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const url = await uploadImage(file);
    currentHeroImage = url;
    const prev = document.getElementById("heroPreview");
    prev.src = url; prev.style.display = "block";
    showToast("Banner görseli yüklendi.");
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById("saveSettingsBtn").onclick = async () => {
  const payload = {
    siteName: document.getElementById("setSiteName").value.trim(),
    heroTitle: document.getElementById("setHeroTitle").value.trim(),
    heroHighlight: document.getElementById("setHeroHighlight").value.trim(),
    heroSubtitle: document.getElementById("setHeroSubtitle").value.trim(),
    heroImage: currentHeroImage,
    phone: document.getElementById("setPhone").value.trim(),
    whatsapp: document.getElementById("setWhatsapp").value.trim().replace(/[^0-9]/g, ""),
    email: document.getElementById("setEmail").value.trim(),
    address: document.getElementById("setAddress").value.trim()
  };
  try {
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
    showToast("Ayarlar kaydedildi.");
  } catch (err) {
    showToast(err.message, true);
  }
};

// =================== ŞİFRE ===================

document.getElementById("changePasswordBtn").onclick = async () => {
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  try {
    await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    showToast("Şifre güncellendi.");
  } catch (err) {
    showToast(err.message, true);
  }
};

// ---------- INIT ----------
checkAuth();
