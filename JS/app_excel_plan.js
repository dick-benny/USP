export function createExcelPlanController({ state, normalizeStatusValue }) {
  function parseDateValue(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '--' || raw === '-- -- --') return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function addMonthsToDate(date, months) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  function getIsoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function getWeekFromDateValue(value) {
    const date = parseDateValue(value);
    return date ? getIsoWeek(date) : null;
  }

  function parseWeekNumber(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '--') return null;
    const match = raw.match(/\d{1,2}/);
    if (!match) return null;
    const week = Number(match[0]);
    return week >= 1 && week <= 53 ? week : null;
  }

  function formatWeekLabel(week) {
    return `v${String(week).padStart(2, '0')}`;
  }

  function buildWeekRange(startWeek, endWeek) {
    if (!startWeek || !endWeek) return [];
    const weeks = [];
    let week = startWeek;
    let guard = 0;

    while (guard < 60) {
      weeks.push(week);
      if (week === endWeek) break;
      week += 1;
      if (week > 53) week = 1;
      guard += 1;
    }

    return weeks;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getPlanCellStyle(status) {
    const normalized = normalizeStatusValue(status || 'gray');
    const styles = {
      green: 'background:#d9ead3;color:#274e13;border:1px solid #b6d7a8;',
      yellow: 'background:#fff2cc;color:#7f6000;border:1px solid #f1c232;',
      red: 'background:#f4cccc;color:#990000;border:1px solid #e06666;',
      gray: 'background:#eeeeee;color:#666666;border:1px solid #d9d9d9;',
    };
    return styles[normalized] || styles.gray;
  }

  function addPlanEvent(eventsByWeek, week, label, status) {
    if (!week) return;
    if (!eventsByWeek.has(week)) eventsByWeek.set(week, []);
    eventsByWeek.get(week).push({ label, status: normalizeStatusValue(status || 'gray') });
  }

  function buildSalesIntroPlanRows() {
    const rows = state.rowsByTable['SÄLJINTRO'] || [];
    const planRows = [];
    const startWeeks = [];
    const endWeeks = [];

    rows.forEach((row) => {
      const product = String(row?.produkt || '').trim();
      if (!product) return;

      const poDate = parseDateValue(row.po_beslut_datum);
      const levDate = poDate ? addMonthsToDate(poDate, 5) : null;
      const poWeek = poDate ? getIsoWeek(poDate) : null;
      const b2bWeek = getWeekFromDateValue(row.b2b_ready_datum);
      const shopWeek = getWeekFromDateValue(row.shopify_ready_datum);
      const levWeek = levDate ? getIsoWeek(levDate) : null;
      const dropWeek = parseWeekNumber(row.drop_vecka || row.drop || row.drop_datum);

      if (poWeek) startWeeks.push(poWeek);
      if (dropWeek) endWeeks.push(dropWeek);

      const eventsByWeek = new Map();
      addPlanEvent(eventsByWeek, poWeek, 'PO', row.po_beslut);
      addPlanEvent(eventsByWeek, b2bWeek, 'B2B', row.b2b_ready);
      addPlanEvent(eventsByWeek, shopWeek, 'SHOP', row.shopify_ready);
      addPlanEvent(eventsByWeek, levWeek, 'LEV', 'yellow');
      addPlanEvent(eventsByWeek, dropWeek, 'DROP', row.drop_status || row.drop_vecka_status || 'gray');

      planRows.push({
        product,
        owner: row.owner_initials || '',
        startWeek: poWeek,
        endWeek: dropWeek,
        levDate,
        eventsByWeek,
      });
    });

    const startWeek = startWeeks.length ? Math.min(...startWeeks) : 1;
    const endWeek = endWeeks.length ? Math.max(...endWeeks) : Math.max(startWeek, 12);
    const weeks = buildWeekRange(startWeek, endWeek);

    return { rows: planRows, weeks, startWeek, endWeek };
  }

  function buildSalesIntroExcelHtml() {
    const { rows, weeks, startWeek, endWeek } = buildSalesIntroPlanRows();

    if (!rows.length) {
      alert('Det finns inga Säljintro-rader att exportera.');
      return '';
    }

    const now = new Date();
    const generatedAt = now.toLocaleString('sv-SE');

    const weekHeaders = weeks.map((week) => `<th class="week">${formatWeekLabel(week)}</th>`).join('');

    const bodyRows = rows.map((row) => {
      const weekCells = weeks.map((week) => {
        const events = row.eventsByWeek.get(week) || [];
        if (!events.length) return '<td class="week-cell"></td>';

        const content = events.map((event) =>
          `<span class="event" style="${getPlanCellStyle(event.status)}">${escapeHtml(event.label)}</span>`
        ).join('<br>');

        return `<td class="week-cell has-event">${content}</td>`;
      }).join('');

      return `
        <tr>
          <td class="product">${escapeHtml(row.product)}</td>
          <td class="owner">${escapeHtml(row.owner)}</td>
          <td>${row.startWeek ? formatWeekLabel(row.startWeek) : ''}</td>
          <td>${row.endWeek ? formatWeekLabel(row.endWeek) : ''}</td>
          <td>${row.levDate ? escapeHtml(row.levDate.toLocaleDateString('sv-SE')) : ''}</td>
          ${weekCells}
        </tr>
      `;
    }).join('');

    return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Säljintro Excel-plan</title>
<style>
  body {
    margin: 0;
    padding: 24px;
    font-family: Arial, sans-serif;
    color: #2f2f2f;
    background: #f6f2ea;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0 18px;
    background: #f6f2ea;
  }
  h1 {
    margin: 0;
    font-size: 22px;
  }
  .meta {
    margin: 4px 0 0;
    color: #6f6759;
    font-size: 13px;
  }
  button {
    border: 1px solid #c9b99b;
    border-radius: 999px;
    background: #fffaf0;
    color: #2f2f2f;
    padding: 9px 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .table-wrap {
    overflow: auto;
    max-height: calc(100vh - 120px);
    border: 1px solid #d6c8aa;
    background: #fff;
  }
  table {
    border-collapse: collapse;
    font-size: 12px;
    min-width: 100%;
  }
  th, td {
    border: 1px solid #d9d0bd;
    padding: 6px 7px;
    text-align: center;
    white-space: nowrap;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #e8dcc3;
    font-weight: 800;
  }
  .product {
    position: sticky;
    left: 0;
    z-index: 1;
    background: #fff;
    min-width: 220px;
    max-width: 360px;
    text-align: left;
    font-weight: 700;
  }
  th.product {
    z-index: 3;
    background: #e8dcc3;
  }
  .owner {
    min-width: 54px;
  }
  .week {
    min-width: 52px;
  }
  .week-cell {
    min-width: 52px;
    height: 28px;
  }
  .event {
    display: inline-block;
    min-width: 34px;
    padding: 3px 5px;
    border-radius: 6px;
    font-weight: 800;
    font-size: 11px;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar button { display: none; }
    .table-wrap { max-height: none; overflow: visible; border: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>Säljintro Excel-plan</h1>
      <p class="meta">Start ${formatWeekLabel(startWeek)} · Slut ${formatWeekLabel(endWeek)} · Genererad ${escapeHtml(generatedAt)}</p>
    </div>
    <button id="downloadExcel" type="button">Ladda ned Excel</button>
  </div>
  <div class="table-wrap">
    <table id="planTable">
      <thead>
        <tr>
          <th class="product">Produkt</th>
          <th>Owner</th>
          <th>Start</th>
          <th>Slut</th>
          <th>LEV</th>
          ${weekHeaders}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  </div>
<script>
  document.getElementById('downloadExcel').addEventListener('click', function () {
    const html = '<html><head><meta charset="utf-8"></head><body>' + document.getElementById('planTable').outerHTML + '</body></html>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'saljintro-excel-plan.xls';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
</script>
</body>
</html>`;
  }

  function openSalesIntroExcelPlan() {
    const win = window.open('', '_blank');

    if (!win) {
      alert('Kunde inte öppna ny flik. Tillåt popups för sidan och försök igen.');
      return;
    }

    const html = buildSalesIntroExcelHtml();
    if (!html) {
      win.close();
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return {
    openSalesIntroExcelPlan,
  };
}
