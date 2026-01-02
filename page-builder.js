/**
 * Modular Page Builder Admin Logic (Visual Version)
 */
const PageBuilder = {
    layout: [],
    editingIndex: null,
    previewMode: 'desktop',

    init: async function () {
        console.log('🎨 Visual PageBuilder Initialized');
        // 確保商品資料已載入 (用於預覽)
        if (typeof products === 'undefined' || products.length === 0) {
            if (typeof loadProducts === 'function') await loadProducts();
        }
        await this.loadLayout();

        // 監聽視窗縮放
        window.addEventListener('resize', () => {
            if (document.getElementById('builderSection').style.display !== 'none') {
                this.updatePreviewScale();
            }
        });
    },

    loadLayout: async function () {
        showLoadingOverlay();
        try {
            const data = await callApi('getSiteSettings');
            if (data.success && data.data.settings.homepage_layout) {
                this.layout = JSON.parse(data.data.settings.homepage_layout);
            } else {
                this.layout = [
                    { type: 'hero', title: 'Welcome to OMO Select', subtitle: 'Discover the best Korean products', image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80' },
                    { type: 'categories' }
                ];
            }
            this.renderComponentsList();
            this.renderPreview();
        } catch (err) {
            console.error('Failed to load layout:', err);
            showToast('載入排版失敗', 'error');
        } finally {
            hideLoadingOverlay();
        }
    },

    renderComponentsList: function () {
        const list = document.getElementById('builderComponentsList');
        if (!list) return;

        list.innerHTML = '';
        this.layout.forEach((comp, index) => {
            const div = document.createElement('div');
            div.className = `comp-item ${this.editingIndex === index ? 'active' : ''}`;
            div.dataset.index = index;

            const info = this.getComponentTypeInfo(comp.type);

            div.innerHTML = `
                <div class="comp-item-header">
                    <div class="comp-drag-handle" title="拖拽排序">☰</div>
                    <div class="comp-info" onclick="PageBuilder.toggleEdit(${index})" style="cursor:pointer; flex: 1;">
                        <span class="comp-name">${comp.title || info.name}</span>
                        <span class="comp-type-tag">${info.name}</span>
                    </div>
                    <div class="comp-actions">
                        <button class="comp-btn" onclick="PageBuilder.toggleEdit(${index})">${this.editingIndex === index ? '收起' : '✎'}</button>
                        <button class="comp-btn delete" onclick="PageBuilder.removeComponent(${index})">✕</button>
                    </div>
                </div>
                <div class="comp-edit-panel">
                    <div class="edit-form-inner" id="edit-form-${index}"></div>
                </div>
            `;

            if (this.editingIndex === index) {
                this.renderInlineForm(div.querySelector(`#edit-form-${index}`), comp, index);
            }

            div.addEventListener('mouseenter', () => this.highlightPreview(index));
            div.addEventListener('mouseleave', () => this.clearHighlight());

            const handle = div.querySelector('.comp-drag-handle');
            handle.draggable = true;
            handle.addEventListener('dragstart', (e) => {
                div.classList.add('dragging');
                e.dataTransfer.setData('text/plain', index);
            });
            handle.addEventListener('dragend', () => div.classList.remove('dragging'));
            div.addEventListener('dragover', (e) => e.preventDefault());
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;
                this.reorderComponents(fromIndex, toIndex);
            });

            list.appendChild(div);
        });
    },

    toggleEdit: function (index) {
        if (this.editingIndex === index) {
            this.editingIndex = null;
        } else {
            this.editingIndex = index;
            setTimeout(() => {
                const el = document.querySelector(`.comp-item[data-index="${index}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300);
        }
        this.renderComponentsList();
        this.highlightPreview(index);
    },

    renderInlineForm: function (container, comp, index) {
        container.innerHTML = '';

        if (comp.type === 'hero' || comp.type === 'info_section') {
            this.addInnerField(container, '標題', 'title', comp.title);
            this.addInnerField(container, '副標題/文字', 'subtitle', comp.subtitle, 'textarea');
            this.addInnerField(container, '圖片 URL', 'image', comp.image);
            this.addInnerField(container, '按鈕文字', 'buttonText', comp.buttonText);
            this.addInnerField(container, '跳轉連結', 'buttonLink', comp.buttonLink);
        } else if (comp.type === 'product_list') {
            this.addInnerField(container, '區塊標題', 'title', comp.title);

            // 將分類欄位改為下拉選單
            const allProducts = typeof products !== 'undefined' ? products : (typeof currentProducts !== 'undefined' ? currentProducts : []);
            const categories = ['全部', ...new Set(allProducts.map(p => p.category).filter(Boolean))];
            this.addInnerField(container, '商品分類', 'category', comp.category, 'select', categories);

            this.addInnerField(container, '顯示數量', 'limit', comp.limit || 4, 'number');
        } else if (comp.type === 'announcement') {
            this.addInnerField(container, '公告內容', 'text', comp.text);
            this.addInnerField(container, '背景顏色', 'bgColor', comp.bgColor || '#f3f4f6', 'color');
        } else if (comp.type === 'categories') {
            this.addInnerField(container, '區塊標題', 'title', comp.title);
            // 分類導覽目前是自動抓取的，不需要編輯具體分類
        }
    },

    highlightPreview: function (index) {
        this.clearHighlight();
        if (index === null) return;
        const previewRoot = document.getElementById('pageBuilderPreviewRoot');
        if (!previewRoot) return;

        const sections = previewRoot.querySelectorAll('.page-section');
        if (sections[index]) {
            sections[index].classList.add('preview-highlight');
            sections[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    clearHighlight: function () {
        document.querySelectorAll('.preview-highlight').forEach(el => el.classList.remove('preview-highlight'));
    },

    getComponentTypeInfo: function (type) {
        const types = {
            'hero': { name: '首頁大圖', icon: '🖼️' },
            'categories': { name: '分類導覽', icon: '🗄️' },
            'product_list': { name: '精選商品', icon: '🛍️' },
            'info_section': { name: '圖文介紹', icon: '📝' },
            'announcement': { name: '公告欄', icon: '📢' }
        };
        return types[type] || { name: '未定類別', icon: '📦' };
    },

    addComponent: function (type) {
        const newComp = { type: type };
        if (type === 'hero') {
            newComp.title = '新橫幅';
            newComp.image = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800';
            newComp.buttonText = '查看更多';
        } else if (type === 'product_list') {
            newComp.title = '精選推薦';
            newComp.category = '全部';
            newComp.limit = 4;
        } else if (type === 'announcement') {
            newComp.text = '新公告內容';
            newComp.bgColor = '#f3f4f6';
        } else if (type === 'info_section') {
            newComp.title = '新圖文介紹';
            newComp.subtitle = '在這裡輸入介紹文字...';
            newComp.image = 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600';
        } else if (type === 'categories') {
            newComp.title = '商品分類';
        }

        this.layout.push(newComp);
        this.editingIndex = this.layout.length - 1;
        this.renderComponentsList();
        this.renderPreview();
    },

    removeComponent: function (index) {
        if (confirm('確定要刪除此區塊嗎？')) {
            if (this.editingIndex === index) this.editingIndex = null;
            this.layout.splice(index, 1);
            this.renderComponentsList();
            this.renderPreview();
        }
    },

    reorderComponents: function (from, to) {
        if (from === to) return;
        const item = this.layout.splice(from, 1)[0];
        this.layout.splice(to, 0, item);
        if (this.editingIndex === from) this.editingIndex = to;
        else if (from < this.editingIndex && to >= this.editingIndex) this.editingIndex--;
        else if (from > this.editingIndex && to <= this.editingIndex) this.editingIndex++;

        this.renderComponentsList();
        this.renderPreview();
    },

    addInnerField: function (container, label, key, value, type = 'text', options = []) {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label>${label}</label>`;

        let input;
        if (type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else if (type === 'select') {
            input = document.createElement('select');
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                if (opt === value) o.selected = true;
                input.appendChild(o);
            });
        } else {
            input = document.createElement('input');
            input.type = type;
        }
        input.value = value || '';
        input.oninput = (e) => {
            this.layout[this.editingIndex][key] = e.target.value;
            this.renderPreview();
        };

        div.appendChild(input);
        container.appendChild(div);
    },

    saveLayout: async function () {
        const btn = document.getElementById('saveLayoutBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '儲存中...';

        try {
            const data = await callApi('saveSiteSettings', {
                settings: { homepage_layout: JSON.stringify(this.layout) }
            });
            if (data.success) {
                showToast('首頁排版儲存成功！', 'success');
            } else {
                showToast('儲存失敗：' + data.error, 'error');
            }
        } catch (err) {
            showToast('通訊請求失敗', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    setPreviewMode: function (mode) {
        this.previewMode = mode;
        const container = document.getElementById('pageBuilderPreviewRoot');

        document.getElementById('view-desktop').classList.toggle('active', mode === 'desktop');
        document.getElementById('view-mobile').classList.toggle('active', mode === 'mobile');

        container.className = 'preview-container ' + mode;
        this.renderPreview();
    },

    renderPreview: function () {
        const container = document.getElementById('pageBuilderPreviewRoot');
        if (!container) return;

        if (typeof PageRenderer !== 'undefined') {
            PageRenderer.render(container, this.layout);

            // 讓預覽渲染完後也跑一次縮放
            setTimeout(() => this.updatePreviewScale(), 100);
        }
    },

    updatePreviewScale: function () {
        if (this.previewMode !== 'desktop') {
            const container = document.getElementById('pageBuilderPreviewRoot');
            if (container) {
                container.style.transform = '';
                container.style.width = '';
            }
            return;
        }

        const viewport = document.getElementById('previewViewport');
        const container = document.getElementById('pageBuilderPreviewRoot');
        if (!viewport || !container) return;

        const availableWidth = viewport.clientWidth - 40; // 減去 padding
        const targetWidth = 1200;

        if (availableWidth < targetWidth) {
            const scale = availableWidth / targetWidth;
            container.style.transform = `scale(${scale})`;
            container.style.width = `${targetWidth}px`;
        } else {
            container.style.transform = '';
            container.style.width = '100%';
        }
    }
};
