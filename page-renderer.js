/**
 * Modular Page Renderer (Visual Version) v2.0
 * - GitHub Direct Access for faster loading
 * - Footer section rendering
 * - Dynamic spacing support
 */
const PageRenderer = {
    // GitHub Raw URL for layout config
    LAYOUT_URL: 'https://raw.githubusercontent.com/vvstudiocode/korea/main/layout.json',

    init: async function () {
        console.log('🚀 PageRenderer v2.0 Initialized');
        const container = document.getElementById('pageBuilderRoot');
        if (!container) return;

        // 1. 立即從快取讀取並渲染 (防止閃爍)
        const cachedLayout = localStorage.getItem('omo_cached_layout');
        if (cachedLayout) {
            try {
                const parsed = JSON.parse(cachedLayout);
                this.render(container, parsed.sections || parsed);
                this.renderFooter(parsed.footer);
            } catch (e) { console.error('Cache parse error', e); }
        } else {
            // 如果沒快取，顯示載入狀態
            container.innerHTML = '<div class="section-container" style="padding: 100px 0; text-align: center; opacity: 0.5;">載入自訂排版中...</div>';
        }

        // 2. 非同步從 GitHub 獲取最新排版
        const layout = await this.fetchLayout();
        if (layout) {
            // 更新快取
            localStorage.setItem('omo_cached_layout', JSON.stringify(layout));
            // 重新渲染最新內容
            this.render(container, layout.sections || layout);
            this.renderFooter(layout.footer);
        }
    },

    fetchLayout: async function () {
        // 預設排版 (fallback)
        const FALLBACK_LAYOUT = {
            sections: [
                {
                    type: 'hero',
                    title: 'Welcome to OMO Select',
                    subtitle: 'Discover the best Korean products',
                    image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200'
                },
                { type: 'categories' },
                {
                    type: 'products',
                    title: '精選推薦',
                    category: '全部',
                    limit: 8
                },
                {
                    type: 'product_list',
                    title: '最新商品',
                    category: '全部',
                    limit: 20
                }
            ],
            footer: null
        };

        try {
            // 優先從 GitHub Raw 直接讀取 (加上時間戳避免快取)
            const response = await fetch(this.LAYOUT_URL + '?_=' + Date.now());
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Layout loaded from GitHub');
                return data;
            }
        } catch (err) {
            console.warn('⚠️ GitHub fetch failed, trying GAS API...');
        }

        // Fallback: 嘗試從 GAS API 讀取
        try {
            const apiUrl = typeof GAS_API_URL !== 'undefined' ? GAS_API_URL : '';
            if (apiUrl) {
                const response = await fetch(`${apiUrl}?action=getSiteSettings`);
                const result = await response.json();
                if (result.success && result.data.settings && result.data.settings.homepage_layout) {
                    const sections = JSON.parse(result.data.settings.homepage_layout);
                    return { sections: sections, footer: null };
                }
            }
        } catch (err) {
            console.warn('⚠️ GAS API also failed, using fallback layout.');
        }

        return FALLBACK_LAYOUT;
    },

    render: async function (container, layout) {
        if (!container || !layout) return;
        container.innerHTML = '';

        // 支援傳入 sections 陣列或完整 layout 物件
        const sections = Array.isArray(layout) ? layout : (layout.sections || layout);

        for (const [index, comp] of sections.entries()) {
            const section = document.createElement('section');
            section.className = `page-section section-${comp.type}`;
            section.setAttribute('data-comp-index', index);

            // 套用動態間距
            if (comp.marginTop) section.style.marginTop = comp.marginTop + 'px';
            if (comp.marginBottom) section.style.marginBottom = comp.marginBottom + 'px';

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

    // 渲染頁尾區塊
    renderFooter: function (footerData) {
        const footer = document.querySelector('.site-footer');
        if (!footer || !footerData) return;

        // 渲染購買須知
        const footerSection = footer.querySelector('.footer-section ul');
        if (footerSection && footerData.notices && footerData.notices.length > 0) {
            footerSection.innerHTML = footerData.notices.map(notice => `
                <li class="section-header"><strong>${notice.title}</strong></li>
                ${notice.content.split('\n').map(line => `<li>${line}</li>`).join('')}
            `).join('');
        }

        // 渲染社群連結
        const socialIcons = footer.querySelector('.social-icons');
        if (socialIcons && footerData.socialLinks) {
            const links = footerData.socialLinks;
            socialIcons.innerHTML = `
                ${links.line ? `<a href="${links.line}" target="_blank" rel="noopener noreferrer">
                    <img src="https://raw.githubusercontent.com/vvstudiocode/korea/main/line.png" alt="Line">
                </a>` : ''}
                ${links.instagram ? `<a href="${links.instagram}" target="_blank" rel="noopener noreferrer">
                    <img src="https://raw.githubusercontent.com/vvstudiocode/korea/main/instagram.png" alt="Instagram">
                </a>` : ''}
                ${links.threads ? `<a href="${links.threads}" target="_blank" rel="noopener noreferrer">
                    <img src="https://raw.githubusercontent.com/vvstudiocode/korea/main/threads.png" alt="Threads">
                </a>` : ''}
            `;
        }

        // 渲染版權聲明
        const copyright = footer.querySelector('.footer-copyright');
        if (copyright && footerData.copyright) {
            // 保留社群連結 div，只更新文字
            const socialDiv = copyright.querySelector('.social-icons');
            const socialHTML = socialDiv ? socialDiv.outerHTML : '';
            copyright.innerHTML = socialHTML + '\n' + footerData.copyright;
        }
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
        // 強制使用 block 佈局避免 flex 壓縮導致寬度歸零
        card.className = 'product-card system-card';
        card.style.cssText = 'display:block; width:100%; text-align:center; cursor:pointer; background:transparent;';
        card.setAttribute('data-id', p.id);
        card.onclick = () => { if (typeof showProductDetail === 'function') showProductDetail(p.id); };

        // 圖片網址處理 (與彈窗邏輯同步)
        let imageUrl = 'https://via.placeholder.com/400?text=No+Image';
        const rawImg = p.image || p.prodImage || p.img || '';
        const imgStr = String(rawImg).trim();
        if (imgStr && imgStr !== '' && imgStr !== 'undefined' && imgStr !== 'null') {
            imageUrl = imgStr.split(',')[0].trim();
        }

        const hasOptions = p.options && (typeof p.options === 'string' ? p.options !== '{}' : Object.keys(p.options).length > 0);
        const btnText = hasOptions ? '選擇規格' : '加入購物車';
        const btnAction = hasOptions ? `showProductDetail('${p.id}')` : `addToCartById('${p.id}')`;

        // 構建物理寬度與高度明確的結構
        card.innerHTML = `
            <div class="card-img-box" style="width:100%; aspect-ratio:1/1; background:#f5f5f5; border-radius:12px; overflow:hidden; margin-bottom:15px; position:relative; min-height:250px;">
                <img src="${imageUrl}" alt="${p.name}" loading="lazy" 
                     style="width:100%; height:100%; object-fit:cover; display:block;"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\"padding:80px 10px; color:#999;\">⚠️ 圖片載入失敗</div>';">
            </div>
            <div class="card-info-box" style="padding:0; width:100%;">
                <h3 style="font-size:1.1rem; font-weight:500; margin-bottom:8px; height:2.8em; line-height:1.4; overflow:hidden; color:#333; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${p.name}</h3>
                <div style="font-weight:700; font-size:1.1rem; margin-bottom:12px; color:#333;">NT$ ${p.price || 0}</div>
                <button onclick="event.stopPropagation(); ${btnAction}" 
                        style="width:100%; padding:12px; background:#D68C94; color:white; border:none; border-radius:30px; cursor:pointer; font-weight:500; transition: background 0.3s;">
                    ${btnText}
                </button>
            </div>
        `;
        return card;
    }
};
