// ===== 全局变量 =====
let currentTab = "home";
let currentCategoryBrand = "all";
let currentCategory = "all"; // 当前分类筛选
let searchKeyword = ""; // 搜索关键词
let viewMode = "grid"; // 列表模式：grid 或 list
let swiperIndex = 0;
let swiperTimer = null;
let showPrice = true; // 是否显示价格（由后台控制）

// ===== 全局工具函数 =====
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str || "")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 价格显示辅助函数
function shouldShowPrice() {
  return showPrice;
}
function formatPrice(price) {
  if (!showPrice) return "";
  return "¥" + (price || 0);
}

// ===== IndexedDB 前端读取支持 =====
const FRONTEND_DB_NAME = "VapeShopDB";
const FRONTEND_DB_VERSION = 1;
let frontendDb = null;

function initFrontendDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FRONTEND_DB_NAME, FRONTEND_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      frontendDb = request.result;
      resolve(frontendDb);
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains("shop_data")) {
        database.createObjectStore("shop_data", { keyPath: "id" });
      }
    };
  });
}

function frontendDbLoad(key) {
  return new Promise((resolve, reject) => {
    if (!frontendDb) {
      // IndexedDB 未初始化，使用 localStorage
      try {
        const data = localStorage.getItem(key);
        resolve(data ? JSON.parse(data) : null);
      } catch (e) {
        reject(e);
      }
      return;
    }
    const transaction = frontendDb.transaction(["shop_data"], "readonly");
    const store = transaction.objectStore("shop_data");
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
  });
}

// ===== 数据源：优先使用静态 data.js，同时支持 IndexedDB/localStorage 实时同步 =====
// 缓存数据以避免重复读取
let cachedProductsData = null;
let dataLoadPromise = null;
let isDataLoaded = false; // 标记数据是否已加载完成

async function loadProductsData() {
  // 如果已有缓存，直接返回
  if (cachedProductsData) {
    return cachedProductsData;
  }

  // 防止重复加载
  if (dataLoadPromise) {
    return dataLoadPromise;
  }

  dataLoadPromise = (async () => {
    // 1. 首先加载静态 data.js（这是最重要的数据源，用于打包部署场景）
    let staticData = null;
    if (typeof PRODUCTS_DATA !== 'undefined' && PRODUCTS_DATA) {
      staticData = {
        showPrice: PRODUCTS_DATA.showPrice !== false,
        banners: PRODUCTS_DATA.banners || [],
        brands: PRODUCTS_DATA.brands || [],
        products: PRODUCTS_DATA.products || [],
        articles: PRODUCTS_DATA.articles || [],
        about: PRODUCTS_DATA.about || null,
        notice: (PRODUCTS_DATA.about && PRODUCTS_DATA.about.notice) || "",
        newProducts: PRODUCTS_DATA.newProducts || [],
      };
      // 使用静态数据作为基础
      cachedProductsData = staticData;
      console.log('[数据加载] 静态 data.js 加载成功:', {
        brands: staticData.brands.length + ' 个品牌',
        products: staticData.products.length + ' 个商品',
        banners: staticData.banners.length + ' 个横幅'
      });
    } else {
      console.warn('[数据加载] 警告: PRODUCTS_DATA 未定义，请确保 data.js 已正确加载');
    }

    // 2. 尝试从 IndexedDB 读取实时数据（用于后台预览模式）
    try {
      if (!frontendDb) {
        await initFrontendDB();
      }
      const dbData = await Promise.race([
        frontendDbLoad("shop_data"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("IndexedDB timeout")), 2000))
      ]);
      if (dbData) {
        // IndexedDB 有数据，合并到静态数据中
        const mergedData = {
          showPrice: dbData.showPrice !== undefined ? dbData.showPrice : staticData?.showPrice,
          banners: dbData.banners?.length > 0 ? dbData.banners : (staticData?.banners || []),
          brands: dbData.brands?.length > 0 ? dbData.brands : (staticData?.brands || []),
          products: dbData.products?.length > 0 ? dbData.products : (staticData?.products || []),
          articles: dbData.articles?.length > 0 ? dbData.articles : (staticData?.articles || []),
          about: dbData.about || staticData?.about || null,
          notice: dbData.about?.notice || staticData?.notice || "",
          newProducts: dbData.newProducts?.length > 0 ? dbData.newProducts : (staticData?.newProducts || []),
        };
        cachedProductsData = mergedData;
        console.log('[数据加载] IndexedDB 数据合并成功');
        return cachedProductsData;
      }
    } catch (e) {
      console.warn("IndexedDB 读取失败:", e);
    }

    // 3. 如果静态数据已加载，直接返回
    if (cachedProductsData) {
      isDataLoaded = true;
      return cachedProductsData;
    }

    // 4. 最终回退到空数据结构
    cachedProductsData = {
      showPrice: true,
      banners: [],
      brands: [],
      products: [],
      articles: [],
      about: null,
      notice: "",
      newProducts: [],
    };
    isDataLoaded = true;
    return cachedProductsData;
  })();

  return dataLoadPromise;
}

// 同步版本 - 优先返回静态数据，同时异步加载
function getProductsData() {
  if (cachedProductsData) {
    return cachedProductsData;
  }
  // 立即返回静态数据，保证首屏渲染
  if (typeof PRODUCTS_DATA !== 'undefined' && PRODUCTS_DATA) {
    return {
      showPrice: PRODUCTS_DATA.showPrice !== false,
      banners: PRODUCTS_DATA.banners || [],
      brands: PRODUCTS_DATA.brands || [],
      products: PRODUCTS_DATA.products || [],
      articles: PRODUCTS_DATA.articles || [],
      about: PRODUCTS_DATA.about || null,
      notice: (PRODUCTS_DATA.about && PRODUCTS_DATA.about.notice) || "",
      newProducts: PRODUCTS_DATA.newProducts || [],
    };
  }
  // 如果连静态数据都没有，返回空数据
  console.error('[数据加载] 错误: 无法获取商品数据，PRODUCTS_DATA 未定义');
  return {
    showPrice: true,
    banners: [],
    brands: [],
    products: [],
    articles: [],
    about: null,
    notice: "",
    newProducts: [],
  };
}

// 获取已启用的品牌（过滤掉禁用的品牌）
function getEnabledBrands() {
  return getProductsData().brands.filter((b) => b.enabled !== false);
}

// 获取已启用的商品（过滤掉禁用品牌的所有商品）
// 注意：对于没有匹配到品牌列表的商品，也应该显示（使用 brandName 作为显示名称）
function getEnabledProducts() {
  const enabledBrandIds = getEnabledBrands().map((b) => b.id);
  return getProductsData().products.filter((p) => {
    // 如果商品的品牌在已启用列表中，显示
    if (enabledBrandIds.includes(p.brand)) {
      return true;
    }
    // 如果商品没有品牌或者品牌不在列表中，检查是否有 brandName
    // 只要有 brandName 就显示（避免数据不匹配导致商品消失）
    return p.brandName && p.brandName !== '其他';
  });
}

// 关于页面默认值
const ABOUT_DEFAULTS = {
  logo: "",
  companyName: "国标电子烟产品介绍",
  slogan: "品质生活，从这里开始",
  aboutText:
    "我们是一家专注于电子烟产品销售与服务的专业商城。致力于为消费者提供高品质、高性价比的电子烟产品，让每一位顾客都能找到适合自己的选择。",
  phone: "",
  email: "",
  address: "",
  wechatId: "",
  wechatQr: "",
  promises: [
    "所有商品均为正品，假一赔十",
    "7天无理由退换货（不影响二次销售）",
    "一年质保服务",
    "专业客服在线解答",
  ],
  copyright: "© 2026 国标电子烟产品介绍 保留所有权利",
};

// 渲染关于页面
function renderAboutPage() {
  const container = document.getElementById("aboutPageContent");
  if (!container) return;
  const data = getProductsData();
  const d = { ...ABOUT_DEFAULTS, ...(data.about || {}) };

  const logoContent = d.logo
    ? `<div class="about-logo" style="background-image:url('${escapeAttr(d.logo)}');background-size:cover;background-position:center;"></div>`
    : '<div class="about-logo">🏭</div>';

  const promiseItems = d.promises
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("");

  const contactItems = [
    d.phone
      ? `<div class="contact-item"><span class="contact-icon">📱</span><span>联系电话：<strong>${escapeHtml(d.phone)}</strong></span></div>`
      : "",
    d.email
      ? `<div class="contact-item"><span class="contact-icon">📧</span><span>邮箱：${escapeHtml(d.email)}</span></div>`
      : "",
    d.address
      ? `<div class="contact-item"><span class="contact-icon">📍</span><span>地址：${escapeHtml(d.address)}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const wechatSection =
    d.wechatId || d.wechatQr
      ? `
        <div class="about-section">
            <h3>联系我们</h3>
            ${d.wechatId ? `<div class="contact-item"><span class="contact-icon">💬</span><span>微信号：<strong>${escapeHtml(d.wechatId)}</strong></span></div>` : ""}
            ${
              d.wechatQr
                ? `
            <div class="wechat-qr-wrap">
                <img src="${escapeAttr(d.wechatQr)}" alt="微信二维码" class="wechat-qr-img">
                <p class="wechat-qr-hint">👆 长按识别二维码，扫码添加店主</p>
            </div>`
                : ""
            }
        </div>
    `
      : "";

  container.innerHTML = `
        <div class="about-container">
            <div class="about-header">
                ${logoContent}
                <h1 class="about-name">${escapeHtml(d.companyName)}</h1>
                <p class="about-slogan">${escapeHtml(d.slogan)}</p>
            </div>

            <div class="about-section">
                <h3>关于我们</h3>
                <p>${escapeHtml(d.aboutText)}</p>
            </div>

            <div class="about-section">
                <h3>我们的优势</h3>
                <div class="advantage-grid">
                    <div class="advantage-item">
                        <div class="advantage-icon">🎯</div>
                        <div class="advantage-word">更靠谱</div>
                    </div>
                    <div class="advantage-item">
                        <div class="advantage-icon">💰</div>
                        <div class="advantage-word">更实惠</div>
                    </div>
                    <div class="advantage-item">
                        <div class="advantage-icon">🤝</div>
                        <div class="advantage-word">更热情</div>
                    </div>
                    <div class="advantage-item">
                        <div class="advantage-icon">💡</div>
                        <div class="advantage-word">更专业</div>
                    </div>
                    <div class="advantage-item">
                        <div class="advantage-icon">⚡</div>
                        <div class="advantage-word">更效率</div>
                    </div>
                </div>
            </div>

            ${
              contactItems
                ? `
            <div class="about-section">
                <h3>联系方式</h3>
                <div class="contact-list">
                    ${contactItems}
                </div>
            </div>
            `
                : ""
            }

            ${wechatSection}

            ${
              promiseItems
                ? `
            <div class="about-section">
                <h3>服务承诺</h3>
                <ul class="promise-list">
                    ${promiseItems}
                </ul>
            </div>
            `
                : ""
            }

            <div class="about-footer">
                <p>${formatCopyright(d.copyright)}</p>
            </div>
        </div>
    `;
}

function escapeAttr(str) {
  return String(str || "")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 格式化版权信息，全部加粗
function formatCopyright(text) {
  if (!text) return "";
  return `<strong style="font-weight: 600; color: #666;">${escapeHtml(text)}</strong>`;
}

// ===== 隐藏加载遮罩 =====
function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 300);
  }
}

// ===== 初始化 =====
document.addEventListener("DOMContentLoaded", function () {
  // 1. 同步渲染（使用静态数据，保证首屏快速显示）
  initSwiper();
  renderNotice();
  renderCategoryPage();
  renderHotProducts();
  renderNewProducts();
  renderHotList();
  renderNewList();
  renderSciencePage();
  renderAboutPage();

  // 2. 异步加载实时数据（后台静默更新，不阻塞渲染）
  loadProductsDataAsync().then(() => {
    // 数据加载完成后隐藏加载提示
    hideLoadingOverlay();
    // 初始化左侧品牌栏触摸滚动
    initCategoryLeftScroll();
  });

  // 返回顶部按钮显示/隐藏
  const pageContainer = document.getElementById("pageContainer");
  const backToTop = document.getElementById("backToTopBtn");

  pageContainer.addEventListener("scroll", function () {
    if (pageContainer.scrollTop > 300) {
      backToTop.style.display = "flex";
    } else {
      backToTop.style.display = "none";
    }
  });

  // 页面从后台恢复时刷新数据（跨标签页同步）
  document.addEventListener("visibilitychange", async function () {
    if (document.visibilityState === "visible") {
      loadProductsDataAsync();
    }
  });

  // 监听 localStorage 变化（后台更新数据后自动刷新）
  window.addEventListener("storage", function (e) {
    if (e.key === "shop_data") {
      loadProductsDataAsync();
    }
  });
});

// 左侧品牌栏触摸滚动增强
function initCategoryLeftScroll() {
  const categoryLeft = document.getElementById("categoryLeft");
  if (!categoryLeft) return;

  let startY = 0;
  let scrollTop = 0;
  let isScrolling = false;

  categoryLeft.addEventListener("touchstart", function (e) {
    startY = e.touches[0].pageY;
    scrollTop = categoryLeft.scrollTop;
    isScrolling = true;
  }, { passive: true });

  categoryLeft.addEventListener("touchmove", function (e) {
    if (!isScrolling) return;
    const currentY = e.touches[0].pageY;
    const diff = startY - currentY;
    categoryLeft.scrollTop = scrollTop + diff;
  }, { passive: true });

  categoryLeft.addEventListener("touchend", function () {
    isScrolling = false;
  }, { passive: true });
}

// 异步加载数据并更新页面
async function loadProductsDataAsync() {
  try {
    const data = await loadProductsData();
    showPrice = data.showPrice !== false;
    renderCategoryPage();
    renderHotProducts();
    renderNewProducts();
    renderHotList();
    renderNewList();
    renderSciencePage();
    renderAboutPage();
  } catch (e) {
    console.warn("异步加载数据失败:", e);
  }
}

// 手动刷新数据（供外部调用）
async function refreshData() {
  cachedProductsData = null;
  dataLoadPromise = null;
  const newData = await loadProductsData();
  showPrice = newData.showPrice !== false;
  renderCategoryPage();
  renderHotProducts();
  renderNewProducts();
  renderHotList();
  renderNewList();
  renderSciencePage();
  renderAboutPage();
}

// ===== 返回顶部 =====
function scrollToTop() {
  document
    .getElementById("pageContainer")
    .scrollTo({ top: 0, behavior: "smooth" });
}

// ===== Tab切换 =====
function switchTab(tabName) {
  currentTab = tabName;

  // 如果详情页在显示，先关闭详情页
  const detailPage = document.getElementById("page-detail");
  if (detailPage.classList.contains("active")) {
    detailPage.classList.remove("active");
    if (detailSwiperTimer) {
      clearInterval(detailSwiperTimer);
      detailSwiperTimer = null;
    }
  }

  document.querySelectorAll(".tab-page").forEach((page) => {
    page.classList.remove("active");
  });
  document.getElementById("page-" + tabName).classList.add("active");

  document.querySelectorAll(".tab-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tabName);
  });

  // 切换到关于页面时刷新内容（同标签页 localStorage 变化不会触发 storage 事件）
  if (tabName === "about") {
    renderAboutPage();
  }

  // 切换到热门/新品列表页时渲染
  if (tabName === "hot") {
    renderHotList();
  }
  if (tabName === "new") {
    renderNewList();
  }

  document.getElementById("pageContainer").scrollTop = 0;
}

// ===== 公告栏渲染 =====
function renderNotice() {
  const data = getProductsData();
  const noticeText = data.notice || "";

  if (!noticeText.trim()) {
    document.getElementById("noticeBar").style.display = "none";
    return;
  }

  // 支持多行，每行一个公告
  const notices = noticeText.split("\n").filter(n => n.trim());
  if (notices.length === 0) {
    document.getElementById("noticeBar").style.display = "none";
    return;
  }

  // 复制一份实现无缝循环
  const allNotices = [...notices, ...notices];
  const html = allNotices
    .map((n, i) => `<span class="notice-item">${escapeHtml(n.trim())}${i < allNotices.length - 1 ? '<span class="notice-sep">|</span>' : ''}</span>`)
    .join("");

  document.getElementById("noticeScroll").innerHTML = html;

  // 速度随公告数量调整
  const duration = Math.max(12, notices.length * 8);
  document.querySelectorAll(".notice-scroll").forEach(el => {
    el.style.animationDuration = duration + "s";
  });

  document.getElementById("noticeBar").style.display = "flex";
}

// ===== 轮播图初始化 =====
function initSwiper() {
  const data = getProductsData();
  const banners = data.banners.length > 0 ? data.banners : getDefaultBanners();

  if (banners.length === 0) {
    document.getElementById("homeSwiper").style.display = "none";
    document.getElementById("mobileSwiper").style.display = "none";
    return;
  }

  // PC端轮播图
  const pcWrapper = document.getElementById("swiperWrapper");
  const pcPagination = document.getElementById("swiperPagination");
  let pcSlidesHtml = "";
  let pcDotsHtml = "";
  banners.forEach((banner, index) => {
    pcSlidesHtml += `
            <div class="swiper-slide" onclick="openProductDetail('${banner.productId || ""}')">
                <img src="${banner.image}" alt="${banner.title}" onerror="this.style.display='none'">
                <div class="slide-content">
                    <div class="slide-title">${banner.title}</div>
                    <div class="slide-desc">${banner.desc || ""}</div>
                </div>
            </div>
        `;
    pcDotsHtml += `<span class="dot ${index === 0 ? "active" : ""}" onclick="goToSlide(${index})"></span>`;
  });
  pcWrapper.innerHTML = pcSlidesHtml;
  pcPagination.innerHTML = pcDotsHtml;

  // 移动端轮播图
  const mobileWrapper = document.getElementById("mobileSwiperWrapper");
  const mobilePagination = document.getElementById("mobileSwiperPagination");
  let mobileSlidesHtml = "";
  let mobileDotsHtml = "";
  banners.forEach((banner, index) => {
    mobileSlidesHtml += `
            <div class="swiper-slide" onclick="openProductDetail('${banner.productId || ""}')">
                <img src="${banner.image}" alt="${banner.title}" onerror="this.style.display='none'">
                <div class="slide-content">
                    <div class="slide-title">${banner.title}</div>
                    <div class="slide-desc">${banner.desc || ""}</div>
                </div>
            </div>
        `;
    mobileDotsHtml += `<span class="dot ${index === 0 ? "active" : ""}" onclick="goToSlide(${index})"></span>`;
  });
  mobileWrapper.innerHTML = mobileSlidesHtml;
  mobilePagination.innerHTML = mobileDotsHtml;

  startSwiperAuto();
}

function getDefaultBanners() {
  // 使用 images 文件夹中的两张图片作为轮播图
  return [
    {
      image: "images/1.png",
      title: "精选推荐",
      desc: "品质优选，值得信赖",
      productId: "",
    },
    {
      image: "images/2.png",
      title: "热门好物",
      desc: "人气爆款，口碑之选",
      productId: "",
    },
  ];
}

function goToSlide(index) {
  const data = getProductsData();
  const banners = data.banners.length > 0 ? data.banners : getDefaultBanners();
  swiperIndex = index;
  updateSwiper();
}

function updateSwiper() {
  const pcWrapper = document.getElementById("swiperWrapper");
  const mobileWrapper = document.getElementById("mobileSwiperWrapper");
  const pcDots = document.querySelectorAll("#swiperPagination .dot");
  const mobileDots = document.querySelectorAll("#mobileSwiperPagination .dot");
  const data = getProductsData();
  const banners = data.banners.length > 0 ? data.banners : getDefaultBanners();

  pcWrapper.style.transform = `translateX(-${swiperIndex * 100}%)`;
  mobileWrapper.style.transform = `translateX(-${swiperIndex * 100}%)`;

  pcDots.forEach((dot, i) => dot.classList.toggle("active", i === swiperIndex));
  mobileDots.forEach((dot, i) =>
    dot.classList.toggle("active", i === swiperIndex),
  );
}

function startSwiperAuto() {
  if (swiperTimer) clearInterval(swiperTimer);
  swiperTimer = setInterval(() => {
    const data = getProductsData();
    const banners =
      data.banners.length > 0 ? data.banners : getDefaultBanners();
    swiperIndex = (swiperIndex + 1) % banners.length;
    updateSwiper();
  }, 4000);
}

// ===== 渲染商品列表 =====
// ===== PC端热门商品渲染 =====
function renderPCHotProducts(hotProducts) {
  const pcHotSection = document.getElementById("pcHotSection");
  const pcEmptyHot = document.getElementById("pcEmptyHot");
  const container = document.getElementById("hotProducts");
  const displayProducts = hotProducts.slice(0, 4); // 最多显示4个

  if (hotProducts.length === 0) {
    pcHotSection.style.display = "none";
    if (pcEmptyHot) pcEmptyHot.style.display = "block";
    return;
  }

  if (pcEmptyHot) pcEmptyHot.style.display = "none";
  pcHotSection.style.display = "block";
  document.getElementById("pcHotCount").textContent =
    hotProducts.length + " 件";

  let html = "";
  displayProducts.forEach((product) => {
    html += `
            <div class="pc-product-card" onclick="openProductDetail('${product.id}')">
                <div class="pc-product-image-wrap">
                    <img class="pc-product-image" src="${product.image}" alt="${product.name}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>📦</text></svg>'">
                </div>
                <div class="pc-product-info">
                    <div class="pc-product-name">🔥 ${product.name}</div>
                    <div class="pc-product-brand">${product.brandName || ""}</div>
                    <div class="pc-product-bottom">
                        <span class="pc-product-price">${showPrice ? "¥" + (product.price || 0) : ""}</span>
                    </div>
                </div>
            </div>
        `;
  });

  container.innerHTML = html;
}

// ===== 移动端热门商品渲染 =====
function renderMobileHotProducts(hotProducts) {
  const mobileHotSection = document.getElementById("mobileHotSection");
  const container = document.getElementById("mobileHotProducts");
  const displayProducts = hotProducts.slice(0, 4); // 最多显示4个

  if (hotProducts.length === 0) {
    mobileHotSection.style.display = "none";
    return;
  }

  mobileHotSection.style.display = "block";

  let html = "";
  displayProducts.forEach((product) => {
    html += `
            <div class="product-card" onclick="openProductDetail('${product.id}')">
                <div class="product-image-wrap">
                    <img class="product-image" src="${product.image}" alt="${product.name}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>📦</text></svg>'">
                </div>
                <div class="product-info">
                    <div class="product-name">🔥 ${product.name}</div>
                    <div class="product-brand">${product.brandName || ""}</div>
                    <div class="product-bottom">
                        <span class="product-price">${showPrice ? "¥" + (product.price || 0) : ""}</span>
                    </div>
                </div>
            </div>
        `;
  });

  container.innerHTML = html;
}

function renderPCBrands() {
  const container = document.getElementById("pcBrandList");
  const brands = getEnabledBrands();
  const allProducts = getProductsData().products;

  // 计算全部商品数量（只统计有品牌名称的）
  const totalCount = allProducts.filter(p => p.brandName && p.brandName !== '其他').length;

  let html = `<div class="pc-brand-item ${currentCategoryBrand === "all" ? "active" : ""}" data-brand="all" onclick="selectCategoryBrand('all')"><span class="pc-brand-text">全部商品</span><span class="pc-brand-count">${totalCount}</span></div>`;

  brands.forEach((brand) => {
    const productCount = allProducts.filter(p => p.brand === brand.id || p.brandName === brand.name).length;
    html += `<div class="pc-brand-item ${currentCategoryBrand === brand.id ? "active" : ""}" data-brand="${brand.id}" onclick="selectCategoryBrand('${brand.id}')"><span class="pc-brand-text">${brand.name}</span><span class="pc-brand-count">${productCount}</span></div>`;
  });

  container.innerHTML = html;
}

// ===== 分类页渲染 =====
function renderCategoryPage() {
  renderPCBrands();
  renderCategoryBrands();
  renderCategoryProducts();
}

function renderCategoryBrands() {
  const container = document.getElementById("categoryLeft");
  const brands = getEnabledBrands();

  let html = `<div class="brand-item ${currentCategoryBrand === "all" ? "active" : ""}" data-brand="all" onclick="selectCategoryBrand('all')"><span class="brand-name">全部</span></div>`;

  brands.forEach((brand) => {
    html += `<div class="brand-item ${currentCategoryBrand === brand.id ? "active" : ""}" data-brand="${brand.id}" onclick="selectCategoryBrand('${brand.id}')" title="${brand.name}"><span class="brand-name">${brand.name}</span></div>`;
  });

  container.innerHTML = html;
}

function selectCategoryBrand(brandId) {
  currentCategoryBrand = brandId;

  // 更新PC端选中状态
  document.querySelectorAll(".pc-brand-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.brand === brandId);
  });

  // 更新移动端选中状态
  document.querySelectorAll("#categoryLeft .brand-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.brand === brandId);
  });

  // 更新标题
  const brand = getProductsData().brands.find((b) => b.id === brandId);
  const categoryName =
    document.querySelector(`.category-btn.active`)?.dataset.category;
  const categoryLabel =
    categoryName && categoryName !== "all"
      ? categoryName.replace("电子烟", "")
      : "";
  document.getElementById("categoryTitle").textContent = brand
    ? categoryLabel
      ? `${brand.name} · ${categoryLabel}`
      : brand.name
    : categoryLabel || "全部分类";

  // 筛选并渲染商品（保留搜索关键词和分类筛选）
  filterAndRenderProducts();
}

function filterAndRenderProducts() {
  let products = getEnabledProducts();

  // 品牌筛选
  if (currentCategoryBrand !== "all") {
    products = products.filter((p) => p.brand === currentCategoryBrand);
  }

  // 分类筛选
  if (currentCategory === "isHot") {
    products = products.filter((p) => p.isHot);
  } else if (currentCategory === "isNew") {
    products = products.filter((p) => p.isNew);
  } else if (currentCategory !== "all") {
    products = products.filter((p) => p.category === currentCategory);
  }

  // 搜索筛选
  if (searchKeyword.trim()) {
    const kw = searchKeyword.trim().toLowerCase();
    products = products.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(kw)) ||
        (p.brandName && p.brandName.toLowerCase().includes(kw)) ||
        (p.category && p.category.toLowerCase().includes(kw)),
    );
  }

  document.getElementById("categoryCount").textContent =
    products.length + " 件商品";

  // 渲染商品
  renderMobileCategoryProducts(products);
}

// ===== 移动端分类页商品渲染（支持列表/网格切换）=====
function renderMobileCategoryProducts(products) {
  const container = document.getElementById("categoryProducts");

  if (viewMode === "list") {
    // 列表模式
    let html = "";
    products.forEach((product) => {
      html += `
                <div class="product-list-item" onclick="openProductDetail('${product.id}')">
                    <img class="list-item-image" src="${product.image}" alt="${product.name}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>📦</text></svg>'">
                    <div class="list-item-info">
                        <div class="list-item-name">${product.name}</div>
                        <div class="list-item-meta">
                            ${product.brandName ? `<span class="list-item-brand">${product.brandName}</span>` : ""}
                            ${product.category ? `<span class="list-item-category">${product.category}</span>` : ""}
                        </div>
                        ${product.specs ? `<div class="list-item-specs">${product.specs.split("\n")[0] || ""}</div>` : ""}
                    </div>
                    <div class="list-item-right">
                        <div class="list-item-price">${showPrice ? "¥" + (product.price || 0) : ""}</div>
                    </div>
                </div>
            `;
    });
    container.innerHTML =
      html ||
      '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">📦</div><p>该分类暂无商品</p></div>';
  } else {
    // 网格模式
    let html = "";
    products.forEach((product) => {
      html += `
                <div class="product-card" onclick="openProductDetail('${product.id}')">
                    <div class="product-image-wrap">
                        <img class="product-image" src="${product.image}" alt="${product.name}"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>📦</text></svg>'">
                    </div>
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-brand">${product.brandName || ""}</div>
                        <div class="product-bottom">
                            <span class="product-price">${showPrice ? "¥" + (product.price || 0) : ""}</span>
                        </div>
                    </div>
                </div>
            `;
    });
    container.innerHTML =
      html ||
      '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">📦</div><p>该分类暂无商品</p></div>';
  }
}

// ===== 切换列表/网格视图 =====
function toggleViewMode() {
  viewMode = viewMode === "grid" ? "list" : "grid";
  const iconGrid = document.getElementById("iconGrid");
  const iconList = document.getElementById("iconList");
  if (iconGrid && iconList) {
    iconGrid.style.display = viewMode === "grid" ? "block" : "none";
    iconList.style.display = viewMode === "list" ? "block" : "none";
  }
  filterAndRenderProducts();
}

// ===== 搜索商品 =====
function searchProducts(keyword) {
  searchKeyword = keyword;
  filterAndRenderProducts();
}

// ===== 选择分类 =====
function selectCategory(category) {
  currentCategory = category;
  // 更新选中状态
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });
  // 更新标题
  const brand =
    currentCategoryBrand !== "all"
      ? getProductsData().brands.find((b) => b.id === currentCategoryBrand)
      : null;
  const brandLabel = brand ? brand.name : "全部";
  let catLabel = "";
  if (category === "isHot") {
    catLabel = "热门推荐";
  } else if (category === "isNew") {
    catLabel = "新品推荐";
  } else if (category !== "all") {
    catLabel = category.replace("电子烟", "");
  }
  document.getElementById("categoryTitle").textContent = catLabel
    ? `${brandLabel} - ${catLabel}`
    : brandLabel + "商品";
  filterAndRenderProducts();
}

// ===== 从首页"更多"按钮跳转分类页并筛选 =====
function goToCategoryFilter(filterType) {
  switchTab("category");
  selectCategory(filterType);
}

// ===== 热门推荐商品 =====
function renderHotProducts() {
  const hotProducts = getEnabledProducts().filter((p) => p.isHot);

  // PC端
  renderPCHotProducts(hotProducts);
  // 移动端
  renderMobileHotProducts(hotProducts);
}

// ===== PC端新品推荐渲染（小红书风格瀑布流）=====
function renderPCNewProducts(newItems) {
  const pcNewSection = document.getElementById("pcNewSection");
  const pcEmptyNew = document.getElementById("pcEmptyNew");
  const container = document.getElementById("pcNewProducts");
  const displayItems = newItems.filter((n) => n.enabled).slice(0, 4);

  if (newItems.length === 0 || displayItems.length === 0) {
    pcNewSection.style.display = "none";
    if (pcEmptyNew) pcEmptyNew.style.display = "block";
    return;
  }

  if (pcEmptyNew) pcEmptyNew.style.display = "none";
  pcNewSection.style.display = "block";
  document.getElementById("pcNewCount").textContent =
    newItems.filter((n) => n.enabled).length + " 个";

  container.innerHTML = displayItems
    .map((item) => {
      const clickAction = item.productId
        ? `openProductDetail('${item.productId}')`
        : item.link
          ? `window.open('${item.link}', '_blank')`
          : "";
      return `
        <div class="pc-new-card" ${clickAction ? `onclick="${clickAction}"` : ""}>
          <div class="pc-new-card-img-wrap">
            <img src="${item.image}" alt="${item.title}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect fill=%22%23f5f5f5%22 width=%22400%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>🆕</text></svg>'">
            ${item.title ? `<div class="pc-new-card-title-overlay">🆕 ${item.title}</div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

// ===== 移动端新品推荐渲染（小红书风格瀑布流）=====
function renderMobileNewProducts(newItems) {
  const mobileNewSection = document.getElementById("mobileNewSection");
  const container = document.getElementById("mobileNewProducts");
  const displayItems = newItems.filter((n) => n.enabled).slice(0, 4);

  if (newItems.length === 0 || displayItems.length === 0) {
    mobileNewSection.style.display = "none";
    return;
  }

  mobileNewSection.style.display = "block";

  container.innerHTML = displayItems
    .map((item) => {
      const clickAction = item.productId
        ? `openProductDetail('${item.productId}')`
        : item.link
          ? `window.open('${item.link}', '_blank')`
          : "";
      return `
        <div class="new-card" ${clickAction ? `onclick="${clickAction}"` : ""}>
          <div class="new-card-img-wrap">
            <img src="${item.image}" alt="${item.title}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect fill=%22%23f5f5f5%22 width=%22400%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>🆕</text></svg>'">
            ${item.title ? `<div class="new-card-title-overlay">🆕 ${item.title}</div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

// ===== 新品推荐商品（首页）=====
function renderNewProducts() {
  const data = getProductsData();
  const newItems = data.newProducts || [];

  // PC端
  renderPCNewProducts(newItems);
  // 移动端
  renderMobileNewProducts(newItems);
}

// ===== 热门推荐列表页（独立页面）=====
function renderHotList() {
  const products = getEnabledProducts().filter((p) => p.isHot);

  document.getElementById("hotTotalCount").textContent = products.length;

  const container = document.getElementById("hotListProducts");
  const emptyEl = document.getElementById("hotListEmpty");

  if (products.length === 0) {
    container.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }

  emptyEl.style.display = "none";
  container.innerHTML = products.map((p) => buildProductCard(p)).join("");
}

// ===== 新品推荐列表页（小红书风格瀑布流）=====
function renderNewList() {
  const data = getProductsData();
  const newItems = data.newProducts || [];

  document.getElementById("newTotalCount").textContent = newItems.length;

  const container = document.getElementById("newListProducts");
  const emptyEl = document.getElementById("newListEmpty");

  if (newItems.length === 0) {
    container.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }

  emptyEl.style.display = "none";
  container.innerHTML = newItems
    .map((item) => {
      const clickAction = item.productId
        ? `openProductDetail('${item.productId}')`
        : item.link
          ? `window.open('${item.link}', '_blank')`
          : "";
      return `
        <div class="new-list-card" ${clickAction ? `onclick="${clickAction}"` : ""}>
          <div class="new-list-card-img-wrap">
            <img src="${item.image}" alt="${item.title}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect fill=%22%23f5f5f5%22 width=%22400%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>🆕</text></svg>'">
            <div class="new-list-card-title-overlay">${item.title || "新品推荐"}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// ===== 通用商品卡片构建 =====
function buildProductCard(product) {
  return `
    <div class="product-card" onclick="openProductDetail('${product.id}')">
        <div class="product-image-wrap">
            <img class="product-image" src="${product.image}" alt="${product.name}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2240%22>📦</text></svg>'">
        </div>
        <div class="product-info">
            <div class="product-name">${product.name}</div>
            <div class="product-brand">${product.brandName || ""}</div>
            <div class="product-bottom">
                <span class="product-price">${showPrice ? "¥" + (product.price || 0) : ""}</span>
            </div>
        </div>
    </div>
  `;
}

function renderCategoryProducts() {
  filterAndRenderProducts();
}

// ===== 商品详情页 =====
function openProductDetail(productId) {
  if (!productId) return;

  const product = getProductsData().products.find((p) => p.id == productId);
  if (!product) return;

  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // 轮播图（image_1/2/3）
  const carouselImages = (product.carouselImages || []).filter(Boolean);
  // 详情图（image字段换行拆分）
  const detailImages = (product.images || []).filter(Boolean);
  // 主图（轮播图优先，其次详情图）
  const mainImage = carouselImages[0] || detailImages[0] || product.image || "";
  // 轮播图列表（详情页轮播用）
  const swiperImages =
    carouselImages.length > 0
      ? carouselImages
      : detailImages.length > 0
        ? detailImages
        : [];

  // 商品参数
  const specsHtml = product.specs
    ? product.specs
        .split("\n")
        .map((s) => {
          const s2 = s.trim();
          if (!s2) return "";
          const colonIdx = s2.indexOf(":");
          if (colonIdx > 0) {
            return `<div class="dp-param-item">
                <span class="dp-param-label">${escapeHtml(s2.substring(0, colonIdx))}</span>
                <span class="dp-param-value">${escapeHtml(s2.substring(colonIdx + 1))}</span>
            </div>`;
          }
          return `<div class="dp-param-item"><span class="dp-param-value-full">${escapeHtml(s2)}</span></div>`;
        })
        .join("")
    : "";

  // 商品图片轮播（使用轮播图，无轮播图则用详情图）
  let swiperHtml = "";
  if (swiperImages.length > 0) {
    const indicators = swiperImages
      .map(
        (_, i) =>
          `<div class="dp-swiper-dot ${i === 0 ? "active" : ""}" data-index="${i}"></div>`,
      )
      .join("");
    const slides = swiperImages
      .map(
        (img, i) =>
          `<div class="dp-swiper-slide ${i === 0 ? "active" : ""}" data-index="${i}">
                <img src="${escapeHtml(img)}" alt="${escapeHtml(product.name)}"
                     onerror="this.parentElement.innerHTML='<div class=dp-image-error>📦 图片加载失败</div>'">
            </div>`,
      )
      .join("");
    swiperHtml = `
            <div class="dp-swiper" id="detailSwiper">
                <div class="dp-swiper-wrapper">${slides}</div>
                <div class="dp-swiper-indicators">${indicators}</div>
                <div class="dp-swiper-count">1/${swiperImages.length}</div>
            </div>
        `;
  }

  const container = document.getElementById("detailPageContent");

  container.innerHTML = `
        <!-- 顶部导航 -->
        <div class="dp-nav">
            <button class="dp-back-btn" onclick="goBack()">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5l-5 5 5 5"/>
                </svg>
            </button>
            <span class="dp-nav-title">商品详情</span>
        </div>

        <!-- 返回顶部悬浮按钮 -->
        <button class="detail-top-btn" id="detailTopBtn" onclick="detailScrollTop()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 4l-7 7h4v7h6v-7h4z"/>
            </svg>
        </button>

        <!-- 图片轮播 -->
        ${swiperHtml}

        <!-- 商品信息 -->
        <div class="dp-info">
            <h1 class="dp-name">${escapeHtml(product.name)}</h1>
            <div class="dp-tags">
                ${product.brandName ? `<span class="dp-tag">🏷️ ${escapeHtml(product.brandName)}</span>` : ""}
                ${product.category ? `<span class="dp-tag">📂 ${escapeHtml(product.category)}</span>` : ""}
                ${product.code ? `<span class="dp-tag">🔖 ${escapeHtml(product.code)}</span>` : ""}
            </div>
            ${
              showPrice
                ? `
            <div class="dp-price-row">
                <span class="dp-price">¥${product.price || 0}</span>
                ${product.originalPrice && product.originalPrice > product.price ? `<span class="dp-original">¥${product.originalPrice}</span>` : ""}
            </div>
            `
                : ""
            }
        </div>

        <!-- 联系店主按钮 -->
        <div class="dp-section" id="contactShopSection">
            <button class="dp-contact-btn" onclick="showContactModal()">
                💬 联系店主
            </button>
        </div>

        <!-- 商品参数 -->
        ${
          product.specs
            ? `
        <div class="dp-section">
            <h3 class="dp-section-title">📋 产品参数</h3>
            <div class="dp-params">${specsHtml}</div>
        </div>
        `
            : ""
        }

        <!-- 口味/香型 -->
        ${
          product.flavors
            ? `
        <div class="dp-section">
            <h3 class="dp-section-title">💨 可选口味</h3>
            <div class="dp-flavors">${escapeHtml(product.flavors)}</div>
        </div>
        `
            : ""
        }

        <!-- 详情图片 -->
        ${
          detailImages.length > 0
            ? `
        <div class="dp-section">
            <h3 class="dp-section-title">🖼️ 商品详情</h3>
            ${detailImages
              .map(
                (img) =>
                  `<img class="dp-detail-img" src="${escapeHtml(img)}" alt="详情图"
                     onerror="this.style.display='none'">`,
              )
              .join("")}
        </div>
        `
            : ""
        }

    `;

  // 切换Tab显示详情页
  document
    .querySelectorAll(".tab-page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("page-detail").classList.add("active");
  document
    .querySelectorAll(".tab-item")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("pageContainer").scrollTop = 0;
  document.getElementById("page-detail").scrollTop = 0;

  // 初始化详情页轮播
  initDetailSwiper();

  // 详情页返回顶部按钮
  const detailPage = document.getElementById("page-detail");
  const detailTopBtn = document.getElementById("detailTopBtn");
  if (detailPage && detailTopBtn) {
    detailPage.addEventListener("scroll", function () {
      detailTopBtn.style.display = detailPage.scrollTop > 300 ? "flex" : "none";
    });
    detailTopBtn.style.display = "none";
  }

  // 保存当前页面状态，用于返回
  window._lastPage = currentTab;
}

// 详情页返回顶部
function detailScrollTop() {
  document
    .getElementById("page-detail")
    .scrollTo({ top: 0, behavior: "smooth" });
}

// 详情页轮播
let detailSwiperIndex = 0;
let detailSwiperTimer = null;

function initDetailSwiper() {
  const swiper = document.getElementById("detailSwiper");
  if (!swiper) return;

  const slides = swiper.querySelectorAll(".dp-swiper-slide");
  const dots = swiper.querySelectorAll(".dp-swiper-dot");
  const count = swiper.querySelector(".dp-swiper-count");
  detailSwiperIndex = 0;

  // 点击指示器切换
  dots.forEach((dot, i) => {
    dot.onclick = () => goToDetailSlide(i);
  });

  // 自动播放
  if (detailSwiperTimer) clearInterval(detailSwiperTimer);
  detailSwiperTimer = setInterval(() => {
    if (slides.length > 1) {
      detailSwiperIndex = (detailSwiperIndex + 1) % slides.length;
      updateDetailSwiperUI(slides, dots, count);
    }
  }, 3000);
}

function goToDetailSlide(index) {
  const swiper = document.getElementById("detailSwiper");
  if (!swiper) return;
  const slides = swiper.querySelectorAll(".dp-swiper-slide");
  const dots = swiper.querySelectorAll(".dp-swiper-dot");
  const count = swiper.querySelector(".dp-swiper-count");
  detailSwiperIndex = index;
  updateDetailSwiperUI(slides, dots, count);
  // 重置自动播放计时
  if (detailSwiperTimer) {
    clearInterval(detailSwiperTimer);
    detailSwiperTimer = setInterval(() => {
      if (slides.length > 1) {
        detailSwiperIndex = (detailSwiperIndex + 1) % slides.length;
        updateDetailSwiperUI(slides, dots, count);
      }
    }, 3000);
  }
}

function updateDetailSwiperUI(slides, dots, count) {
  slides.forEach((s, i) =>
    s.classList.toggle("active", i === detailSwiperIndex),
  );
  dots.forEach((d, i) => d.classList.toggle("active", i === detailSwiperIndex));
  if (count) count.textContent = `${detailSwiperIndex + 1}/${slides.length}`;
}

// 返回上一页
function goBack() {
  document.getElementById("page-detail").scrollTop = 0;
  document.getElementById("page-detail").classList.remove("active");
  const lastPage = window._lastPage || "category";
  document.getElementById("page-" + lastPage).classList.add("active");
  document.querySelectorAll(".tab-item").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === lastPage);
  });
  currentTab = lastPage;
  if (detailSwiperTimer) {
    clearInterval(detailSwiperTimer);
    detailSwiperTimer = null;
  }
}

// ===== 点击弹窗背景关闭 =====
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", function (e) {
    if (e.target === this) {
      this.classList.remove("active");
    }
  });
});

// ===== 触摸滑动轮播图 =====
let touchStartX = 0;

document.getElementById("homeSwiper")?.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX;
});

document.getElementById("homeSwiper")?.addEventListener("touchend", (e) => {
  const diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 50) {
    const data = getProductsData();
    const banners =
      data.banners.length > 0 ? data.banners : getDefaultBanners();
    if (diff > 0) {
      swiperIndex = (swiperIndex + 1) % banners.length;
    } else {
      swiperIndex = (swiperIndex - 1 + banners.length) % banners.length;
    }
    updateSwiper();
  }
});

document.getElementById("mobileSwiper")?.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX;
});

document.getElementById("mobileSwiper")?.addEventListener("touchend", (e) => {
  const diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 50) {
    const data = getProductsData();
    const banners =
      data.banners.length > 0 ? data.banners : getDefaultBanners();
    if (diff > 0) {
      swiperIndex = (swiperIndex + 1) % banners.length;
    } else {
      swiperIndex = (swiperIndex - 1 + banners.length) % banners.length;
    }
    updateSwiper();
  }
});

// ===== 科普页面渲染 =====
function renderSciencePage() {
  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };
  const container = document.getElementById("scienceContainer");
  const articles = getProductsData().articles.filter(
    (a) => a.status === "published",
  );

  if (articles.length === 0) {
    container.innerHTML = `
            <div class="science-empty">
                <div class="science-empty-icon">📖</div>
                <div class="science-empty-title">暂无科普内容</div>
                <div class="science-empty-desc">敬请期待更多电子烟科普知识</div>
            </div>
        `;
    return;
  }

  let html = "";
  articles.forEach((article) => {
    const coverStyle = article.coverImage
      ? `background-image:url('${article.coverImage}');`
      : "";
    const previewText = article.content
      ? article.content.substring(0, 80) +
        (article.content.length > 80 ? "..." : "")
      : "";
    const time = article.updateTime || article.createTime || "";

    html += `
            <div class="science-card" onclick="openScienceDetail('${article.id}')">
                <div class="science-card-main">
                    <div class="science-card-info">
                        <div class="science-card-title">${escapeHtml(article.title)}</div>
                        ${previewText ? `<div class="science-card-preview">${escapeHtml(previewText)}</div>` : ""}
                        <div class="science-card-footer">
                            <span class="science-card-time">${time}</span>
                            <span class="science-card-arrow">›</span>
                        </div>
                    </div>
                    ${
                      article.coverImage
                        ? `
                    <div class="science-card-thumb" style="${coverStyle}"></div>
                    `
                        : ""
                    }
                </div>
            </div>
        `;
  });

  container.innerHTML = html;
}

function openScienceDetail(articleId) {
  const article = getProductsData().articles.find((a) => a.id === articleId);
  if (!article) return;

  const container = document.getElementById("scienceContainer");
  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // 处理内容：转义HTML + 换行转br + 替换图片标记
  let contentHtml = "";
  if (article.content) {
    contentHtml = escapeHtml(article.content).replace(/\n/g, "<br>");

    // 替换 [图1]、[图2] 等标记为实际图片
    const images = article.images || [];
    contentHtml = contentHtml.replace(/\[图(\d+)\]/g, (match, num) => {
      const index = parseInt(num) - 1;
      if (index >= 0 && index < images.length) {
        return `<img class="science-detail-img" src="${escapeHtml(images[index])}" alt="图${num}" onerror="this.style.display='none'">`;
      }
      return match; // 图片不存在则保留原标记
    });
  }

  // 处理未在内容中引用的图片（追加在末尾）
  const images = article.images || [];
  const usedIndices = new Set();
  if (article.content) {
    const matches = article.content.match(/\[图(\d+)\]/g);
    if (matches) {
      matches.forEach((match) => {
        const num = parseInt(match.match(/\d+/)[0]);
        usedIndices.add(num - 1);
      });
    }
  }

  const unusedImagesHtml = images
    .map((img, index) => {
      if (usedIndices.has(index)) return "";
      return `<img class="science-detail-img" src="${escapeHtml(img)}" alt="配图${index + 1}" onerror="this.style.display='none'">`;
    })
    .filter(Boolean)
    .join("");

  container.innerHTML = `
        <div class="science-detail">
            <div class="science-detail-nav">
                <button class="science-back-btn" onclick="goBackFromScience()">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5l-5 5 5 5"/>
                    </svg>
                </button>
                <span class="science-detail-title-text">科普详情</span>
            </div>

            ${article.coverImage ? `<div class="science-detail-cover" style="background-image:url('${escapeHtml(article.coverImage)}');"></div>` : ""}

            <div class="science-detail-content">
                <h1 class="science-detail-title">${escapeHtml(article.title)}</h1>
                <div class="science-detail-meta">${article.updateTime || article.createTime || ""}</div>
                ${contentHtml ? `<div class="science-detail-text">${contentHtml}</div>` : ""}
                ${unusedImagesHtml}
            </div>
        </div>

        <button class="science-top-btn" id="scienceTopBtn" onclick="scienceScrollTop()">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 4l-7 7h4v7h6v-7h4z"/>
            </svg>
        </button>
    `;

  // 滚动监听
  const detailEl = document.querySelector(".science-detail");
  const topBtn = document.getElementById("scienceTopBtn");
  if (detailEl && topBtn) {
    detailEl.addEventListener("scroll", function () {
      topBtn.style.display = detailEl.scrollTop > 300 ? "flex" : "none";
    });
  }
}

function goBackFromScience() {
  renderSciencePage();
}

function scienceScrollTop() {
  const detail = document.querySelector(".science-detail");
  if (detail) detail.scrollTo({ top: 0, behavior: "smooth" });
}

// ===== 联系店主弹窗 =====
function showContactModal() {
  const data = getProductsData();
  const about = data.about || {};
  const wechatId = about.wechatId || "";
  const wechatQr = about.wechatQr || "";

  const body = document.getElementById("contactModalBody");

  if (!wechatId && !wechatQr) {
    body.innerHTML = `
      <div class="contact-empty">
        <div class="contact-empty-icon">📱</div>
        <p>店主暂未设置联系方式</p>
        <p class="contact-empty-tip">请在后台「关于页面」设置微信号和二维码</p>
      </div>
    `;
  } else {
    let content = '<div class="contact-info">';

    // 微信号（去除复制按钮）
    if (wechatId) {
      content += `
        <div class="contact-wechat">
          <label>📱 微信ID</label>
          <div class="contact-wechat-id">
            <span>${escapeHtml(wechatId)}</span>
          </div>
        </div>
      `;
    }

    // 二维码
    if (wechatQr) {
      content += `
        <div class="contact-qr">
          <label>📷 微信二维码</label>
          <div class="contact-qr-img">
            <img src="${escapeHtml(wechatQr)}" alt="微信二维码"
                 onerror="this.parentElement.innerHTML='<div class=contact-qr-error>图片加载失败</div>'">
          </div>
        </div>
      `;
    }

    content += '</div>';
    body.innerHTML = content;
  }

  document.getElementById("contactModal").classList.add("active");
}

function closeContactModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("contactModal").classList.remove("active");
}

function copyWechatId(id) {
  navigator.clipboard.writeText(id).then(() => {
    showToast("微信号已复制");
  }).catch(() => {
    // 降级方案
    const textarea = document.createElement("textarea");
    textarea.value = id;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showToast("微信号已复制");
  });
}
