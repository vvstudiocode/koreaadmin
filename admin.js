/**
 * CMS Admin Logic V3.5 (Order & Product Batch Updates)
 */

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby7V5VwHfn_Tb-wpg_SSrme2c2P5bin6qjhxEkr80RDLg6p5TPn2EXySkpG9qnyvfNF/exec';
let currentPassword = '';
let currentOrders = [];
let currentProducts = [];

// 批次更新暫存
let pendingUpdates = {}; // Order Updates
let pendingProductUpdates = []; // Product Updates (Array of objects)

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const savedPassword = sessionStorage.getItem('adminPassword');
    if (savedPassword) {
        currentPassword = savedPassword;
        showDashboard();
    }

    // 綁定自動計算事件
    document.getElementById('prodPriceKrw').addEventListener('input', calculateInlineCost);
    document.getElementById('prodExchangeRate').addEventListener('input', calculateInlineCost);
});

function handleLogin() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value.trim();
    const errorMsg = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    if (!password) { errorMsg.textContent = '請輸入密碼'; return; }

    loginBtn.disabled = true;
    loginBtn.textContent = '驗證中...';
    errorMsg.textContent = '';

    callApi('login', { password: password })
        .then(data => {
            if (data.success) {
                currentPassword = password;
                sessionStorage.setItem('adminPassword', password);
                showDashboard();
            } else {
                errorMsg.textContent = '密碼錯誤';
            }
        })
        .catch(err => errorMsg.textContent = '連線錯誤')
        .finally(() => {
            loginBtn.disabled = false;
            loginBtn.textContent = '登入';
        });
}

function callApi(subAction, payload = {}) {
    return fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'adminAction',
            subAction: subAction,
            password: currentPassword || payload.password,
            ...payload
        })
    }).then(res => res.json());
}

function logout() {
    sessionStorage.removeItem('adminPassword');
    currentPassword = '';
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'flex';
    refreshData();
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    document.querySelector(`#tab-${tabId}`).classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => view.style.display = 'none');

    document.getElementById('batchActions').style.display = (tabId === 'orders') ? 'flex' : 'none';

    if (tabId === 'dashboard') {
        document.getElementById('dashboardView').style.display = 'block';
        document.getElementById('pageTitle').textContent = '總覽報表';
    } else if (tabId === 'orders') {
        document.getElementById('ordersView').style.display = 'block';
        document.getElementById('pageTitle').textContent = '訂單管理';
        renderOrders(currentOrders);
        updateBatchUI();
    } else if (tabId === 'products') {
        document.getElementById('productsView').style.display = 'block';
        document.getElementById('pageTitle').textContent = '商品管理';
        if (currentProducts.length === 0) fetchProducts();
        else renderProducts(currentProducts);

        updateProductBatchUI();
    }

    // 手機版：選完分頁後自動收起側邊欄
    if (window.innerWidth <= 1024) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        }
    }
}

function refreshData() {
    callApi('getDashboardData')
        .then(data => {
            if (data.success) {
                currentOrders = data.data.orders;
                updateDashboardStats(data.data.stats);
                renderOrders(currentOrders);
                pendingUpdates = {};
                updateBatchUI();
            } else {
                if (data.error === '密碼錯誤') logout();
            }
        })
        .catch(console.error);
}

function updateDashboardStats(stats) {
    document.getElementById('statRevenue').textContent = formatCurrency(stats.totalRevenue);
    document.getElementById('statCost').textContent = formatCurrency(stats.totalCost);
    document.getElementById('statProfit').textContent = formatCurrency(stats.grossProfit);
    document.getElementById('statOrders').textContent = stats.totalOrders;
    document.getElementById('statPending').textContent = stats.pendingOrders;

    // 計算毛利率
    const profitMargin = stats.totalRevenue > 0
        ? ((stats.grossProfit / stats.totalRevenue) * 100).toFixed(1)
        : 0;
    document.getElementById('statProfitMargin').textContent = `毛利率: ${profitMargin}%`;
}

// 日期篩選（未來可擴展）
function filterDashboardByDate(range) {
    // 目前顯示全部資料
    // 未來可以根據 range 值篩選訂單
    console.log('篩選範圍:', range);
    // refreshData(); // 可以加上篩選邏輯
}


// ----------------------
// 訂單管理
// ----------------------
function renderOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">目前沒有訂單</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => {
        const pending = pendingUpdates[order.orderId];
        const displayStatus = (pending && pending.status) ? pending.status : order.status;
        const isModified = !!pending;

        const statusOptions = ['待處理', '已確認', '已出貨', '已完成', '已取消', '取消']
            .map(s => `<option value="${s}" ${s === displayStatus ? 'selected' : ''}>${s}</option>`)
            .join('');

        return `
        <tr class="${isModified ? 'row-modified' : ''}">
            <td>${order.orderId}</td>
            <td>
                <select onchange="markOrderUpdated('${order.orderId}', 'status', this.value)" 
                        style="padding: 5px; border-radius: 4px; border: 1px solid #ddd; background: ${getStatusColor(displayStatus)}">
                    ${statusOptions}
                </select>
                ${isModified ? '<span style="color:red; font-size:12px; margin-left:5px;">*</span>' : ''}
            </td>
            <td>${order.date}</td>
            <td>${order.customerName}</td>
            <td>${formatCurrency(order.total)}</td>
            <td>
                <button class="action-btn" onclick="openOrderDetail('${order.orderId}')">編輯/詳情</button>
            </td>
        </tr>
    `}).join('');
}

function getStatusColor(status) {
    if (status === '待處理') return '#fff3cd';
    if (status === '已確認') return '#d1e7dd';
    if (status === '已出貨') return '#cff4fc';
    if (status === '已完成') return '#e2e3e5';
    if (status === '已取消' || status === '取消') return '#f8d7da';
    return '#fff';
}

function markOrderUpdated(orderId, field, value) {
    if (!pendingUpdates[orderId]) pendingUpdates[orderId] = {};
    pendingUpdates[orderId][field] = value;

    if (field === 'status') {
        updateBatchUI();
        renderOrders(currentOrders);
    } else {
        updateBatchUI();
    }
}

function updateBatchUI() {
    const count = Object.keys(pendingUpdates).length;
    const msg = document.getElementById('unsavedChangesMsg');
    const btn = document.querySelector('#batchActions button');

    if (count > 0) {
        msg.textContent = `⚠️ 有 ${count} 筆變更未儲存`;
        btn.disabled = false;
        btn.textContent = '💾 儲存所有變更';
    } else {
        msg.textContent = '';
        btn.disabled = true;
        btn.textContent = '沒有變更';
    }
}

function saveBatchChanges() {
    if (Object.keys(pendingUpdates).length === 0) return;

    const updates = Object.keys(pendingUpdates).map(oid => ({
        orderId: oid,
        ...pendingUpdates[oid]
    }));

    const btn = document.querySelector('#batchActions button');
    btn.textContent = '儲存中...';
    btn.disabled = true;

    callApi('updateOrdersBatch', { updates: updates })
        .then(data => {
            if (data.success) {
                pendingUpdates = {};
                refreshData();
                alert('已成功批次更新！');
            } else {
                alert('更新失敗: ' + data.error);
                btn.disabled = false;
            }
        });
}

function openOrderDetail(orderId) {
    const order = currentOrders.find(o => o.orderId === orderId);
    if (!order) return;

    const pending = pendingUpdates[orderId] || {};

    document.getElementById('detailOrderId').textContent = order.orderId;

    document.getElementById('detailName').value = pending.customerName || order.customerName || '';
    document.getElementById('detailPhone').value = pending.customerPhone || order.customerPhone || '';
    document.getElementById('detailEmail').value = order.email || '';
    document.getElementById('detailLine').value = order.lineId || '';

    const shipMethod = pending.shippingMethod || order.shippingMethod || '';
    const shipSelect = document.getElementById('detailShipping');
    shipSelect.value = shipMethod;
    if (!shipSelect.value && shipMethod) {
        console.warn('Unknown shipping method:', shipMethod);
    }

    document.getElementById('detailStoreName').value = pending.storeName || order.storeName || '';
    document.getElementById('detailStoreCode').value = order.storeCode || '';
    document.getElementById('detailStoreAddress').value = pending.storeAddress || order.storeAddress || '';

    const itemsHtml = order.items.map(item => `
        <tr>
            <td>${item.name}</td>
            <td>${item.spec || '-'}</td>
            <td>${item.qty}</td>
            <td>${formatCurrency(item.subtotal)}</td>
        </tr>`).join('');
    document.getElementById('detailItemsBody').innerHTML = itemsHtml;

    document.getElementById('detailShippingFee').textContent = order.shippingFee || 0;
    document.getElementById('detailTotal').textContent = order.total;

    document.getElementById('detailNote').value = pending.note || order.note || '';

    const saveBtn = document.querySelector('#orderDetailModal .accent-btn');
    saveBtn.onclick = () => saveOrderDetailToBatch(orderId);

    openModal('orderDetailModal');
}

function saveOrderDetailToBatch(orderId) {
    const updates = {
        customerName: document.getElementById('detailName').value,
        customerPhone: document.getElementById('detailPhone').value,
        shippingMethod: document.getElementById('detailShipping').value,
        storeName: document.getElementById('detailStoreName').value,
        storeAddress: document.getElementById('detailStoreAddress').value,
        note: document.getElementById('detailNote').value
    };

    if (!pendingUpdates[orderId]) pendingUpdates[orderId] = {};
    Object.assign(pendingUpdates[orderId], updates);

    updateBatchUI();
    renderOrders(currentOrders);
    closeModal('orderDetailModal');
}

// ----------------------
// 商品管理
// ----------------------
function fetchProducts() {
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">載入中...</td></tr>';

    callApi('getProductsAdmin')
        .then(data => {
            if (data.success) {
                currentProducts = data.data.products;
                // 清除 pending (因為重整了) - 或者可以 merge? 這裡簡單起見先清空
                pendingProductUpdates = [];
                updateProductBatchUI();
                renderProducts(currentProducts);
            }
        });
}

function renderProducts(products) {
    const tbody = document.getElementById('productsTableBody');

    // 合併 pendingUpdates 到顯示列表
    // 這裡我們需要知道哪些被改了
    // 簡單做法：pendingUpdates 裡的物件直接覆蓋 products 裡的 (如果 ID 相同)
    // 但 pendingUpdates 可能是 Array of changed objects.

    const displayProducts = products.map(p => {
        const pending = pendingProductUpdates.find(up => String(up.id) === String(p.id));
        return pending ? { ...p, ...pending, _isModified: true } : p;
    });

    // 也要顯示新建立的商品 (暫時只支援編輯既有，新增就簡單處理直接顯示在列表最後?)
    // 為了簡單，新增商品目前還是一樣進 Modal，Submit 後放入 Pending

    // 處理新增的 (ID 不在 currentProducts 裡的)
    pendingProductUpdates.forEach(pending => {
        if (!pending.id || !currentProducts.find(p => String(p.id) === String(pending.id))) {
            // 這是一個純新增的，且尚未有 ID (或有臨時 ID)
            // 這裡顯示會有問題，因為 ID 是後端生成的。
            // 建議：新增商品依然直接 call API (因為需要圖片上傳、ID 生成等)，或者用臨時 ID
            // 使用者需求: "編輯好之後，再統一按下儲存" -> 通常指編輯現有。
            // 新增通常比較獨立。但我們嘗試將新增也納入 pending?

            // 如果是新增，我們給一個臨時 ID (Temp...)
            if (!displayProducts.find(x => x.id === pending.id)) {
                displayProducts.push({ ...pending, _isModified: true, _isNew: true });
            }
        }
    });

    tbody.innerHTML = displayProducts.map(p => `
        <tr class="${p._isModified ? 'row-modified' : ''}">
            <td><img src="${p.image}" class="table-thumb" style="width:40px;height:40px;object-fit:cover;"></td>
            <td>${p.name} ${p._isNew ? '(新)' : ''}</td>
            <td>${p.price}</td>
            <td style="color: #888;">${p.cost || 0}</td>
            <td style="color: #aaa; font-size:0.9em;">₩${p.priceKrw || 0}</td>
            <td>${p.stock}</td>
            <td>${p.status}</td>
            <td>
                <button class="action-btn" onclick="openProductModal('${p.id || ''}')">編輯</button>
            </td>
        </tr>
    `).join('');
}

function openProductModal(productId = null) {
    const form = document.getElementById('productForm');
    form.reset();

    document.getElementById('prodId').value = '';
    document.getElementById('prodExchangeRate').value = '';

    // 嘗試從 pending 或 current 找
    let p = null;

    if (productId) {
        // 先找 pending
        p = pendingProductUpdates.find(x => String(x.id) === String(productId));
        // 再找 current
        if (!p) p = currentProducts.find(x => String(x.id) === String(productId));

        if (p) {
            document.getElementById('prodId').value = p.id;
            document.getElementById('prodName').value = p.name;
            document.getElementById('prodCategory').value = p.category;
            document.getElementById('prodPrice').value = p.price;
            document.getElementById('prodCost').value = p.cost;
            document.getElementById('prodPriceKrw').value = p.priceKrw || 0;
            document.getElementById('prodStock').value = p.stock;
            document.getElementById('prodStatus').value = p.status;
            document.getElementById('prodDesc').value = p.description;
            // 處理圖片 Array 或 String
            let imgVal = p.image;
            if (Array.isArray(imgVal)) imgVal = imgVal.join(',');
            document.getElementById('prodImage').value = imgVal || '';

            document.getElementById('prodOptions').value = JSON.stringify(p.options || {});
        }
    }

    openModal('productModal');
    const body = document.querySelector('#productForm .modal-body');
    if (body) body.scrollTop = 0;
}

function calculateInlineCost() {
    const krw = Number(document.getElementById('prodPriceKrw').value) || 0;
    const rate = Number(document.getElementById('prodExchangeRate').value);

    if (krw > 0 && rate > 0) {
        const cost = Math.round(krw / rate);
        document.getElementById('prodCost').value = cost;
    }
}

function handleProductSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('prodId').value;

    let options = {};
    try {
        options = JSON.parse(document.getElementById('prodOptions').value);
    } catch (e) {
        alert('規格 JSON 格式錯誤'); return;
    }

    // 建立 Product 物件
    const isNew = !productId;
    const tempId = isNew ? 'NEW_' + Date.now() : productId;

    const productData = {
        id: tempId,
        name: document.getElementById('prodName').value,
        category: document.getElementById('prodCategory').value,
        price: Number(document.getElementById('prodPrice').value),
        cost: Number(document.getElementById('prodCost').value),
        priceKrw: Number(document.getElementById('prodPriceKrw').value),
        stock: Number(document.getElementById('prodStock').value),
        status: document.getElementById('prodStatus').value,
        description: document.getElementById('prodDesc').value,
        image: document.getElementById('prodImage').value,
        options: options
    };

    // 更新 Pending Queue
    // 移除舊的 update (如果有)
    pendingProductUpdates = pendingProductUpdates.filter(p => String(p.id) !== String(tempId));
    pendingProductUpdates.push(productData);

    // 關閉 Modal 並更新 UI
    closeModal('productModal');
    updateProductBatchUI();
    renderProducts(currentProducts);
}

function updateProductBatchUI() {
    const count = pendingProductUpdates.length;
    const msg = document.getElementById('unsavedProductsMsg');
    const btn = document.querySelector('#productBatchActions button');

    if (msg && btn) {
        if (count > 0) {
            msg.textContent = `⚠️ 有 ${count} 筆商品變更`;
            btn.disabled = false;
        } else {
            msg.textContent = '';
            btn.disabled = true;
        }
    }
}

function saveProductBatchChanges() {
    if (pendingProductUpdates.length === 0) return;

    const btn = document.querySelector('#productBatchActions button');
    btn.textContent = '儲存中...';
    btn.disabled = true;

    // 將 NEW_ ID 清除，讓後端生成
    const updates = pendingProductUpdates.map(p => {
        if (String(p.id).startsWith('NEW_')) return { ...p, id: null };
        return p;
    });

    callApi('updateProductsBatch', { updates: updates })
        .then(data => {
            if (data.success) {
                alert('所有商品變更已儲存！');
                pendingProductUpdates = [];
                // 重新讀取以獲取最新 ID 和狀態
                fetchProducts();
            } else {
                alert('儲存失敗: ' + data.error);
                btn.disabled = false;
                btn.textContent = '💾 儲存商品變更';
            }
        });
}

function formatCurrency(num) {
    return 'NT$ ' + (Number(num) || 0).toLocaleString();
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// 手機版側邊欄切換
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (!overlay) {
        const newOverlay = document.createElement('div');
        newOverlay.className = 'sidebar-overlay';
        newOverlay.onclick = toggleSidebar;
        document.body.appendChild(newOverlay);
    }

    sidebar.classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
    document.body.classList.toggle('sidebar-open');
}
