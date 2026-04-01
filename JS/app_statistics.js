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
        series: []
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
      series
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
        console.warn('[Statistics] Chart.js not loaded');
        container.appendChild(el("div", {
          style: "padding:20px;color:#999;text-align:center;"
        }, ["Chart.js library not loaded. Please check your internet connection."]));
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
      // Add hero section
      viewElement.appendChild(hero("Statistik - Försäljningsöversikt", "Jämförelse av utkastordrar och slutförda ordrar från Shopify", []));

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
