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

// Toast 通知系統
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        cursor: pointer;
        max-width: 350px;
    `;

    // 根據類型設定顏色
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    toast.style.backgroundColor = colors[type] || colors.info;
    if (type === 'warning') toast.style.color = '#333';

    toast.textContent = message;
    toast.onclick = () => toast.remove();

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showLoadingOverlay() {
    let loadingOverlay = document.getElementById('loadingOverlay');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `<div class="spinner"></div>`;
        document.body.appendChild(loadingOverlay);
    }
    loadingOverlay.classList.add('active');
}

function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('active');
    }
}

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

        // 確保商品列表已載入（新增訂單需要）
        if (currentProducts.length === 0) {
            fetchProducts();
        }
    } else if (tabId === 'products') {
        document.getElementById('productsView').style.display = 'block';
        document.getElementById('pageTitle').textContent = '商品管理';
        if (currentProducts.length === 0) fetchProducts();
        else renderProducts(currentProducts);
        updateProductBatchUI();
    } else if (tabId === 'builder') {
        document.getElementById('builderSection').style.display = 'block';
        document.getElementById('pageTitle').textContent = '首頁排版管理';
        if (typeof PageBuilder !== 'undefined') {
            if (!PageBuilder._hasStarted) {
                PageBuilder.init();
                PageBuilder._hasStarted = true;
            } else {
                // 如果已經初始化過，只需確保預覽正確渲染
                PageBuilder.renderPreview();
            }
        }
    } else if (tabId === 'settings') {
        document.getElementById('settingsView').style.display = 'block';
        document.getElementById('pageTitle').textContent = '網站設定';
        document.getElementById('batchActions').style.display = 'none'; // Ensure batch actions are hidden
        loadSiteSettings();
    } else if (tabId === 'purchasing') {
        document.getElementById('purchasingView').style.display = 'block';
        document.getElementById('pageTitle').textContent = '採買統計';
        document.getElementById('batchActions').style.display = 'none';

        // 初始化日期 (預設今天)
        const today = new Date().toISOString().split('T')[0];
        if (!document.getElementById('statsStartDate').value) {
            document.getElementById('statsStartDate').value = today;
            document.getElementById('statsEndDate').value = today;
        }
        loadPurchasingStats();
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
        <tr class="${isModified ? 'row-modified' : ''}" onclick="toggleRowDetails('${order.orderId}')" style="cursor:pointer;">
            <td>${order.orderId}</td>
            <td onclick="event.stopPropagation()">
                <select onchange="markOrderUpdated('${order.orderId}', 'status', this.value)" 
                        style="padding: 5px; border-radius: 4px; border: 1px solid #ddd; background: ${getStatusColor(displayStatus)}">
                    ${statusOptions}
                </select>
                ${isModified ? '<span style="color:red; font-size:12px; margin-left:5px;">*</span>' : ''}
            </td>
            <td>${order.date}</td>
            <td>${order.customerName}</td>
            <td>${order.shippingMethod || '-'}</td>
            <td>${formatCurrency(order.total)}</td>
            <td onclick="event.stopPropagation()">
                <div style="display:flex; gap:5px;">
                    <button class="action-btn" onclick="openOrderDetail('${order.orderId}')">編輯</button>
                    <button class="action-btn btn-danger" onclick="confirmDeleteOrder('${order.orderId}')">刪除</button>
                </div>
            </td>
        </tr>
        <tr id="details-${order.orderId}" style="display:none; background-color:#f8f9fa;">
            <td colspan="7">
                <div style="padding: 15px;">
                    <strong>商品明細：</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        ${(order.items || []).map(item => `
                            <li>${item.name} ${item.spec ? `(${item.spec})` : ''} x ${item.qty} - ${formatCurrency(item.subtotal)}</li>
                        `).join('')}
                    </ul>
                    <div style="margin-top: 10px; display:flex; gap: 20px;">
                        <span><strong>電話:</strong> ${order.customerPhone || '-'}</span>
                        <span><strong>運費:</strong> ${order.shippingFee || 0}</span>
                        <span><strong>備註:</strong> ${order.note || '無'}</span>
                    </div>
                    ${order.storeName ? `<div style="margin-top: 5px;"><strong>門市:</strong> ${order.storeName} (${order.storeCode})</div>` : ''}
                    ${order.storeAddress ? `<div style="margin-top: 5px;"><strong>地址:</strong> ${order.storeAddress}</div>` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
}

function toggleRowDetails(orderId) {
    const row = document.getElementById(`details-${orderId}`);
    if (row) {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
}

// 訂單搜尋/篩選
function filterOrders() {
    const searchTerm = document.getElementById('orderSearchInput').value.toLowerCase();
    const statusFilter = document.getElementById('orderStatusFilter').value;

    const filtered = currentOrders.filter(order => {
        // 搜尋條件
        const matchSearch = !searchTerm ||
            order.orderId.toLowerCase().includes(searchTerm) ||
            (order.customerName || '').toLowerCase().includes(searchTerm) ||
            (order.customerPhone || '').includes(searchTerm);

        // 狀態篩選
        const matchStatus = !statusFilter || order.status === statusFilter;

        return matchSearch && matchStatus;
    });

    renderOrders(filtered);
}

// 商品搜尋
function filterProductsList() {
    const searchTerm = document.getElementById('productSearchInput').value.toLowerCase();

    const filtered = currentProducts.filter(product => {
        return !searchTerm ||
            (product.name || '').toLowerCase().includes(searchTerm) ||
            (product.category || '').toLowerCase().includes(searchTerm) ||
            (product.brand || '').toLowerCase().includes(searchTerm);
    });

    renderProducts(filtered);
}

function getStatusColor(status) {
    if (status === '待處理') return '#fff3cd';
    if (status === '已確認') return '#d1e7dd';
    if (status === '已出貨') return '#cff4fc';
    if (status === '已完成') return '#e2e3e5';
    if (status === '已取消' || status === '取消') return '#f8d7da';
    return '#fff';
}

// 批量儲存訂單變更
// 批量儲存訂單變更 (發送到後端)
function saveBatchUpdates() {
    if (Object.keys(pendingUpdates).length === 0) {
        alert('沒有變更需要儲存');
        return;
    }

    const btn = document.getElementById('saveBatchBtn');
    if (!btn) return;

    const confirmMsg = `確定要儲存 ${Object.keys(pendingUpdates).length} 筆訂單的變更嗎？`;
    if (!confirm(confirmMsg)) return;

    btn.disabled = true;
    btn.textContent = '儲存中...';

    console.log('準備儲存的訂單變更:', pendingUpdates);

    callApi('updateOrdersBatch', { updates: pendingUpdates })
        .then(data => {
            if (data.success) {
                showToast(`成功儲存 ${Object.keys(pendingUpdates).length} 筆訂單！`, 'success');
                pendingUpdates = {}; // 清空暫存
                updateBatchUI();
                refreshData(); // 重新整理列表與統計
            } else {
                alert('儲存失敗：' + data.error);
            }
        })
        .catch(err => {
            alert('儲存失敗：' + err);
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '💾 儲存所有變更';
        });
}

// 更新訂單批次更新 UI
function updateBatchUI() {
    const count = Object.keys(pendingUpdates).length;
    const msg = document.getElementById('unsavedChangesMsg');
    const btn = document.getElementById('saveBatchBtn');

    if (msg && btn) {
        if (count > 0) {
            msg.textContent = `⚠️ 有 ${count} 筆訂單變更未儲存`;
            btn.disabled = false;
        } else {
            msg.textContent = '';
            btn.disabled = true;
        }
    }
}

// 立即更新訂單狀態
// 暫存訂單狀態變更
function markOrderUpdated(orderId, field, value) {
    if (field !== 'status') return;

    if (!pendingUpdates[orderId]) pendingUpdates[orderId] = {};
    pendingUpdates[orderId][field] = value;

    // 觸發重新渲染以顯示標記
    renderOrders(currentOrders);
    updateBatchUI();
    showToast(`狀態變更已暫存 (${orderId})`, 'info', 1500);
}

// 移除舊的 updateBatchUI (如果只剩商品需要它)

function renderDashboard(orders = currentOrders) {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingOrders = orders.filter(o => o.status === '待處理' || o.status === '編輯/詳情').length;

    document.querySelector('.stats-container').innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${totalOrders}</div>
            <div class="stat-label">訂單總數</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">NT$ ${formatCurrency(totalRevenue)}</div>
            <div class="stat-label">總營收</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${pendingOrders}</div>
            <div class="stat-label">待處理訂單</div>
        </div>
    `;
}

function openOrderDetail(orderId) {
    console.log('openOrderDetail called with orderId:', orderId);

    const order = currentOrders.find(o => o.orderId === orderId);
    if (!order) return;

    const pending = pendingUpdates[orderId] || {};

    currentEditingOrderId = orderId;
    tempOrderItems = order.items.map(item => ({
        name: item.name,
        spec: item.spec || '',
        qty: item.qty,
        price: item.price || (item.subtotal / item.qty),
        subtotal: item.subtotal
    }));

    document.getElementById('detailOrderId').textContent = order.orderId;

    document.getElementById('detailName').value = pending.customerName || order.customerName || '';
    document.getElementById('detailPhone').value = pending.customerPhone || order.customerPhone || '';
    document.getElementById('detailEmail').value = order.email || '';
    document.getElementById('detailLine').value = order.lineId || '';

    const shipMethod = pending.shippingMethod || order.shippingMethod || '7-11店到店'; // 預設必填
    const shipSelect = document.getElementById('detailShipping');
    shipSelect.value = shipMethod;

    if (!shipSelect.value) {
        // 如果值不在選項內，可能是舊資料問題，強制選第一個或保留
        // 這裡我們把 shipMethod 加回去或者選第一個
        shipSelect.value = '7-11店到店';
    }

    // 載入運費
    const shipFeeInput = document.getElementById('detailShippingFee');
    let loadedFee = 0;
    if (pending.shippingFee !== undefined) {
        loadedFee = pending.shippingFee;
    } else if (order.shippingFee !== undefined) {
        loadedFee = order.shippingFee;
    } else {
        // 沒有舊資料
        loadedFee = (shipMethod === '7-11店到店') ? 60 : 0;
    }

    // 用戶反饋: "因為現在初始是711但是下方的運費實際不會增加"
    // 如果是 7-11店到店 且 loadedFee 為 0，強制設為 60?
    // 但這可能會覆蓋真的免運訂單。
    // 折衷方案: 如果 loadedFee 是 0 且方法是 7-11，我們提示或者預設填 60 (如果是新訂單或資料不全)
    // 這裡我們信任：如果 order.shippingFee 存在 (即使是0)，就用它。

    // 但用戶抱怨的是初始化時沒反應。
    // 如果 order.shippingFee 確實是 undefined (舊訂單)，上面 logic 會設 60.
    // 如果 order.shippingFee 是 0 (可能來自 Google Sheet 空白被轉為 0)，那就會顯示 0.
    // 我們可以依賴用戶手動改，或者：
    if (shipMethod === '7-11店到店' && loadedFee === 0) {
        // 是否要強制更新？
        // 考慮到用戶體驗，如果是舊資料(可能運費欄位空白)，設為60比較好。
        // 但如何區分 "空白" 和 "手動0"?
        // Code.gs 裡如果是空白，可能會讀成 "" 或 0.
        // 為了方便，我們預設 7-11 就是 60，除非這是一個已經確認的免運訂單？
        // 暫時強制設為 60，讓用戶自己改 0 (如果是特例)。這比每次都要改 60 好。
        loadedFee = 60;
    }

    shipFeeInput.value = loadedFee;

    document.getElementById('detailStoreName').value = pending.storeName || order.storeName || '';
    document.getElementById('detailStoreCode').value = order.storeCode || '';
    document.getElementById('detailStoreAddress').value = pending.storeAddress || order.storeAddress || '';

    renderOrderItems();
    loadProductSuggestions();

    document.getElementById('detailNote').value = pending.note || order.note || '';

    // 編輯模式：設定最下方的按鈕
    const saveBtn = document.querySelector('#orderDetailModal .modal-actions .accent-btn');
    if (saveBtn) {
        console.log('Setting saveBtn onclick with orderId:', orderId);
        saveBtn.textContent = '確認修改 (暫存)';
        saveBtn.onclick = () => saveOrderDetailToBatch(orderId);
    }

    openModal('orderDetailModal');
}

// 儲存訂單詳情到暫存區
function saveOrderDetailToBatch(orderId) {
    const updates = {
        customerName: document.getElementById('detailName').value,
        customerPhone: document.getElementById('detailPhone').value,
        shippingMethod: document.getElementById('detailShipping').value,
        shippingFee: parseInt(document.getElementById('detailShippingFee').value) || 0,
        storeName: document.getElementById('detailStoreName').value,
        storeAddress: document.getElementById('detailStoreAddress').value,
        note: document.getElementById('detailNote').value,
        items: tempOrderItems,
        total: parseInt(document.getElementById('detailTotal').textContent)
    };

    console.log('saveOrderDetailToBatch - updates:', updates);

    if (!pendingUpdates[orderId]) pendingUpdates[orderId] = {};
    Object.assign(pendingUpdates[orderId], updates);

    closeModal('orderDetailModal');
    updateBatchUI();
    renderOrders(currentOrders);
}

// ----------------------
// 商品管理
// ----------------------
function fetchProducts(force = false) {
    const tbody = document.getElementById('productsTableBody');
    if (!force) tbody.innerHTML = '<tr><td colspan="11" class="loading-cell">載入中...</td></tr>';

    callApi('getProductsAdmin', { _t: Date.now() })
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

    tbody.innerHTML = displayProducts.map(p => {
        const profit = (p.price || 0) - (p.cost || 0);
        // 如果有多張圖片，只顯示第一張
        const imageUrl = (p.image || "").split(',')[0].trim();

        return `
        <tr class="${p._isModified ? 'row-modified' : ''}" data-id="${p.id}">
            <td style="cursor:move; text-align:center; color:#999;">☰</td>
            <td><img src="${imageUrl}" class="table-thumb" style="width:40px;height:40px;object-fit:cover;vertical-align:middle;"></td>
            <td>${p.name} ${p._isNew ? '(新)' : ''}</td>
            <td>${p.price}</td>
            <td style="color: #888;">${p.cost || 0}</td>
            <td style="color: #28a745; font-weight: 500;">${profit}</td>
            <td style="color: #aaa; font-size:0.9em;">₩${p.priceKrw || 0}</td>
            <td>${p.stock}</td>
            <td>${p.status}</td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="action-btn" onclick="openProductModal('${p.id || ''}')">編輯</button>
                    <button class="action-btn btn-danger" onclick="confirmDeleteProduct('${p.id || ''}')">刪除</button>
                </div>
            </td>
        </tr>
    `}).join('');

    enableProductDragAndDrop();
}

// 載入現有品牌列表 (用於自動完成)
function loadBrandList() {
    // 從 currentProducts 提取所有不重複的品牌
    const brands = new Set();

    currentProducts.forEach(p => {
        if (p.brand && p.brand.trim()) {
            brands.add(p.brand.trim());
        }
    });

    // 更新 datalist
    const datalist = document.getElementById('brandList');
    if (datalist) {
        datalist.innerHTML = Array.from(brands)
            .sort()
            .map(brand => `<option value="${brand}">`)
            .join('');
    }
}

// 商品拖曳排序變數
let dragSrcEl = null;

function enableProductDragAndDrop() {
    const rows = document.querySelectorAll('#productsTableBody tr');
    rows.forEach(row => {
        row.setAttribute('draggable', true);
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragover', handleDragOver);
        row.addEventListener('drop', handleDrop);
        // row.addEventListener('dragenter', handleDragEnter);
        // row.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    if (dragSrcEl !== this) {
        // 交換資料 (簡單的視覺交換，真正順序要看 currentProducts)
        // 但我們需要更新 currentProducts 的順序以符合 DOM
        const tbody = document.getElementById('productsTableBody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const srcIndex = rows.indexOf(dragSrcEl);
        const dstIndex = rows.indexOf(this);

        // 移動 array 元素
        const item = currentProducts[srcIndex];
        currentProducts.splice(srcIndex, 1);
        currentProducts.splice(dstIndex, 0, item);

        renderProducts(currentProducts); // 重新渲染確保正確

        // 顯示排序儲存按鈕，或者直接啟用 "儲存變更" (但那是儲存內容)
        // 我們可以在 "儲存商品變更" 區域增加一個 "儲存排序" 按鈕？
        // 或者直接讓 "儲存商品變更" 也包含排序 (比較複雜，因為那是 updateProductsBatch)
        // 建議新增一個 "儲存排序" 按鈕，或者在拖曳後這顯示提示。
        showUnsavedSortWarning();
    }

    dragSrcEl.classList.remove('dragging');
    return false;
}

function showUnsavedSortWarning() {
    // 我們可以複用 unsavedProductsMsg，或者新增一個
    const msg = document.getElementById('unsavedProductsMsg');
    if (msg) {
        msg.textContent = '⚠️ 排序已變更，請點擊「儲存排序」';
        // 我們動態新增一個按鈕? 或者檢查有沒有存排序按鈕
        let sortBtn = document.getElementById('saveSortBtn');
        if (!sortBtn) {
            const container = document.getElementById('productBatchActions');
            sortBtn = document.createElement('button');
            sortBtn.id = 'saveSortBtn';
            sortBtn.textContent = '💾 儲存排序';
            sortBtn.className = 'accent-btn';
            sortBtn.style.marginLeft = '10px';
            sortBtn.style.backgroundColor = '#17a2b8'; // 不同顏色
            sortBtn.onclick = saveProductSortOrder;
            container.appendChild(sortBtn);
        }
    }
}

async function saveProductSortOrder() {
    const btn = document.getElementById('saveSortBtn');
    btn.disabled = true;
    btn.textContent = '儲存中...';

    const orderedIds = currentProducts.map(p => p.id);

    try {
        const result = await callApi('reorderProducts', { orderedIds: orderedIds });
        if (result.success) {
            alert('排序已儲存！');
            btn.remove(); // 移除按鈕
            const msg = document.getElementById('unsavedProductsMsg');
            if (msg) msg.textContent = '';
        } else {
            alert('儲存排序失敗: ' + result.error);
            btn.disabled = false;
        }
    } catch (e) {
        alert('儲存排序錯誤');
        btn.disabled = false;
    }
}

function openProductModal(productId = null) {
    const form = document.getElementById('productForm');
    form.reset();

    document.getElementById('prodId').value = '';
    document.getElementById('prodExchangeRate').value = '';
    document.getElementById('prodBrand').value = '';

    // 載入品牌列表
    loadBrandList();

    // 嘗試從 pending 或 current 找
    let p = null;

    // 重置圖片狀態
    modalImages = [];
    document.getElementById('imagePreviewContainer').innerHTML = '';
    document.getElementById('uploadImagesBtn').style.display = 'none';

    if (productId) {
        // 先找 pending
        p = pendingProductUpdates.find(x => String(x.id) === String(productId));
        // 再找 current
        if (!p) p = currentProducts.find(x => String(x.id) === String(productId));

        if (p) {
            document.getElementById('prodId').value = p.id;
            document.getElementById('prodName').value = p.name;
            document.getElementById('prodCategory').value = p.category;
            document.getElementById('prodBrand').value = p.brand || '';
            document.getElementById('prodPrice').value = p.price;
            document.getElementById('prodCost').value = p.cost;
            document.getElementById('prodPriceKrw').value = p.priceKrw || 0;
            document.getElementById('prodStock').value = p.stock;
            document.getElementById('prodStatus').value = p.status;
            document.getElementById('prodDesc').value = p.description;

            // 處理現有圖片
            let imgVal = p.image || '';
            if (imgVal) {
                const urls = imgVal.split(',').filter(url => url.trim() !== '');
                modalImages = urls.map(url => ({ type: 'existing', value: url }));
                document.getElementById('prodImage').value = imgVal;
            } else {
                document.getElementById('prodImage').value = '';
            }

            // 渲染預覽 (包含現有圖片)
            renderImagePreviews();

            // 處理規格產生器
            renderSpecBuilder(p.options || {});
        }
    } else {
        document.getElementById('prodImage').value = '';
        renderSpecBuilder({});
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

async function handleProductSubmit(e) {
    e.preventDefault();

    const submitBtn = document.querySelector('#productForm button[type="submit"]');
    const originalBtnText = submitBtn.textContent;

    try {
        // 分離現有圖片和待上傳圖片
        const existingImages = modalImages.filter(img => img.type === 'existing').map(img => img.value);
        const newImagesToUpload = modalImages.filter(img => img.type === 'new').map(img => img.value);

        // 如果只有現有圖片且順序變了，我們直接更新 prodImage 以供之後儲存
        document.getElementById('prodImage').value = existingImages.join(',');

        submitBtn.textContent = '儲存中...';

        const productId = document.getElementById('prodId').value;
        const options = getSpecData();

        // 建立 Product 物件
        const isNew = !productId;
        const tempId = isNew ? 'NEW_' + Date.now() : productId;

        const productData = {
            id: tempId,
            name: document.getElementById('prodName').value,
            category: document.getElementById('prodCategory').value,
            brand: document.getElementById('prodBrand').value.trim() || '',
            price: Number(document.getElementById('prodPrice').value),
            cost: Number(document.getElementById('prodCost').value),
            priceKrw: Number(document.getElementById('prodPriceKrw').value),
            stock: Number(document.getElementById('prodStock').value),
            status: document.getElementById('prodStatus').value,
            description: document.getElementById('prodDesc').value,
            image: document.getElementById('prodImage').value,
            modalImages: [...modalImages], // 保存完整順序資訊供上傳時參考
            newImages: newImagesToUpload, // 暫存待上傳檔案 (相容舊邏輯)
            options: options
        };

        // 更新 Pending Queue
        pendingProductUpdates = pendingProductUpdates.filter(p => String(p.id) !== String(tempId));
        pendingProductUpdates.push(productData);

        // 關閉 Modal 並更新 UI
        closeModal('productModal');
        updateProductBatchUI();
        renderProducts(currentProducts);

    } catch (error) {
        console.error('儲存失敗:', error);
        alert('儲存失敗: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
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


// 商品批次儲存
// 商品批次儲存
async function saveProductBatchChanges() {
    if (pendingProductUpdates.length === 0) {
        alert('沒有待儲存的商品變更');
        return;
    }

    const confirmMsg = `確定要儲存 ${pendingProductUpdates.length} 筆商品的變更嗎？`;
    if (!confirm(confirmMsg)) return;

    const btn = document.querySelector('#productBatchActions button');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '處理中...';
    }

    try {
        // 先處理圖片上傳
        const totalItems = pendingProductUpdates.length;

        for (let i = 0; i < totalItems; i++) {
            const item = pendingProductUpdates[i];

            if (item.modalImages && item.modalImages.some(img => img.type === 'new')) {
                btn.textContent = `正在上傳 ${item.name} 的圖片...`;

                const brand = item.brand || 'default';

                // 逐一處理 modalImages
                for (let j = 0; j < item.modalImages.length; j++) {
                    const img = item.modalImages[j];
                    if (img.type === 'new') {
                        const file = img.value;
                        try {
                            const base64 = await fileToBase64(file);
                            const base64Content = base64.split(',')[1];
                            const result = await callApi('uploadImageToGitHub', {
                                fileName: file.name,
                                content: base64Content,
                                mimeType: file.type,
                                brand: brand
                            });
                            if (result.success && result.data.url) {
                                img.type = 'existing';
                                img.value = result.data.url;
                            }
                        } catch (e) { console.error(e); }
                    }
                }

                // 根據最終的 modalImages 組合 URL
                item.image = item.modalImages
                    .filter(img => img.type === 'existing')
                    .map(img => img.value)
                    .join(',');

                delete item.modalImages;
                delete item.newImages;
            }
        }

        btn.textContent = '儲存商品資料中...';

        // 將 NEW_ ID 清除，讓後端生成
        const updates = pendingProductUpdates.map(p => {
            const pCopy = { ...p };
            delete pCopy.newImages; // 確保不傳送 File 物件到後端

            if (String(pCopy.id).startsWith('NEW_')) {
                return { ...pCopy, id: null };
            }
            return pCopy;
        });

        const data = await callApi('updateProductsBatch', { updates: updates });

        if (data.success) {
            pendingProductUpdates.forEach(update => {
                // 略過新增的商品
                if (String(update.id).startsWith('NEW_')) return;

                const index = currentProducts.findIndex(p => String(p.id) === String(update.id));
                if (index !== -1) {
                    currentProducts[index] = { ...currentProducts[index], ...update };
                }
            });

            alert(`成功儲存 ${pendingProductUpdates.length} 筆商品的變更！`);
            pendingProductUpdates = [];
            updateProductBatchUI();
            renderProducts(currentProducts);

            setTimeout(() => fetchProducts(true), 100);
        } else {
            alert('儲存失敗：' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('儲存過程中發生錯誤：' + err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 儲存所有變更';
        }
    }
}

function formatCurrency(num) {
    if (typeof num === 'string') {
        // 移除所有非數字字符 (除了小數點和負號)
        const parsed = parseFloat(num.replace(/[^\d.-]/g, ''));
        if (!isNaN(parsed)) num = parsed;
    }
    return 'NT$ ' + (Number(num) || 0).toLocaleString();
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// ----------------------
// 圖片上傳到 GitHub
// ----------------------
let modalImages = []; // 統一管理的圖片陣列 {type: 'existing'|'new', value: url|File, preview?: base64}

function handleImageSelect(event) {
    const files = Array.from(event.target.files);

    // 檢查檔案
    const validFiles = files.filter(file => {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!validTypes.includes(file.type)) {
            alert(`${file.name} 格式不支援，請使用 JPG, PNG 或 WEBP`);
            return false;
        }

        if (file.size > maxSize) {
            alert(`${file.name} 檔案過大，請小於 5MB`);
            return false;
        }

        return true;
    });

    if (validFiles.length === 0) return;

    validFiles.forEach(file => {
        modalImages.push({ type: 'new', value: file });
    });

    renderImagePreviews();
    document.getElementById('uploadImagesBtn').style.display = 'block';
}

let imageDragSrcIndex = null;

function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';

    modalImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = `image-preview-item ${img.type}`;
        div.setAttribute('draggable', true);
        div.dataset.index = index;

        // 事件監聽
        div.addEventListener('dragstart', handleImageDragStart);
        div.addEventListener('dragover', handleImageDragOver);
        div.addEventListener('drop', handleImageDragDrop);

        const imgEl = document.createElement('img');
        if (img.type === 'existing') {
            imgEl.src = img.value;
        } else {
            // 對於新檔案，如果還沒產生預覽圖就產生
            if (!img.preview) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.preview = e.target.result;
                    imgEl.src = img.preview;
                };
                reader.readAsDataURL(img.value);
            } else {
                imgEl.src = img.preview;
            }
        }

        div.appendChild(imgEl);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeModalImage(index);
        };
        div.appendChild(removeBtn);

        container.appendChild(div);
    });
}

function handleImageDragStart(e) {
    imageDragSrcIndex = parseInt(this.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleImageDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    return false;
}

function handleImageDragDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    const targetIndex = parseInt(this.dataset.index);
    if (imageDragSrcIndex !== targetIndex) {
        const item = modalImages[imageDragSrcIndex];
        modalImages.splice(imageDragSrcIndex, 1);
        modalImages.splice(targetIndex, 0, item);
        renderImagePreviews();

        // 更新隱藏的 prodImage (僅限現有的)
        const existing = modalImages.filter(i => i.type === 'existing').map(i => i.value);
        document.getElementById('prodImage').value = existing.join(',');
    }
    return false;
}

function removeModalImage(index) {
    modalImages.splice(index, 1);
    renderImagePreviews();

    // 更新現有的
    const existing = modalImages.filter(i => i.type === 'existing').map(i => i.value);
    document.getElementById('prodImage').value = existing.join(',');

    if (!modalImages.some(img => img.type === 'new')) {
        document.getElementById('uploadImagesBtn').style.display = 'none';
    }
}

async function uploadImagesToGitHub() {
    if (selectedImages.length === 0) {
        alert('請先選擇圖片');
        return;
    }

    const btn = document.getElementById('uploadImagesBtn');
    const btnText = document.getElementById('uploadBtnText');
    const originalText = btnText.textContent;

    // 取得品牌資訊
    const brand = document.getElementById('prodBrand').value.trim() || 'default';

    btn.disabled = true;
    btnText.textContent = '上傳中... 0%';

    const uploadedUrls = [];

    try {
        for (let i = 0; i < modalImages.length; i++) {
            const img = modalImages[i];
            if (img.type === 'new') {
                const file = img.value;
                btnText.textContent = `上傳中... ${Math.round((i / modalImages.length) * 100)}%`;

                // 轉換為 Base64
                const base64 = await fileToBase64(file);
                const base64Content = base64.split(',')[1];

                const result = await callApi('uploadImageToGitHub', {
                    fileName: file.name,
                    content: base64Content,
                    mimeType: file.type,
                    brand: brand
                });

                if (result.success && result.data.url) {
                    img.type = 'existing';
                    img.value = result.data.url;
                } else {
                    throw new Error(result.error || '上傳失敗');
                }
            }
        }

        // 成功：合併 URL
        const allUrls = modalImages.filter(i => i.type === 'existing').map(i => i.value).join(',');
        document.getElementById('prodImage').value = allUrls;

        // 清空新選擇
        btn.style.display = 'none';

        alert(`圖片上傳並排序完成！`);
        renderImagePreviews();

    } catch (error) {
        console.error('上傳失敗:', error);
        alert('上傳失敗: ' + error.message);
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 拖放支援
document.addEventListener('DOMContentLoaded', () => {
    // ... 原有的 DOMContentLoaded 邏輯 ...

    // 加入拖放支援
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => {
                uploadZone.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => {
                uploadZone.classList.remove('drag-over');
            }, false);
        });

        uploadZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            document.getElementById('imageFileInput').files = files;
            handleImageSelect({ target: { files: files } });
        }, false);
    }
});

// 側邊欄切換 (桌面收合 / 手機展開)
function toggleSidebar() {
    const isMobile = window.innerWidth <= 1024;
    const dashboard = document.getElementById('dashboardPage');
    const sidebar = document.querySelector('.sidebar');

    if (isMobile) {
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
    } else {
        // 桌面版：收合
        dashboard.classList.toggle('sidebar-collapsed');
        // 加入動畫監聽，在動畫結束後通知 PageBuilder 更新比例
        setTimeout(() => {
            if (typeof PageBuilder !== 'undefined' && PageBuilder.updatePreviewScale) {
                PageBuilder.updatePreviewScale();
            }
        }, 310); // 略長於 CSS transition 300ms
    }
}

// 桌面版側邊欄縮合專用函數
function toggleDesktopSidebar() {
    const dashboard = document.getElementById('dashboardPage');
    if (!dashboard) return;

    // 只在桌面版生效
    if (window.innerWidth <= 1024) return;

    dashboard.classList.toggle('sidebar-collapsed');

    // 保存縮合狀態到 localStorage
    const isCollapsed = dashboard.classList.contains('sidebar-collapsed');
    localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');

    // 更新按鈕圖示
    const collapseBtn = document.querySelector('.sidebar-collapse-btn');
    if (collapseBtn) {
        collapseBtn.innerHTML = isCollapsed ? '⟩' : '⟨';
        collapseBtn.title = isCollapsed ? '展開選單' : '收合選單';
    }

    // 動畫結束後通知 PageBuilder 更新比例
    setTimeout(() => {
        if (typeof PageBuilder !== 'undefined' && PageBuilder.updatePreviewScale) {
            PageBuilder.updatePreviewScale();
        }
    }, 310);
}

// 初始化時恢復側邊欄縮合狀態
document.addEventListener('DOMContentLoaded', () => {
    const savedCollapsed = localStorage.getItem('sidebar_collapsed');
    if (savedCollapsed === 'true' && window.innerWidth > 1024) {
        const dashboard = document.getElementById('dashboardPage');
        if (dashboard) {
            dashboard.classList.add('sidebar-collapsed');
            const collapseBtn = document.querySelector('.sidebar-collapse-btn');
            if (collapseBtn) {
                collapseBtn.innerHTML = '⟩';
                collapseBtn.title = '展開選單';
            }
        }
    }
});

// ----------------------
// 刪除操作
// ----------------------
async function confirmDeleteOrder(orderId) {
    if (!confirm(`確定要刪除訂單 ${orderId} 嗎？此操作不可還原！`)) return;

    try {
        showToast(`正在刪除訂單 ${orderId}...`);
        const result = await callApi('deleteOrder', { orderId: orderId });
        if (result.success) {
            showToast('訂單已刪除', 'success');
            refreshData(); // 重新整理列表
        } else {
            alert('刪除失敗: ' + result.error);
        }
    } catch (e) {
        console.error(e);
        alert('刪除發生錯誤');
    }
}

async function confirmDeleteProduct(productId) {
    if (!productId || productId.startsWith('NEW_')) {
        // 如果是尚未儲存的新商品，直接從暫存移除
        if (confirm('確定要移除此待儲存商品嗎？')) {
            pendingProductUpdates = pendingProductUpdates.filter(p => String(p.id) !== String(productId));
            updateProductBatchUI();
            renderProducts(currentProducts);
            showToast('已移除待儲存商品', 'info');
        }
        return;
    }

    if (!confirm(`確定要刪除商品 ID: ${productId} 嗎？此操作不可還原！`)) return;

    try {
        showToast(`正在刪除商品 ${productId}...`);
        const result = await callApi('deleteProduct', { productId: productId });
        if (result.success) {
            showToast('商品已刪除', 'success');
            fetchProducts(true); // 重新整理列表
        } else {
            alert('刪除失敗: ' + result.error);
        }
    } catch (e) {
        console.error(e);
        alert('刪除發生錯誤');
    }
}

// ----------------------
// 手動訂單管理
// ----------------------
let currentEditingOrderId = null;
let tempOrderItems = [];

function openCreateOrderModal() {
    currentEditingOrderId = null;
    tempOrderItems = [];

    // 確保商品已載入
    if (currentProducts.length === 0) {
        alert('正在載入商品資料，請稍後再試');
        fetchProducts();
        return;
    }

    console.log('建立新訂單，可用商品數:', currentProducts.length);

    document.getElementById('detailOrderId').textContent = '(新訂單)';
    document.getElementById('detailName').value = '';
    document.getElementById('detailPhone').value = '';
    document.getElementById('detailEmail').value = '';
    document.getElementById('detailLine').value = '';
    document.getElementById('detailShipping').value = '7-11店到店';
    document.getElementById('detailStoreName').value = '';
    document.getElementById('detailStoreCode').value = '';
    document.getElementById('detailStoreAddress').value = '';
    document.getElementById('detailNote').value = '';

    renderOrderItems();
    loadProductSuggestions();

    // 設定最下方的提交按鈕
    const saveBtn = document.querySelector('#orderDetailModal .modal-actions .accent-btn');
    if (saveBtn) {
        saveBtn.textContent = '建立訂單';
        saveBtn.onclick = () => submitManualOrder();
    }

    openModal('orderDetailModal');
}

function loadProductSuggestions() {
    const datalist = document.getElementById('productSuggestions');
    if (!datalist) return;

    datalist.innerHTML = currentProducts.map(p =>
        `<option value="${p.name}">${p.name} - NT$ ${p.price}</option>`
    ).join('');

    console.log('載入商品建議:', currentProducts.length, '個商品');
}

function filterProducts(query) {
    // datalist 會自動過濾，不需要手動實作
}

function updateShippingFee() {
    const shippingMethod = document.getElementById('detailShipping').value;
    const feeInput = document.getElementById('detailShippingFee');

    // 如果是手動修改過的，也許我們不該覆蓋？
    // 但如果使用者切換運送方式，通常期望運費跟著變。
    // 所以策略是：切換運送方式時，總是更新為該方式的預設值。

    if (shippingMethod === '7-11店到店') {
        feeInput.value = 60;
    } else {
        // 限台中市面交 或其他
        feeInput.value = 0;
    }

    updateTotal();
}

function updateTotal() {
    const itemsTotal = tempOrderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const shippingFee = parseInt(document.getElementById('detailShippingFee').value) || 0;
    const total = itemsTotal + shippingFee;

    document.getElementById('detailTotal').textContent = total;
}

function openAddProductToOrder() {
    const area = document.getElementById('addProductArea');
    if (!area) {
        console.error('找不到 addProductArea');
        return;
    }

    // 重新載入商品清單
    loadProductSuggestions();

    // 重置表單
    const select = document.getElementById('productSearch');
    if (select) select.value = '';

    const qtyInput = document.getElementById('productQty');
    if (qtyInput) qtyInput.value = 1;

    // 顯示區域
    area.style.display = 'block';

    console.log('開啟新增商品區域，商品數量:', currentProducts.length);
}

function cancelAddProduct() {
    const area = document.getElementById('addProductArea');
    if (area) {
        area.style.display = 'none';
    }
}

function addProductToOrderItems() {
    const select = document.getElementById('productSearch');
    const productName = select.value.trim();
    const qty = parseInt(document.getElementById('productQty').value) || 1;
    // 取得選取的規格
    const specSelect = document.getElementById('productSpec');
    const spec = (specSelect && specSelect.style.display !== 'none') ? specSelect.value : '';

    console.log('嘗試新增商品:', productName, '規格:', spec, '數量:', qty);

    if (!productName) {
        alert('請選擇商品');
        return;
    }

    const product = currentProducts.find(p => p.name === productName);
    if (!product) {
        alert('找不到此商品');
        return;
    }

    // 檢查規格是否必選
    if (specSelect && specSelect.style.display !== 'none' && !spec && specSelect.options.length > 1) {
        // 如果有規格選項但沒選 (排除只有"無"的情況)
        // 這裡我們先允許空規格，如果使用者不選的話。或者強制選?
        // 通常最好強制選，或者預設選第一個。
    }

    // 檢查是否已存在 (同名稱且同規格)
    const existing = tempOrderItems.find(item => item.name === productName && (item.spec || '') === spec);
    if (existing) {
        existing.qty += qty;
        existing.subtotal = existing.price * existing.qty;
        console.log('更新現有商品數量');
    } else {
        tempOrderItems.push({
            name: product.name,
            spec: spec,
            qty: qty,
            price: product.price,
            subtotal: product.price * qty
        });
        console.log('新增商品到列表');
    }

    console.log('目前商品列表:', tempOrderItems);

    // 立即更新顯示
    renderOrderItems();

    // 清空輸入
    select.value = '';
    document.getElementById('productQty').value = 1;
    if (document.getElementById('specSelectGroup')) {
        document.getElementById('specSelectGroup').style.display = 'none';
    }
}

// 處理商品輸入變更
function handleProductSearchInput() {
    const searchInput = document.getElementById('productSearch');
    if (!searchInput) return;

    const val = searchInput.value.trim(); // 去除前後空白
    // console.log('商品搜尋輸入:', val); // 減少 log

    // 嘗試找到商品：名稱完全匹配 或 包含 (如果不只一個，取第一個完全匹配的，或第一個包含的)
    let product = currentProducts.find(p => p.name.trim() === val);

    // 如果沒找到，試試看是否包含 (例如用戶只打部分名稱)
    // 但只有當用戶選中時才應該顯示規格，所以我們應該盡量精確。
    // 用戶反饋 "沒有規格選項"，可能是名稱有一些不可見字符？
    if (!product) {
        // 嘗試更寬鬆的匹配 (Case insensitive)
        product = currentProducts.find(p => p.name.trim().toLowerCase() === val.toLowerCase());
    }

    const specGroup = document.getElementById('specSelectGroup');
    const specSelect = document.getElementById('productSpec');

    if (product) {
        // console.log('找到商品:', product.name, product.options);
        // ... (rest logic)

        if (product && specGroup && specSelect) {
            let options = [];
            try {
                if (Array.isArray(product.options)) {
                    options = product.options;
                } else if (typeof product.options === 'object' && product.options !== null) {
                    // 處理 Object 格式: { "款式": ["黑色", "粉色"] }
                    options = Object.entries(product.options).map(([name, values]) => ({
                        name: name,
                        values: Array.isArray(values) ? values : [values]
                    }));
                } else if (typeof product.options === 'string' && product.options.trim() !== '') {
                    const parsed = JSON.parse(product.options);
                    if (Array.isArray(parsed)) {
                        options = parsed;
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        options = Object.entries(parsed).map(([name, values]) => ({
                            name: name,
                            values: Array.isArray(values) ? values : [values]
                        }));
                    }
                }
            } catch (e) {
                console.error('規格解析失敗', e, product.options);
                options = [];
            }

            console.log('解析後的規格選項:', options);

            if (options && options.length > 0) {
                // 清空舊選項
                specSelect.innerHTML = '<option value="">請選擇規格</option>';

                let hasSpecs = false;
                options.forEach(opt => {
                    if (opt && opt.values && Array.isArray(opt.values)) {
                        opt.values.forEach(val => {
                            const optionText = `${opt.name}: ${val}`;
                            const option = document.createElement('option');
                            option.value = optionText;
                            option.textContent = optionText;
                            specSelect.appendChild(option);
                            hasSpecs = true;
                        });
                    }
                });

                if (hasSpecs) {
                    specGroup.style.display = 'block';
                    console.log('顯示規格選單');
                } else {
                    specGroup.style.display = 'none';
                    console.log('無有效規格選項，隱藏選單');
                }
            } else {
                specGroup.style.display = 'none';
            }
        } else if (specGroup) {
            specGroup.style.display = 'none';
        }
    }
}

// 監聽商品輸入變更，動態顯示規格
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', handleProductSearchInput);
        searchInput.addEventListener('change', handleProductSearchInput);
    }
});

function removeOrderItem(index) {
    if (confirm('確定刪除此商品？')) {
        tempOrderItems.splice(index, 1);
        renderOrderItems();
    }
}

function renderOrderItems() {
    const tbody = document.getElementById('detailItemsBody');
    console.log('renderOrderItems 被調用，商品數量:', tempOrderItems.length);

    if (tempOrderItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">尚未新增商品</td></tr>';
        document.getElementById('detailShippingFee').value = 0;
        document.getElementById('detailTotal').textContent = 0;
        return;
    }

    tbody.innerHTML = tempOrderItems.map((item, index) => `
        <tr>
            <td>${item.name}</td>
            <td>${item.spec || '-'}</td>
            <td>${item.qty}</td>
            <td>${formatCurrency(item.subtotal)}</td>
            <td><button class="action-btn" onclick="removeOrderItem(${index})" style="background:#dc3545;color:white;">刪除</button></td>
        </tr>
    `).join('');

    // 更新總計
    updateTotal();

    console.log('商品明細已更新');
    // 全局重新整理
    function refreshData() {
        const btn = document.querySelector('.refresh-btn');
        if (btn) btn.disabled = true;

        Promise.all([
            fetchOrders(true),
            fetchProducts(true)
        ]).then(() => {
            showToast('資料已更新', 'success');
        }).catch(err => {
            console.error(err);
            showToast('更新失敗', 'error');
        }).finally(() => {
            if (btn) btn.disabled = false;
        });
    }
    // 確保新增商品區域狀態正確
    const addArea = document.getElementById('addProductArea');
    if (addArea && addArea.style.display === 'block') {
        // 如果正在新增，保持開啟
    } else if (addArea) {
        addArea.style.display = 'none';
    }
}

function submitManualOrder() {
    if (tempOrderItems.length === 0) {
        alert('請至少新增一個商品');
        return;
    }

    const customerName = document.getElementById('detailName').value.trim();
    const customerPhone = document.getElementById('detailPhone').value.trim();

    if (!customerName || !customerPhone) {
        alert('請填寫客戶姓名和電話');
        return;
    }

    const orderData = {
        customer: {
            name: customerName,
            phone: customerPhone,
            email: document.getElementById('detailEmail').value.trim(),
            lineId: document.getElementById('detailLine').value.trim()
        },
        shipping: {
            method: document.getElementById('detailShipping').value,
            storeName: document.getElementById('detailStoreName').value.trim(),
            storeCode: document.getElementById('detailStoreCode').value.trim(),
            address: document.getElementById('detailStoreAddress').value.trim(),
            fee: parseInt(document.getElementById('detailShippingFee').value) || 0
        },
        items: tempOrderItems,
        total: parseInt(document.getElementById('detailTotal').textContent),
        note: document.getElementById('detailNote').value.trim()
    };

    const btn = document.querySelector('#orderDetailModal .accent-btn');
    btn.disabled = true;
    btn.textContent = '建立中...';

    callApi('createManualOrder', { orderData: orderData })
        .then(data => {
            if (data.success) {
                alert('訂單建立成功！訂單編號：' + data.data.orderId);
                closeModal('orderDetailModal');
                refreshData();
            } else {
                alert('建立失敗：' + data.error);
                btn.disabled = false;
                btn.textContent = '建立訂單';
            }
        })
        .catch(err => {
            alert('建立失敗：' + err);
            btn.disabled = false;
            btn.textContent = '建立訂單';
        });
}

// ----------------------
// 網站設定
// ----------------------
let currentSettings = {};

function loadSiteSettings() {
    const container = document.getElementById('settingsForm');
    container.innerHTML = '<div class="loading">載入設定中...</div>';

    callApi('getSiteSettings')
        .then(data => {
            if (data.success) {
                currentSettings = data.data.settings;
                renderSettingsForm(currentSettings);
            } else {
                container.innerHTML = `<div class="error">載入失敗: ${data.error}</div>`;
            }
        })
        .catch(err => {
            container.innerHTML = `<div class="error">載入失敗: ${err}</div>`;
        });
}

function renderSettingsForm(settings) {
    const container = document.getElementById('settingsForm');

    // Define known keys for better UI, others will be generic inputs
    const knownKeys = {
        'announcementTitle': '公告標題',
        'announcementContent': '公告內容',
        'heroImage': '首頁大圖 URL',
        'footerInfo': '頁尾資訊 (HTML)' // Although user asked for "page management", this is a simple key-value store
    };

    let html = '<div class="settings-grid" style="display: grid; gap: 15px;">';

    // Render known keys first
    Object.keys(knownKeys).forEach(key => {
        const val = settings[key] || '';
        html += `
            <div class="form-group">
                <label style="font-weight:bold; display:block; margin-bottom:5px;">${knownKeys[key]} <small style="color:#888">(${key})</small></label>
                <input type="text" class="setting-input" data-key="${key}" value="${val.replace(/"/g, '&quot;')}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            </div>
        `;
    });

    // Render other keys
    Object.keys(settings).forEach(key => {
        if (!knownKeys[key] && key !== 'Key' && key !== 'Value') {
            const val = settings[key];
            html += `
            <div class="form-group">
                <label style="font-weight:bold; display:block; margin-bottom:5px;">${key}</label>
                <input type="text" class="setting-input" data-key="${key}" value="${val}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            </div>
            `;
        }
    });

    html += '</div>';

    // Add "Add New Setting" button? Maybe later.

    container.innerHTML = html;
}

function saveSiteSettings() {
    const inputs = document.querySelectorAll('.setting-input');
    const newSettings = {};

    inputs.forEach(input => {
        newSettings[input.dataset.key] = input.value;
    });

    const btn = document.querySelector('#settingsView .accent-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '儲存中...';

    callApi('saveSiteSettings', { settings: newSettings })
        .then(data => {
            if (data.success) {
                showToast('網站設定已儲存', 'success');
                currentSettings = newSettings;
            } else {
                alert('儲存失敗: ' + data.error);
            }
        })
        .catch(err => {
            alert('儲存失敗: ' + err);
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = originalText;
        });
}

// ----------------------------------------------------
// 採買統計
// ----------------------------------------------------

async function loadPurchasingStats() {
    const startDate = document.getElementById('statsStartDate').value;
    const endDate = document.getElementById('statsEndDate').value;

    if (!startDate || !endDate) {
        showToast('請選擇日期範圍', 'error');
        return;
    }

    const tbody = document.getElementById('purchasingStatsBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">計算中...</td></tr>';

    try {
        const result = await callApi('getPurchasingStats', { startDate, endDate });
        if (result.success) {
            renderPurchasingStats(result.data.stats);
        } else {
            showToast('採買統計載入失敗: ' + result.error, 'error');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red">載入失敗</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red">連線錯誤</td></tr>';
    }
}

function renderPurchasingStats(stats) {
    const tbody = document.getElementById('purchasingStatsBody');
    const totalTypesEl = document.getElementById('statsTotalTypes');
    const totalQtyEl = document.getElementById('statsTotalQty');

    if (!stats || stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">此期間無訂單資料</td></tr>';
        totalTypesEl.textContent = '0';
        totalQtyEl.textContent = '0';
        return;
    }

    let totalQty = 0;
    let html = '';

    stats.forEach((item, index) => {
        totalQty += item.totalQty;
        const detailRows = item.details.map(d => `
            <div style="font-size: 0.85em; padding: 4px 0; border-bottom: 1px dashed #eee; display: flex; justify-content: space-between;">
                <span>• <strong>${d.customerName}</strong> (${d.orderId})：${d.qty} 件</span>
                <span style="color: #666;">[${d.status}] ${d.date}</span>
            </div>
        `).join('');

        html += `
            <tr onclick="togglePurchasingDetail(${index})" style="cursor: pointer;">
                <td><strong>${item.name}</strong></td>
                <td>${item.spec || '無規格'}</td>
                <td style="color: #e91e63; font-weight: bold; font-size: 1.1em">${item.totalQty}</td>
                <td>${item.orderCount} 筆 <span style="font-size: 0.8em; color: #999;">(點擊展開)</span></td>
            </tr>
            <tr id="purchasing-detail-${index}" style="display: none; background: #fffafb;">
                <td colspan="4">
                    <div style="padding: 10px 15px; border-left: 3px solid var(--accent);">
                        <div style="font-weight: bold; margin-bottom: 5px; font-size: 0.9em;">訂單明細：</div>
                        ${detailRows}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    totalTypesEl.textContent = stats.length;
    totalQtyEl.textContent = totalQty;
}

function togglePurchasingDetail(index) {
    const row = document.getElementById(`purchasing-detail-${index}`);
    if (row) {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
}

function setStatsShortcut(type) {
    const startInput = document.getElementById('statsStartDate');
    const endInput = document.getElementById('statsEndDate');
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (type === 'today') {
        startInput.value = today;
        endInput.value = today;
    } else if (type === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        startInput.value = yStr;
        endInput.value = yStr;
    } else if (type === '7days') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 6);
        startInput.value = sevenDaysAgo.toISOString().split('T')[0];
        endInput.value = today;
    }

    loadPurchasingStats();
}

function exportPurchasingStats() {
    const startDate = document.getElementById('statsStartDate').value;
    const endDate = document.getElementById('statsEndDate').value;
    const tbody = document.getElementById('purchasingStatsBody');
    const rows = tbody.querySelectorAll('tr');

    if (rows.length === 0 || rows[0].innerText.includes('無訂單') || rows[0].innerText.includes('請選擇')) {
        showToast('無資料可匯出', 'error');
        return;
    }

    let csvContent = "\ufeff商品名稱,規格/款式,採買數量,涉及訂單數\n";

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 4) {
            const name = cells[0].innerText.replace(/,/g, '');
            const spec = cells[1].innerText.replace(/,/g, '');
            const qty = cells[2].innerText;
            const orders = cells[3].innerText;
            csvContent += `${name},${spec},${qty},${orders}\n`;
        }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `採買清單_${startDate}_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('匯出成功');
}
function renderSpecBuilder(options = {}) {
    const container = document.getElementById('specBuilderContainer');
    if (!container) return;
    container.innerHTML = '';

    // options 可能格式: { "顏色": ["紅", "藍"] } 或 [ {name: "顏色", values: ["紅", "藍"]} ]
    let normalizedOptions = [];
    if (Array.isArray(options)) {
        normalizedOptions = options;
    } else if (typeof options === 'object' && options !== null) {
        normalizedOptions = Object.entries(options).map(([name, values]) => ({
            name: name,
            values: Array.isArray(values) ? values : [values]
        }));
    }

    if (normalizedOptions.length === 0) {
        // 預設給一個空的列
        addSpecGroup();
    } else {
        normalizedOptions.forEach(opt => {
            addSpecGroup(opt.name, opt.values.join(','));
        });
    }
}

function addSpecGroup(name = '', values = '') {
    const container = document.getElementById('specBuilderContainer');
    const div = document.createElement('div');
    div.className = 'spec-group-row';
    div.innerHTML = `
        <input type="text" placeholder="類別 (如：尺寸)" class="group-name" value="${name}">
        <input type="text" placeholder="選項用逗號分開 (如：S,M,L)" class="group-values" value="${values}">
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(div);
}

function getSpecData() {
    const container = document.getElementById('specBuilderContainer');
    const rows = container.querySelectorAll('.spec-group-row');
    const result = {};

    rows.forEach(row => {
        const name = row.querySelector('.group-name').value.trim();
        const values = row.querySelector('.group-values').value.trim();
        if (name && values) {
            result[name] = values.split(',').map(v => v.trim()).filter(v => v !== '');
        }
    });

    return result;
}
