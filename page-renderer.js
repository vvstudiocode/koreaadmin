/**
 * Modular Page Renderer (Visual Version)
 * Dynamically builds the homepage based on JSON layout.
 */
const PageRenderer = {
    init: async function () {
        console.log('🚀 PageRenderer Initialized');
        const container = document.getElementById('pageBuilderRoot');
        if (!container) return;

        // 1. 立即從快取讀取並渲染 (防止閃爍)
        const cachedLayout = localStorage.getItem('omo_cached_layout');
        if (cachedLayout) {
            try {
                this.render(container, JSON.parse(cachedLayout));
            } catch (e) { console.error('Cache parse error', e); }
        } else {
            // 如果沒快取，顯示載入狀態
            container.innerHTML = '<div class="section-container" style="padding: 100px 0; text-align: center; opacity: 0.5;">載入自訂排版中...</div>';
        }

        // 2. 非同步從後端獲取最新排版
        const layout = await this.fetchLayout();
        if (layout) {
            // 更新快取
            localStorage.setItem('omo_cached_layout', JSON.stringify(layout));
            // 重新渲染最新內容
            this.render(container, layout);
        }
    },

    fetchLayout: async function () {
        try {
            // 嘗試從全域獲取 API URL
            const apiUrl = typeof GAS_API_URL !== 'undefined' ? GAS_API_URL : '';
            if (!apiUrl) throw new Error('GAS_API_URL is not defined');

            // 如果在管理後台，直接使用現有的 callApi
            if (typeof callApi === 'function') {
                const result = await callApi('getSiteSettings');
                if (result.success && result.data.settings.homepage_layout) {
                    return JSON.parse(result.data.settings.homepage_layout);
                }
            } else {
                // 如果在前台，直接透過 fetch 取得 (假設後台支援 action=getSiteSettings 的 GET 請求)
                const response = await fetch(`${apiUrl}?action=getSiteSettings`);
                const result = await response.json();
                if (result.success && result.data.settings && result.data.settings.homepage_layout) {
                    return JSON.parse(result.data.settings.homepage_layout);
                }
            }
        } catch (err) {
            console.error('❌ PageRenderer: Failed to fetch layout:', err);
        }

        // 預設回退佈局 (在此直接更改即可同步至官網)
        return [
            { type: 'hero', title: 'Welcome to OMO Select', subtitle: 'Discover the best Korean products', image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80' },
            { type: 'categories' },
            { type: 'products', title: '精選推薦', category: '全部', limit: 8 },
            { type: 'product_list', title: '最新商品', category: '全部', limit: 20 }
        ];
    },

    render: async function (container, layout) {
        if (!container || !layout) return;
        container.innerHTML = '';

        for (const [index, comp] of layout.entries()) {
            const section = document.createElement('section');
            section.className = `page-section section-${comp.type}`;
            section.setAttribute('data-comp-index', index);

            switch (comp.type) {
                case 'hero':
                    section.innerHTML = this.templateHero(comp);
                    break;
                case 'categories':
                    section.innerHTML = this.templateCategories(comp);
                    break;
                case 'products':
                case 'product_list':
                    await this.renderProducts(section, comp);
                    break;
                case 'info_section':
                    section.innerHTML = this.templateInfoSection(comp);
                    break;
                case 'announcement':
                    section.innerHTML = this.templateAnnouncement(comp);
                    break;
            }
            container.appendChild(section);
        }

        // 重新觀察新加入的元素 (動畫)
        if (typeof observeElements === 'function') observeElements();
    },

    templateAnnouncement: function (comp) {
        return `
            <div class="announcement-bar" style="background-color: ${comp.bgColor || '#f3f4f6'}">
                <div class="announcement-content">
                    ✨ ${comp.text || '歡迎光臨 OMO Select！'} ✨
                </div>
            </div>
        `;
    },

    templateHero: function (comp) {
        return `
            <div class="hero-banner" style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.4)), url('${comp.image}')">
                <div class="hero-content">
                    <h1>${comp.title || ''}</h1>
                    <p>${comp.subtitle || ''}</p>
                    ${comp.buttonText ? `<a href="${comp.buttonLink || '#'}" class="cta-button">${comp.buttonText}</a>` : ''}
                </div>
            </div>
        `;
    },

    templateCategories: function (comp) {
        // 抓取現有分類 (假設全域有 categories 或從商店資料拿)
        const categories = ['全部', '美妝保養', '流行服飾', '生活用品', '零食食品'];
        const items = categories.map(cat => `
            <div class="category-pill" onclick="filterByCategory('${cat}')">
                <span>${cat}</span>
            </div>
        `).join('');

        return `
            <div class="section-container">
                ${comp.title ? `<div class="section-header"><h2>${comp.title}</h2></div>` : ''}
                <div class="category-scroll">
                    ${items}
                </div>
            </div>
        `;
    },

    templateProductList: function (comp) {
        return `
            <div class="section-container">
                <div class="section-header">
                    <h2>${comp.title || '精選商品'}</h2>
                    <a href="#" class="view-all">查看全部 →</a>
                </div>
                <div class="products-grid" id="grid-${Math.random().toString(36).substr(2, 9)}">
                    <div class="loading-spinner">載入中...</div>
                </div>
            </div>
        `;
    },

    templateInfoSection: function (comp) {
        return `
            <div class="section-container">
                <div class="info-grid">
                    <div class="info-image">
                        <img src="${comp.image}" alt="info">
                    </div>
                    <div class="info-text">
                        <h3>${comp.title || ''}</h3>
                        <p>${comp.subtitle || ''}</p>
                        ${comp.buttonText ? `<a href="${comp.buttonLink || '#'}" class="text-link">${comp.buttonText}</a>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderProducts: async function (section, comp) {
        section.innerHTML = `
            <div class="section-container">
                ${comp.title ? `<h2 class="section-title">${comp.title}</h2>` : ''}
                <div class="products-grid">
                    <div class="loading">載入商品中...</div>
                </div>
            </div>
        `;
        const grid = section.querySelector('.products-grid');
        if (!grid) return;

        try {
            // 兼容性處理：在後台使用 currentProducts，在前端使用 products
            let allProducts = typeof products !== 'undefined' ? products : (typeof currentProducts !== 'undefined' ? currentProducts : []);

            // 確保資料已加載
            if (allProducts.length === 0) {
                if (typeof loadProducts === 'function') {
                    await loadProducts();
                    allProducts = products;
                } else if (typeof fetchProducts === 'function') {
                    await fetchProducts(); // 管理後台的函數
                    allProducts = typeof currentProducts !== 'undefined' ? currentProducts : [];
                }
            }

            let filtered = allProducts;
            if (comp.category && comp.category !== '全部') {
                filtered = allProducts.filter(p => p.category === comp.category);
            }

            const limit = parseInt(comp.limit) || 4;
            const display = filtered.slice(0, limit);

            grid.innerHTML = '';
            if (display.length === 0) {
                grid.innerHTML = '<div class="empty-msg">此分類暫無商品</div>';
                return;
            }

            display.forEach(p => {
                // 確保 p.id 存在且 p.image 是字串
                if (!p.id) p.id = 'PID-' + Math.random().toString(36).substr(2, 5);
                const card = this.createFallbackProductCard(p);
                grid.appendChild(card);
            });
        } catch (err) {
            console.error('Failed to load products for section:', err);
            grid.innerHTML = '<div class="error-msg">載入失敗</div>';
        }
    },

    createFallbackProductCard: function (p) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-id', p.id);
        // 點擊卡片開啟詳情
        card.onclick = () => { if (typeof showProductDetail === 'function') showProductDetail(p.id); };

        // 處理多圖與缺圖 (確保 image 是字串)
        let imageUrl = 'https://via.placeholder.com/400?text=No+Image';
        const rawImg = p.image || p.prodImage || p.img || '';
        const imgStr = String(rawImg).trim();

        if (imgStr && imgStr !== '' && imgStr !== 'undefined' && imgStr !== 'null') {
            const firstImg = imgStr.split(',')[0].trim();
            if (firstImg) {
                imageUrl = firstImg;
            }
        }

        // 偵錯日誌
        if (typeof PageRenderer._debugCount === 'undefined') PageRenderer._debugCount = 0;
        PageRenderer._debugCount++;
        if (PageRenderer._debugCount <= 5) {
            console.log(`[PageRenderer Debug ${PageRenderer._debugCount}] 商品: ${p.name}, 網址: ${imageUrl}`);
        }

        const hasOptions = p.options && (typeof p.options === 'string' ? p.options !== '{}' : Object.keys(p.options).length > 0);
        const btnText = hasOptions ? '選擇規格' : '加入購物車';

        // 按鈕點擊事件
        const btnAction = hasOptions
            ? `showProductDetail('${p.id}')`
            : `addToCartById('${p.id}')`;

        // 使用 padding-top 的方式強制撐出高度，防止 aspect-ratio 不相容
        card.innerHTML = `
            <div class="product-image" style="width:100%; position:relative; background:#f0f0f0; border-radius:12px; overflow:hidden; margin-bottom:15px; height:0; padding-top:100%;">
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:10px; color:#ccc;">
                    <img src="${imageUrl}" alt="${p.name}" loading="lazy" 
                         style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:2;"
                         onerror="this.style.display='none'; this.parentElement.querySelector('span').innerHTML='⚠️ 無法載入';">
                    <span style="z-index:1;">載入中...</span>
                </div>
            </div>
            <div class="product-info">
                <h3 class="product-name" style="font-size:1.1rem; font-weight:500; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; height:2.8em; line-height:1.4; text-align:center;">${p.name}</h3>
                <div class="product-price" style="font-weight:600; font-size:1.1rem; margin-bottom:12px; text-align:center;">NT$ ${p.price || 0}</div>
                <button class="product-btn" onclick="event.stopPropagation(); ${btnAction}" style="width:100%; padding:10px; background:#D68C94; color:white; border:none; border-radius:30px; cursor:pointer;">${btnText}</button>
            </div>
        `;
        return card;
    }
};
