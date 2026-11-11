/* app_13_statistics.js
   Statistics module - completely separate from other app logic
   Handles API calls and data visualization for weekly sales statistics
*/
(function () {
  "use strict";

  window.USP = window.USP || {};
  window.USP.Statistics = window.USP.Statistics || {};

  const Statistics = window.USP.Statistics;

  // ---------------------------
  // API Configuration
  // ---------------------------
  const API_CONFIG = {
    endpoint: "https://cappelndimyr-draft-order-listener.onrender.com/webhooks/orders-created/list?limit=100",
    articleEndpoint: "https://cappelndimyr-draft-order-listener.onrender.com/webhooks/orders-created/list?limit=1000",
    timeout: 10000, // 10 seconds
  };

  // ---------------------------
  // API Call Handler
  // ---------------------------
  async function fetchStatisticsData() {
    try {
      const response = await fetch(API_CONFIG.endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error("[Statistics] API call failed:", error);
      return { success: false, error: error.message };
    }
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || API_CONFIG.timeout || 10000);
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { success: true, data: await response.json(), url };
    } catch (error) {
      return { success: false, error: error.message, url };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchArticleDataCandidates() {
    // Use the same FSG API family as the ordinary FSG view. Earlier versions tried
    // guessed /line-items and /articles endpoints, but those endpoints do not exist.
    // The article analysis therefore reloads the standard orders-created list with a
    // higher limit and extracts Shopify line_items from the payload we already use.
    const url = API_CONFIG.articleEndpoint || API_CONFIG.endpoint;
    const result = await fetchJsonWithTimeout(url, API_CONFIG.timeout);
    const results = [result];
    if (result.success) {
      const candidateRows = flattenArticleRows(rowsFromApiResponse(result.data));
      if (candidateRows.length) {
        return { success: true, rows: candidateRows, sourceUrl: url, tried: results };
      }
    }
    return { success: false, rows: [], tried: results };
  }

  // ---------------------------
  // Data Processing: Date formatting
  // ---------------------------
  function getDateKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateLabel(dateKey) {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}`; // Swedish format: day/month
  }

  // ---------------------------
  // Data Processing: Group orders by day
  // ---------------------------
  function groupOrdersByDay(orders) {
    const dayMap = {};
    
    orders.forEach(order => {
      try {
        const price = parseFloat(order.total_price) || 0;
        const dayKey = getDateKey(order.received_at);
        
        if (!dayMap[dayKey]) {
          dayMap[dayKey] = {
            date: dayKey,
            label: formatDateLabel(dayKey),
            total: 0,
            count: 0,
            currency: order.currency || 'EUR',
            orders: []
          };
        }
        
        dayMap[dayKey].total += price;
        dayMap[dayKey].count += 1;
        dayMap[dayKey].orders.push(order);
      } catch (e) {
        console.warn('[Statistics] Failed to process order:', e);
      }
    });

    // Convert to array and sort by date
    return Object.values(dayMap).sort((a, b) => {
      return a.date.localeCompare(b.date);
    });
  }

  function normalizeSource(order) {
    return (
      order?.source ||
      order?.source_type ||
      order?.store_type ||
      order?.shop_source ||
      order?.shop ||
      "Unknown"
    );
  }

  function eventTypeLabel(eventType) {
    if (eventType === "draft_order_created") return "Draft";
    if (eventType === "order_created") return "Order";
    return eventType || "Unknown";
  }

  function buildSeriesColor(index) {
    const palette = [
      { bg: "#4A90E2", border: "#357ABD" },
      { bg: "#7ED321", border: "#5FA81A" },
      { bg: "#F5A623", border: "#D98C0E" },
      { bg: "#D0021B", border: "#A00117" },
      { bg: "#50E3C2", border: "#2DBA9B" },
      { bg: "#9013FE", border: "#6A0FC0" },
      { bg: "#B8E986", border: "#97C96B" },
      { bg: "#4A4A4A", border: "#2F2F2F" },
    ];
    return palette[index % palette.length];
  }

  // ---------------------------
  // Process API response for orders
  // ---------------------------
  function processOrdersData(apiResponse) {
    if (!apiResponse || !apiResponse.items || !Array.isArray(apiResponse.items)) {
      return { 
        drafts: { dailyData: [], totalSales: 0, orderCount: 0, currency: 'EUR' },
        orders: { dailyData: [], totalSales: 0, orderCount: 0, currency: 'EUR' },
        series: [],
        rawOrders: []
      };
    }

    const allOrders = apiResponse.items;
    
    // Separate draft orders and actual orders
    const draftOrders = allOrders.filter(o => o.event_type === 'draft_order_created');
    const actualOrders = allOrders.filter(o => o.event_type === 'order_created');
    
    // Process each type
    const processType = (orders) => {
      const dailyData = groupOrdersByDay(orders);
      const totalSales = orders.reduce((sum, order) => {
        return sum + (parseFloat(order.total_price) || 0);
      }, 0);
      return {
        dailyData,
        totalSales,
        orderCount: orders.length,
        currency: orders[0]?.currency || 'EUR'
      };
    };

    const seriesMap = {};
    allOrders.forEach((order) => {
      const source = normalizeSource(order);
      const eventType = order?.event_type || "unknown_event";
      const key = `${source}::${eventType}`;

      if (!seriesMap[key]) {
        seriesMap[key] = {
          source,
          eventType,
          orders: []
        };
      }
      seriesMap[key].orders.push(order);
    });

    const series = Object.values(seriesMap)
      .sort((a, b) => `${a.source} ${a.eventType}`.localeCompare(`${b.source} ${b.eventType}`))
      .map((entry, idx) => {
        const processed = processType(entry.orders);
        const color = buildSeriesColor(idx);
        return {
          key: `${entry.source}::${entry.eventType}`,
          source: entry.source,
          eventType: entry.eventType,
          label: `${entry.source} - ${eventTypeLabel(entry.eventType)}`,
          color,
          ...processed
        };
      });

    return {
      drafts: processType(draftOrders),
      orders: processType(actualOrders),
      series,
      rawOrders: allOrders
    };
  }

  // ---------------------------
  // UI Helper: Create DOM element
  // ---------------------------
  function el(tag, attrs, children) {
    const elem = document.createElement(tag);
    if (attrs) {
      for (const key in attrs) {
        if (key === "style" && typeof attrs[key] === "string") {
          elem.setAttribute("style", attrs[key]);
        } else if (key === "class") {
          elem.setAttribute("class", attrs[key]);
        } else if (key.startsWith("on") && typeof attrs[key] === "function") {
          elem.addEventListener(key.substring(2), attrs[key]);
        } else {
          elem.setAttribute(key, attrs[key]);
        }
      }
    }
    if (children) {
      children.forEach((child) => {
        if (child != null) {
          elem.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
        }
      });
    }
    return elem;
  }

  // ---------------------------
  // UI: Loading indicator
  // ---------------------------
  function renderLoading() {
    return el("div", { 
      style: "display:flex;align-items:center;justify-content:center;padding:60px;font-size:18px;color:#666;" 
    }, [
      el("div", {}, ["Laddar statistik..."]),
    ]);
  }


  // ---------------------------
  // UI: Built-in fallback chart if Chart.js is not available
  // ---------------------------
  function renderFallbackDailySalesChart(labels, datasets) {
    const maxValue = Math.max(1, ...datasets.flatMap((dataset) => (dataset.data || []).map((value) => Number(value) || 0)));
    const maxBars = 30;
    const startIndex = Math.max(0, (labels || []).length - maxBars);
    const visibleLabels = (labels || []).slice(startIndex);
    const visibleDatasets = (datasets || []).map((dataset) => ({
      ...dataset,
      data: (dataset.data || []).slice(startIndex)
    }));

    const wrapper = el("div", {
      style: "margin-top:16px;border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:16px;background:#fafafa;"
    }, []);

    wrapper.appendChild(el("div", {
      class: "hint",
      style: "margin-bottom:12px;line-height:1.5;"
    }, ["Grafen visas med appens inbyggda reservvy eftersom Chart.js inte är tillgängligt just nu."]));

    const legend = el("div", { style: "display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:13px;" }, []);
    visibleDatasets.forEach((dataset, index) => {
      legend.appendChild(el("span", { style: "display:inline-flex;align-items:center;gap:6px;" }, [
        el("span", { style: `display:inline-block;width:12px;height:12px;border-radius:3px;background:${index === 0 ? '#4A90E2' : '#7ED321'};` }, []),
        dataset.label || `Serie ${index + 1}`
      ]));
    });
    wrapper.appendChild(legend);

    const chart = el("div", {
      style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(28px,1fr));gap:8px;align-items:end;min-height:260px;border-left:1px solid #ddd;border-bottom:1px solid #ddd;padding:12px 8px 0 8px;"
    }, []);

    visibleLabels.forEach((label, labelIndex) => {
      const group = el("div", { style: "display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:240px;gap:4px;" }, []);
      const bars = el("div", { style: "display:flex;align-items:flex-end;gap:3px;height:190px;width:100%;justify-content:center;" }, []);
      visibleDatasets.forEach((dataset, datasetIndex) => {
        const value = Number(dataset.data?.[labelIndex]) || 0;
        const height = Math.max(2, Math.round((value / maxValue) * 180));
        bars.appendChild(el("div", {
          title: `${dataset.label || ''}: ${value.toFixed(0)}`,
          style: `width:10px;height:${height}px;border-radius:4px 4px 0 0;background:${datasetIndex === 0 ? '#4A90E2' : '#7ED321'};`
        }, []));
      });
      group.appendChild(bars);
      group.appendChild(el("div", { style: "font-size:11px;color:#666;transform:rotate(-45deg);white-space:nowrap;margin-top:14px;" }, [label]));
      chart.appendChild(group);
    });

    wrapper.appendChild(chart);
    return wrapper;
  }

  // ---------------------------
  // UI: Error display
  // ---------------------------
  function renderError(errorMessage) {
    return el("div", {
      style: "background:#FEE;border:1px solid #F88;border-radius:8px;padding:20px;margin:20px 0;color:#C44;"
    }, [
      el("div", { style: "font-weight:600;margin-bottom:8px;" }, ["Fel vid hämtning av statistik"]),
      el("div", { style: "font-size:14px;" }, [errorMessage || "Okänt fel"]),
    ]);
  }

  // ---------------------------
  // UI: Combined daily sales chart (both order types)
  // ---------------------------
  function renderCombinedDailySalesChart(seriesList) {
    if (!seriesList || seriesList.length === 0) {
      return el("div", {
        style: "background:#f9f9f9;border-radius:8px;padding:40px;text-align:center;color:#999;"
      }, ["Ingen försäljningsdata tillgänglig"]);
    }

    const container = el("div", {
      style: "background:#fff;border-radius:8px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1);margin-top:20px;"
    }, []);

    // Title
    container.appendChild(el("h3", {
      style: "font-size:18px;font-weight:600;margin-bottom:20px;"
    }, ["Daglig försäljning - Jämförelse"]));

    // Canvas for Chart.js
    const canvas = document.createElement("canvas");
    canvas.id = "combinedChart";
    canvas.style.maxHeight = "450px";
    container.appendChild(canvas);

    // Create a merged daily data structure
    const allDates = new Set();
    seriesList.forEach((series) => {
      (series.dailyData || []).forEach((d) => allDates.add(d.date));
    });

    const sortedDates = Array.from(allDates).sort();

    // Prepare data for Chart.js
    const labels = sortedDates.map(date => {
      const [year, month, day] = date.split('-');
      return `${day}/${month}`;
    });

    const datasets = seriesList.map((series, idx) => {
      const byDate = {};
      (series.dailyData || []).forEach((d) => {
        byDate[d.date] = d.total;
      });

      return {
        label: `${series.label} (${series.currency || "EUR"})`,
        data: sortedDates.map((date) => byDate[date] || 0),
        backgroundColor: series.color.bg,
        borderColor: series.color.border,
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: series.color.border,
        categoryPercentage: 0.6,
        barPercentage: 0.55,
        maxBarThickness: 22,
        order: idx + 1
      };
    });

    // Create Chart.js chart
    try {
      if (typeof Chart !== 'undefined') {
        new Chart(canvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  boxWidth: 15,
                  padding: 15,
                  font: { size: 12, weight: '600' }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                displayColors: true
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                stacked: false,
                ticks: {
                  callback: function(value) {
                    return value.toFixed(0) + ' EUR';
                  }
                },
                grid: {
                  color: 'rgba(0, 0, 0, 0.05)'
                }
              },
              x: {
                grid: {
                  display: false
                }
              }
            },
            animation: {
              duration: 1000,
              easing: 'easeInOutQuart'
            }
          }
        });
      } else {
        console.warn('[Statistics] Chart.js not loaded; using built-in fallback chart');
        try { canvas.remove(); } catch(e) {}
        container.appendChild(renderFallbackDailySalesChart(labels, datasets));
      }
    } catch (e) {
      console.error('[Statistics] Failed to create combined chart:', e);
      container.appendChild(el("div", {
        style: "padding:20px;color:#C44;text-align:center;"
      }, ["Failed to create chart: " + e.message]));
    }

    return container;
  }

  // ---------------------------
  // UI: Summary cards for a single order type
  // ---------------------------
  function renderTypesSummaryCards(typeData) {
    const { totalSales, orderCount, currency, dailyData } = typeData;
    const avgPerOrder = orderCount > 0 ? totalSales / orderCount : 0;
    const daysCount = dailyData.length;

    const cards = [
      { label: "Total försäljning", value: `${totalSales.toFixed(2)} ${currency}`, color: "#4A90E2" },
      { label: "Antal ordrar", value: orderCount, color: "#7ED321" },
      { label: "Snitt per order", value: `${avgPerOrder.toFixed(2)} ${currency}`, color: "#F5A623" },
      { label: "Antal dagar", value: daysCount, color: "#BD10E0" },
    ];

    const container = el("div", {
      style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:16px;"
    }, []);

    cards.forEach((card) => {
      const cardEl = el("div", {
        style: "background:#fff;border-radius:8px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.1);text-align:center;transition:transform 0.2s;",
        onmouseenter: (e) => { e.currentTarget.style.transform = "translateY(-4px)"; },
        onmouseleave: (e) => { e.currentTarget.style.transform = "translateY(0)"; },
      }, [
        el("div", { style: "font-size:12px;color:#666;margin-bottom:6px;" }, [card.label]),
        el("div", { style: `font-size:24px;font-weight:bold;color:${card.color};` }, [String(card.value)]),
      ]);
      container.appendChild(cardEl);
    });

    return container;
  }

  // ---------------------------
  // UI: Summary section for order type
  // ---------------------------
  function renderTypeSummary(typeData, typeLabel) {
    const { dailyData, totalSales, currency } = typeData;
    
    if (!dailyData || dailyData.length === 0) {
      return el("div", { style: "margin-top:20px;background:#f9f9f9;padding:20px;border-radius:8px;color:#999;" }, [
        `Ingen ${typeLabel.toLowerCase()} data att visa ännu.`,
      ]);
    }

    const latestDay = dailyData[dailyData.length - 1];
    const avgPerDay = dailyData.length > 0 
      ? totalSales / dailyData.length 
      : 0;

    return el("div", { style: "margin-top:20px;background:#f9f9f9;padding:20px;border-radius:8px;" }, [
      el("div", { class: "hint", style: "font-size:14px;line-height:1.6;" }, [
        `Total försäljning: ${totalSales.toFixed(2)} ${currency} fördelat över ${dailyData.length} dagar.`,
        el("br", {}, []),
        latestDay ? `Senaste dagen (${latestDay.label}): ${latestDay.total.toFixed(2)} ${currency}.` : "",
      ]),
    ]);
  }

  // ---------------------------
  // UI: Hero section helper
  // ---------------------------
  function hero(title, subtitle, actionsNodes) {
    return el("div", { class: "hero" }, [
      el("div", {}, [
        el("div", { style: "font-weight:1000;font-size:20px;letter-spacing:.2px;" }, [title]),
        subtitle ? el("div", { class: "hint", style: "margin-top:4px;" }, [subtitle]) : null,
      ]),
      el("div", { class: "hero-actions" }, actionsNodes || []),
    ]);
  }


  // ---------------------------
  // UI: Analysis panel - article sales statistics with filters
  // ---------------------------
  function safeNumber(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value).replace(/[^0-9,.-]/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoney(value, currency) {
    const num = Number(value) || 0;
    return `${num.toFixed(2)} ${currency || "EUR"}`;
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) return value;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || !/^[\[{]/.test(trimmed)) return null;
    try { return JSON.parse(trimmed); } catch (e) { return null; }
  }

  function normalizeFilterValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    return String(value || "").trim();
  }

  function firstValue(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (const key of keys) {
      const value = obj[key];
      if (value != null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function deepFirstValue(obj, keys, depth = 0, seen = new WeakSet()) {
    if (!obj || typeof obj !== "object" || depth > 4) return "";
    if (seen.has(obj)) return "";
    seen.add(obj);

    const direct = firstValue(obj, keys);
    if (direct) return direct;

    for (const value of Object.values(obj)) {
      const parsed = parseMaybeJson(value);
      const current = parsed || value;
      if (current && typeof current === "object") {
        const found = deepFirstValue(current, keys, depth + 1, seen);
        if (found) return found;
      }
    }
    return "";
  }

  function hasArticleShape(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;

    // Shopify line_items normally have at least title/name plus quantity/price,
    // sku, variant_id or product_id. Avoid treating the parent order itself as an
    // article just because it has an id or generic title-like field.
    const hasIdentity = Boolean(
      item.sku || item.SKU || item.variant_sku || item.product_sku || item.article_sku ||
      item.article_sku_code || item.sku_code || item.article_no || item.articleNumber ||
      item.variant_id || item.product_id || item.productId || item.variantId || item.productId ||
      item.handle || item.title || item.name || item.product_title || item.product_name ||
      item.variant_title || item.article || item.article_name || item.artikel || item.artikelnamn || item.item_name
    );
    const hasLineMeasure = Boolean(
      item.quantity || item.qty || item.antal || item.current_quantity || item.fulfillable_quantity ||
      item.price || item.unit_price || item.line_price || item.line_total || item.total_discount ||
      item.total || item.total_price || item.discounted_total || item.original_total
    );
    return hasIdentity && hasLineMeasure;
  }

  function extractArticleArrays(value, depth = 0, seen = new WeakSet()) {
    if (depth > 6 || value == null) return [];
    const parsed = parseMaybeJson(value);
    const current = parsed || value;

    if (Array.isArray(current)) {
      const direct = current.filter(hasArticleShape);
      if (direct.length) return direct;
      return current.flatMap((entry) => extractArticleArrays(entry, depth + 1, seen));
    }

    if (!current || typeof current !== "object") return [];
    if (seen.has(current)) return [];
    seen.add(current);

    const preferredKeys = [
      "line_items", "lineItems", "lineitems", "items", "products", "product_rows", "cart_items",
      "rows", "article_rows", "articles", "artiklar", "order_lines", "orderLines", "sales_lines",
      "salesLines", "variants", "order_items", "orderItems", "details",
      "payload", "body", "data", "raw", "raw_body", "rawBody", "json",
      "order", "draft_order", "draftOrder", "shopify_order", "shopifyOrder",
      "order_data", "orderData", "order_json", "orderJson", "shopify_payload",
      "shopifyPayload", "webhook_body", "webhookBody", "payload_json", "payloadJson",
      "resource", "event", "message"
    ];

    for (const key of preferredKeys) {
      if (current[key] == null) continue;
      const found = extractArticleArrays(current[key], depth + 1, seen);
      if (found.length) return found;
    }

    const all = [];
    Object.values(current).forEach((value) => {
      const parsedValue = parseMaybeJson(value);
      const candidate = parsedValue || value;
      if (Array.isArray(candidate) || (candidate && typeof candidate === "object")) {
        all.push(...extractArticleArrays(candidate, depth + 1, seen));
      }
    });
    return all;
  }

  function getArticleName(item) {
    return String(firstValue(item, [
      "title", "name", "product_title", "product_name", "variant_title", "article", "article_name",
      "artikel", "artikelnamn", "item_name", "description", "handle"
    ]) || "Okänd artikel").trim();
  }

  function getArticleSku(item) {
    return String(firstValue(item, [
      "sku", "SKU", "variant_sku", "product_sku", "article_sku", "article_sku_code", "sku_code",
      "article_no", "articleNumber", "artikelnummer", "item_sku"
    ]) || "").trim();
  }

  function getArticleQuantity(item) {
    const qty = safeNumber(firstValue(item, ["quantity", "qty", "antal", "units", "count", "line_quantity", "sold", "sold_units", "total_quantity", "current_quantity", "fulfillable_quantity"]));
    return qty > 0 ? qty : 1;
  }

  function getArticleRevenue(item) {
    const direct = safeNumber(firstValue(item, [
      "line_price", "line_total", "total", "total_price", "price_total", "gross_sales", "net_sales",
      "sales", "amount", "revenue", "subtotal", "value", "försäljning", "forsaljning",
      "total_sales", "sales_total", "gross_revenue", "net_revenue", "sales_amount",
      "discounted_total", "original_total", "current_total_price", "original_total_price"
    ]));
    if (direct > 0) return direct;
    const unit = safeNumber(firstValue(item, ["price", "unit_price", "variant_price", "pris"]));
    const qty = getArticleQuantity(item);
    return unit * qty;
  }

  function getCurrency(item, sourceRow) {
    return String(firstValue(item, ["currency", "currency_code"]) || firstValue(sourceRow, ["currency", "currency_code"]) || "EUR");
  }

  function getDateFromRow(row) {
    return firstValue(row, ["received_at", "created_at", "date", "datum", "updated_at", "processed_at"]);
  }

  function rowsFromApiResponse(data) {
    const parsed = parseMaybeJson(data) || data;
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed !== "object") return [];
    const preferred = ["items", "data", "rows", "results", "orders", "articles", "products", "line_items", "lineItems", "sales_lines"];
    for (const key of preferred) {
      const value = parsed[key];
      const nested = parseMaybeJson(value) || value;
      if (Array.isArray(nested)) return nested;
      if (nested && typeof nested === "object") {
        const rows = rowsFromApiResponse(nested);
        if (rows.length) return rows;
      }
    }
    return [parsed];
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function getTagValue(value, labels) {
    const parts = Array.isArray(value) ? value : String(value || "").split(/[,;|]/);
    for (const part of parts) {
      const text = String(part || "").trim();
      for (const label of labels) {
        const re = new RegExp(`^${label}\\s*[:=/-]\\s*(.+)$`, "i");
        const match = text.match(re);
        if (match && match[1]) return match[1].trim();
      }
    }
    return "";
  }

  function getShopifyPropertyValue(obj, labels) {
    if (!obj || typeof obj !== "object") return "";
    const sources = [
      obj.properties, obj.custom_attributes, obj.customAttributes, obj.metafields,
      obj.note_attributes, obj.noteAttributes, obj.attributes
    ].filter(Boolean);

    const normalizedLabels = labels.map((label) => String(label || "").toLowerCase().replace(/[_-]/g, " ").trim()).filter(Boolean);

    for (const source of sources) {
      const parsed = parseMaybeJson(source) || source;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;
          const name = String(entry.name || entry.key || entry.label || "").toLowerCase().replace(/[_-]/g, " ").trim();
          const value = entry.value ?? entry.val ?? entry.text;
          if (name && value != null && normalizedLabels.includes(name)) return normalizeFilterValue(value);
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          const name = String(key || "").toLowerCase().replace(/[_-]/g, " ").trim();
          if (value != null && normalizedLabels.includes(name)) return normalizeFilterValue(value);
        }
      }
    }
    return "";
  }

  function getMetaValue(item, row, keys) {
    const direct = firstValue(item, keys) || deepFirstValue(item, keys) || firstValue(row, keys) || deepFirstValue(row, keys);
    if (direct) return normalizeFilterValue(direct);
    const labels = keys.filter((key) => /^[a-zåäö_ -]+$/i.test(String(key))).map((key) => String(key).replace(/[_-]/g, " "));
    const propertyValue = getShopifyPropertyValue(item, labels) || getShopifyPropertyValue(row, labels);
    if (propertyValue) return propertyValue;
    const tagSource = firstValue(item, ["tags", "taggar", "labels"]) || deepFirstValue(item, ["tags", "taggar", "labels"]) ||
      firstValue(row, ["tags", "taggar", "labels"]) || deepFirstValue(row, ["tags", "taggar", "labels"]);
    return normalizeFilterValue(getTagValue(tagSource, labels));
  }

  function flattenArticleRows(rawRows) {
    const articleRows = [];
    (rawRows || []).forEach((row) => {
      const items = extractArticleArrays(row);
      const usableItems = items.length ? items : (hasArticleShape(row) ? [row] : []);
      usableItems.forEach((item) => {
        const name = getArticleName(item);
        const sku = getArticleSku(item);
        const quantity = getArticleQuantity(item);
        const revenue = getArticleRevenue(item);
        const currency = getCurrency(item, row);
        const date = getDateFromRow(row);
        const environment = getMetaValue(item, row, [
          "environment", "Environment", "env", "miljo", "miljö", "room", "setting"
        ]) || "Ej angivet";
        const collection = getMetaValue(item, row, [
          "collection", "Collection", "kollektion", "product_collection", "productCollection", "collection_title", "collections"
        ]) || "Ej angivet";
        const category = getMetaValue(item, row, [
          "category", "kategori", "product_type", "productType", "type", "typ"
        ]) || "Ej angivet";

        if (!name && !sku) return;
        articleRows.push({
          name,
          sku,
          quantity,
          revenue,
          currency,
          date,
          environment,
          collection,
          category,
          source: row
        });
      });
    });
    return articleRows;
  }

  function uniqueValues(rows, field) {
    return Array.from(new Set((rows || []).map((row) => normalizeFilterValue(row[field])).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "sv"));
  }

  function summarizeArticles(rows) {
    const byKey = new Map();
    let totalRevenue = 0;
    let totalQuantity = 0;
    let currency = rows[0]?.currency || "EUR";

    rows.forEach((row) => {
      const key = `${row.sku || ""}::${row.name || ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: row.name,
          sku: row.sku,
          environment: row.environment,
          collection: row.collection,
          category: row.category,
          quantity: 0,
          revenue: 0,
          currency: row.currency || currency,
          latest: "",
          lineCount: 0
        });
      }
      const entry = byKey.get(key);
      entry.quantity += Number(row.quantity) || 0;
      entry.revenue += Number(row.revenue) || 0;
      entry.lineCount += 1;
      if (row.date && (!entry.latest || String(row.date) > String(entry.latest))) entry.latest = row.date;
      totalRevenue += Number(row.revenue) || 0;
      totalQuantity += Number(row.quantity) || 0;
      currency = row.currency || currency;
    });

    const articles = Array.from(byKey.values())
      .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
      .map((entry) => ({
        ...entry,
        latestLabel: entry.latest ? formatDateLabel(getDateKey(entry.latest)) : "-"
      }));

    return {
      articles,
      totalRevenue,
      totalQuantity,
      articleCount: articles.length,
      lineCount: rows.length,
      currency
    };
  }

  function analysisCard(label, value) {
    return el("div", { style: "background:#fff;border:1px solid rgba(0,0,0,.10);border-radius:12px;padding:14px;min-height:72px;" }, [
      el("div", { class: "hint", style: "font-size:12px;margin-bottom:6px;" }, [label]),
      el("div", { style: "font-size:18px;font-weight:900;line-height:1.25;" }, [String(value)])
    ]);
  }

  function renderFilterSelect(label, values, currentValue, onChange) {
    const select = el("select", {
      style: "width:100%;padding:8px 10px;border:1px solid rgba(0,0,0,.18);border-radius:10px;background:#fff;",
      onchange: (event) => onChange(event.target.value)
    }, [
      el("option", { value: "" }, ["Alla"]),
      ...values.map((value) => el("option", { value }, [value]))
    ]);
    select.value = currentValue || "";
    return el("label", { style: "display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:#555;" }, [
      label,
      select
    ]);
  }

  function renderArticleAnalysisTable(stats) {
    const rows = (stats.articles || []).slice(0, 80);
    if (!rows.length) {
      return el("div", { class: "hint", style: "margin-top:12px;line-height:1.5;" }, [
        "Ingen artikelstatistik matchar filtren. Kontrollera Environment, Collection eller sökfält."
      ]);
    }

    return el("table", { style: "width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { style: "text-align:left;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Artikel"]),
          el("th", { style: "text-align:left;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["SKU"]),
          el("th", { style: "text-align:left;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Environment"]),
          el("th", { style: "text-align:left;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Collection"]),
          el("th", { style: "text-align:right;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Antal"]),
          el("th", { style: "text-align:right;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Försäljning"]),
          el("th", { style: "text-align:right;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Andel"]),
          el("th", { style: "text-align:right;border-bottom:1px solid rgba(0,0,0,.12);padding:8px;" }, ["Senast"])
        ])
      ]),
      el("tbody", {}, rows.map((row) => {
        const share = stats.totalRevenue > 0 ? (row.revenue / stats.totalRevenue) * 100 : 0;
        return el("tr", {}, [
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;font-weight:800;" }, [row.name || "-"]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;color:#666;" }, [row.sku || "-"]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;" }, [row.environment || "-"]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;" }, [row.collection || "-"]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;text-align:right;" }, [String(row.quantity || 0)]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;text-align:right;font-weight:900;" }, [formatMoney(row.revenue, row.currency || stats.currency)]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;text-align:right;" }, [`${share.toFixed(1)}%`]),
          el("td", { style: "border-bottom:1px solid rgba(0,0,0,.06);padding:8px;text-align:right;" }, [row.latestLabel || "-"])
        ]);
      }))
    ]);
  }

  function renderAnalysisPanel(processedData) {
    let allArticleRows = flattenArticleRows(processedData?.rawOrders || []);
    let filters = { environment: "", collection: "", category: "", search: "" };
    let loadingExtra = false;
    let sourceNote = allArticleRows.length
      ? "Artikeldata hittades i den ordinarie FSG-datan."
      : "Letar efter artikeldata i alternativa FSG-endpoints...";
    let triedNote = "";

    const root = el("div", {
      class: "statistics-analysis-panel",
      style: "margin-top:20px;background:#fafafa;border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.08);"
    }, []);

    function getFilterOptions() {
      return {
        environment: uniqueValues(allArticleRows, "environment"),
        collection: uniqueValues(allArticleRows, "collection"),
        category: uniqueValues(allArticleRows, "category")
      };
    }

    function getFilteredRows() {
      const search = String(filters.search || "").toLowerCase().trim();
      return allArticleRows.filter((row) => {
        if (filters.environment && row.environment !== filters.environment) return false;
        if (filters.collection && row.collection !== filters.collection) return false;
        if (filters.category && row.category !== filters.category) return false;
        if (search) {
          const haystack = `${row.name || ""} ${row.sku || ""} ${row.environment || ""} ${row.collection || ""}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      });
    }

    function renderInner() {
      const filterOptions = getFilterOptions();
      const rows = getFilteredRows();
      const stats = summarizeArticles(rows);
      const bestArticle = stats.articles[0];
      const avgPerUnit = stats.totalQuantity > 0 ? stats.totalRevenue / stats.totalQuantity : 0;
      root.innerHTML = "";

      root.appendChild(el("div", { style: "font-weight:900;font-size:18px;margin-bottom:6px;" }, ["Analys – försäljningsstatistik artiklar"]));
      root.appendChild(el("div", { class: "hint", style: "line-height:1.5;margin-bottom:14px;" }, [
        "Filtrera artikelstatistiken på Environment och Collection. Artikel/SKU är sökfält. Tabellen summerar artikelrader, inte orderöversikt."
      ]));

      if (loadingExtra) {
        root.appendChild(el("div", { style: "margin-bottom:14px;padding:12px;background:#fff;border:1px solid rgba(0,0,0,.10);border-radius:10px;" }, [
          "Laddar artikeldata..."
        ]));
      }

      root.appendChild(el("div", { class: "hint", style: "margin-bottom:12px;line-height:1.45;" }, [sourceNote]));

      const searchInput = el("input", {
        type: "search",
        placeholder: "Sök artikel eller SKU",
        value: filters.search || "",
        style: "width:100%;padding:8px 10px;border:1px solid rgba(0,0,0,.18);border-radius:10px;background:#fff;",
        oninput: (event) => {
          filters.search = event.target.value || "";
          renderInner();
        }
      }, []);

      root.appendChild(el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px;align-items:end;" }, [
        renderFilterSelect("Environment", filterOptions.environment, filters.environment, (value) => { filters.environment = value; renderInner(); }),
        renderFilterSelect("Collection", filterOptions.collection, filters.collection, (value) => { filters.collection = value; renderInner(); }),
        renderFilterSelect("Kategori/Typ", filterOptions.category, filters.category, (value) => { filters.category = value; renderInner(); }),
        el("label", { style: "display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:#555;" }, ["Artikel/SKU", searchInput])
      ]));

      root.appendChild(el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;" }, [
        analysisCard("Artikelförsäljning", formatMoney(stats.totalRevenue, stats.currency)),
        analysisCard("Sålda enheter", stats.totalQuantity || 0),
        analysisCard("Unika artiklar", stats.articleCount || 0),
        analysisCard("Snitt/st", formatMoney(avgPerUnit, stats.currency)),
        analysisCard("Bästa artikel", bestArticle ? `${bestArticle.name}: ${formatMoney(bestArticle.revenue, bestArticle.currency || stats.currency)}` : "-"),
        analysisCard("Artikelrader", stats.lineCount || 0)
      ]));

      root.appendChild(el("div", { style: "background:#fff;border:1px solid rgba(0,0,0,.10);border-radius:12px;padding:16px;margin-top:14px;overflow:auto;" }, [
        el("div", { style: "font-weight:800;font-size:16px;margin-bottom:4px;" }, ["Artiklar sorterade på försäljning"]),
        el("div", { class: "hint", style: "line-height:1.5;" }, [`Visar ${Math.min(stats.articles.length, 80)} av ${stats.articles.length} artiklar efter valda filter.`]),
        renderArticleAnalysisTable(stats)
      ]));

      if (!allArticleRows.length && !loadingExtra) {
        root.appendChild(el("div", { style: "margin-top:14px;padding:12px;background:#fff4e5;border:1px solid #f0c36d;border-radius:10px;line-height:1.5;" }, [
          "Ingen artikeldata hittades i orders-created/list. Analysen använder samma FSG-anrop som grafen, men behöver att API-svaret innehåller Shopify line_items/artikelrader.",
          triedNote ? el("div", { style: "margin-top:8px;font-size:12px;color:#666;" }, [triedNote]) : null
        ]));
      }
    }

    async function loadExtraArticleDataIfNeeded() {
      if (allArticleRows.length || loadingExtra) return;
      loadingExtra = true;
      renderInner();
      const result = await fetchArticleDataCandidates();
      loadingExtra = false;
      if (result.success && result.rows.length) {
        allArticleRows = result.rows;
        sourceNote = `Artikeldata hämtad från separat FSG-källa (${result.rows.length} artikelrader).`;
        try { console.log("[Statistics] Article analysis source:", result.sourceUrl, result); } catch (e) {}
      } else {
        const failed = (result.tried || []).map((entry) => `${entry.url}: ${entry.success ? "ingen line_items/artikeldata" : entry.error}`).join(" | ");
        triedNote = failed;
        sourceNote = "Ingen artikeldata hittades i FSG-datan från orders-created/list.";
        try { console.warn("[Statistics] No article rows found for analysis", result); } catch (e) {}
      }
      filters = { environment: "", collection: "", category: "", search: filters.search || "" };
      renderInner();
    }

    renderInner();
    setTimeout(loadExtraArticleDataIfNeeded, 0);
    return root;
  }

  // ---------------------------
  // Main render function
  // ---------------------------
  async function render(state, viewElement) {
    if (!viewElement) {
      console.error("[Statistics] No view element provided");
      return;
    }

    // Prevent double rendering
    if (viewElement.__statistics_rendering) {
      console.warn("[Statistics] Already rendering, ignoring duplicate call");
      return;
    }
    viewElement.__statistics_rendering = true;

    // Clear view completely
    viewElement.innerHTML = "";
    
    // Remove all children explicitly
    while (viewElement.lastChild) {
      viewElement.removeChild(viewElement.lastChild);
    }

    try {
      let latestProcessedData = null;
      let analysisPanel = null;
      const analysisHost = el("div", { class: "statistics-analysis-host" }, []);
      const analysisButton = el("button", {
        type: "button",
        class: "btn btn-secondary",
        style: "padding:8px 14px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:#fff;cursor:pointer;font-weight:700;",
        onclick: () => {
          if (!latestProcessedData) {
            alert("Analysen är inte klar ännu. Vänta tills FSG-data har laddats.");
            return;
          }
          if (analysisPanel) {
            analysisPanel.remove();
            analysisPanel = null;
            analysisButton.textContent = "Analys";
            return;
          }
          analysisPanel = renderAnalysisPanel(latestProcessedData);
          analysisHost.innerHTML = "";
          analysisHost.appendChild(analysisPanel);
          analysisButton.textContent = "Dölj analys";
        }
      }, ["Analys"]);

      // Add hero section
      viewElement.appendChild(hero("Statistik - Försäljningsöversikt", "Jämförelse av utkastordrar och slutförda ordrar från Shopify", [analysisButton]));
      viewElement.appendChild(analysisHost);

      // Add loading indicator
      const loadingEl = renderLoading();
      viewElement.appendChild(loadingEl);

      // Fetch data from API
      const apiResult = await fetchStatisticsData();

      // Remove loading indicator
      try { loadingEl.remove(); } catch(e) {}

      if (!apiResult.success) {
        // Show error
        viewElement.appendChild(renderError(apiResult.error || "Kunde inte hämta data från API"));
        return;
      }

      // Process the orders data
      const processedData = processOrdersData(apiResult.data);
      latestProcessedData = processedData;
      const { drafts, orders, series } = processedData;

      // COMBINED CHART at the top
      viewElement.appendChild(el("div", { style: "margin-top:20px;" }, [
        renderCombinedDailySalesChart(series)
      ]));

      // DRAFT ORDERS SECTION
      if (drafts.orderCount > 0) {
        viewElement.appendChild(el("div", { style: "margin-top:40px;" }, [
          el("h2", { style: "font-size:22px;font-weight:600;margin-bottom:16px;color:#4A90E2;" }, ["📋 Utkastordrar (Draft Orders)"]),
          renderTypesSummaryCards(drafts),
          renderTypeSummary(drafts, "Utkastordrar")
        ]));
      }

      // ACTUAL ORDERS SECTION
      if (orders.orderCount > 0) {
        viewElement.appendChild(el("div", { style: "margin-top:40px;" }, [
          el("h2", { style: "font-size:22px;font-weight:600;margin-bottom:16px;color:#7ED321;" }, ["✅ Slutförda ordrar (Orders)"]),
          renderTypesSummaryCards(orders),
          renderTypeSummary(orders, "Slutförda ordrar")
        ]));
      }

      // Overall summary
      const totalAllSales = drafts.totalSales + orders.totalSales;
      const totalAllOrders = drafts.orderCount + orders.orderCount;
      viewElement.appendChild(el("div", { style: "margin-top:50px;background:#f0f0f0;padding:24px;border-radius:8px;" }, [
        el("h2", { style: "font-size:20px;font-weight:600;margin-bottom:16px;" }, ["Totalt"]),
        el("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:20px;" }, [
          el("div", { style: "padding:12px;" }, [
            el("div", { style: "font-size:13px;color:#666;margin-bottom:4px;" }, ["Total försäljning"]),
            el("div", { style: "font-size:28px;font-weight:bold;color:#333;" }, [`${totalAllSales.toFixed(2)} EUR`])
          ]),
          el("div", { style: "padding:12px;" }, [
            el("div", { style: "font-size:13px;color:#666;margin-bottom:4px;" }, ["Totalt ordrar"]),
            el("div", { style: "font-size:28px;font-weight:bold;color:#333;" }, [String(totalAllOrders)])
          ])
        ])
      ]));

      // Add last updated timestamp
      const timestamp = new Date().toLocaleString("sv-SE");
      viewElement.appendChild(
        el("div", { 
          style: "margin-top:24px;text-align:center;color:#999;font-size:13px;" 
        }, [`Senast uppdaterad: ${timestamp}`])
      );
    } finally {
      // Clear the rendering flag
      viewElement.__statistics_rendering = false;
    }
  }

  // ---------------------------
  // Public API
  // ---------------------------
  Statistics.render = render;
  Statistics.fetchData = fetchStatisticsData;
  Statistics.processOrders = processOrdersData;
  Statistics.groupByDay = groupOrdersByDay;

  // Export for compatibility
  window.renderStatisticsView = render;

  try {
    console.log("[Statistics module] Loaded successfully");
  } catch (e) {}
})();
