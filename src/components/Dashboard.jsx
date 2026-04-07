import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '../App';
import { useItemMaster } from '../contexts/ItemMasterContext';

// ─── Excel export using SheetJS (CDN loaded via window.XLSX) ─────────────────
// Make sure to add this to your index.html:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

const Dashboard = () => {
  const { currentTheme } = useTheme();
  const { items: itemMaster } = useItemMaster();

  // ── Load bills & transactions from localStorage ──
  const bills = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('sale_bills') || '[]'); } catch { return []; }
  }, []);

  // ── Period filter ──
  const [period, setPeriod] = useState('monthly'); // daily | weekly | monthly | yearly
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-indexed
  const [reportTab, setReportTab] = useState('sales'); // sales | stock | items

  // ─── Date helpers ────────────────────────────────────────────────────────────
  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ─── Aggregated data ──────────────────────────────────────────────────────────
  const aggregated = useMemo(() => {
    const map = {};
    bills.forEach(bill => {
      const d = new Date(bill.billDate);
      if (isNaN(d)) return;
      let key, label;
      if (period === 'daily') {
        if (d.getFullYear() !== selectedYear || d.getMonth() !== selectedMonth) return;
        key = bill.billDate;
        label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (period === 'weekly') {
        if (d.getFullYear() !== selectedYear) return;
        const wk = getWeekNumber(d);
        key = `W${wk}`;
        label = `Week ${wk}`;
      } else if (period === 'monthly') {
        if (d.getFullYear() !== selectedYear) return;
        key = MONTHS[d.getMonth()];
        label = MONTHS_FULL[d.getMonth()];
      } else {
        key = String(d.getFullYear());
        label = String(d.getFullYear());
      }
      if (!map[key]) map[key] = { key, label, bills: 0, revenue: 0, taxable: 0, gst: 0, discount: 0 };
      map[key].bills += 1;
      map[key].revenue += bill.totals?.total || 0;
      map[key].taxable += bill.totals?.taxable || 0;
      map[key].gst += bill.totals?.tax || 0;
      map[key].discount += bill.totals?.disc || 0;
    });

    // Sort by natural order
    const order = period === 'monthly' ? MONTHS : null;
    const entries = Object.values(map);
    if (order) entries.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    else entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }, [bills, period, selectedYear, selectedMonth]);

  // ─── Overall stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalRevenue = bills.reduce((s, b) => s + (b.totals?.total || 0), 0);
    const totalGST = bills.reduce((s, b) => s + (b.totals?.tax || 0), 0);
    const totalDiscount = bills.reduce((s, b) => s + (b.totals?.disc || 0), 0);
    const totalBills = bills.length;
    const avgBill = totalBills ? totalRevenue / totalBills : 0;

    // Stock stats
    const totalStock = itemMaster.reduce((s, i) => s + (i.stock || 0), 0);
    const inventoryValue = itemMaster.reduce((s, i) => s + (i.stock || 0) * (i.defaultRate || 0), 0);
    const outOfStock = itemMaster.filter(i => !i.stock || i.stock === 0).length;
    const lowStock = itemMaster.filter(i => i.stock > 0 && i.stock < 10).length;

    // Top items sold
    const itemSales = {};
    bills.forEach(bill => {
      (bill.items || []).forEach(item => {
        if (!item.name) return;
        if (!itemSales[item.name]) itemSales[item.name] = { name: item.name, qty: 0, revenue: 0 };
        itemSales[item.name].qty += item.qty || 0;
        const calc = bill.items.find(i => i.id === item.id);
        if (calc) {
          const gross = (item.qty || 0) * (item.rate || 0);
          const discAmt = gross * ((item.disc || 0) / 100);
          itemSales[item.name].revenue += gross - discAmt;
        }
      });
    });
    const topItems = Object.values(itemSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    return { totalRevenue, totalGST, totalDiscount, totalBills, avgBill, totalStock, inventoryValue, outOfStock, lowStock, topItems };
  }, [bills, itemMaster]);

  // ─── Max value for bar chart ─────────────────────────────────────────────────
  const maxRevenue = useMemo(() => Math.max(...aggregated.map(r => r.revenue), 1), [aggregated]);

  // ─── Available years ─────────────────────────────────────────────────────────
  const years = useMemo(() => {
    const ys = new Set(bills.map(b => new Date(b.billDate).getFullYear()).filter(y => !isNaN(y)));
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [bills]);

  // ─── Excel Export ────────────────────────────────────────────────────────────
  const exportExcel = useCallback(() => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert('SheetJS not loaded. Add XLSX CDN to index.html'); return; }

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Sales Report ──
    const salesData = [
      ['InvoicePro — Sales Report'],
      [`Period: ${period.toUpperCase()} | Year: ${selectedYear}${period === 'daily' ? ` | Month: ${MONTHS_FULL[selectedMonth]}` : ''}`],
      [],
      ['Period', 'No. of Bills', 'Gross Revenue (₹)', 'Taxable Amount (₹)', 'GST Collected (₹)', 'Discount (₹)', 'Net Revenue (₹)'],
      ...aggregated.map(r => [r.label, r.bills, r.revenue, r.taxable, r.gst, r.discount, r.revenue]),
      [],
      ['TOTALS',
        aggregated.reduce((s, r) => s + r.bills, 0),
        aggregated.reduce((s, r) => s + r.revenue, 0),
        aggregated.reduce((s, r) => s + r.taxable, 0),
        aggregated.reduce((s, r) => s + r.gst, 0),
        aggregated.reduce((s, r) => s + r.discount, 0),
        aggregated.reduce((s, r) => s + r.revenue, 0),
      ]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(salesData);
    ws1['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Sales Report');

    // ── Sheet 2: All Bills ──
    const billsData = [
      ['All Invoices'],
      [],
      ['Bill No', 'Date', 'Due Date', 'Company', 'Customer', 'GST Mode', 'Type', 'Gross (₹)', 'Discount (₹)', 'Taxable (₹)', 'GST (₹)', 'Total (₹)'],
      ...bills.map(b => [
        b.billNo, b.billDate, b.dueDate || '', b.company?.name || '', b.customer?.name || '',
        b.gstMode, b.isInterState ? 'Inter-State' : 'Intra-State',
        b.totals?.gross || 0, b.totals?.disc || 0, b.totals?.taxable || 0,
        b.totals?.tax || 0, b.totals?.total || 0
      ])
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(billsData);
    ws2['!cols'] = new Array(12).fill({ wch: 18 });
    XLSX.utils.book_append_sheet(wb, ws2, 'All Invoices');

    // ── Sheet 3: Stock Report ──
    const stockData = [
      ['Stock / Inventory Report'],
      [`Generated: ${new Date().toLocaleString('en-IN')}`],
      [],
      ['Item Name', 'Rate (₹)', 'Tax %', 'Current Stock', 'Total Value (₹)', 'Status'],
      ...itemMaster.map(i => [
        i.name, i.defaultRate || 0, i.defaultTaxPercent || 0, i.stock || 0,
        (i.stock || 0) * (i.defaultRate || 0),
        (i.stock || 0) === 0 ? 'Out of Stock' : (i.stock || 0) < 10 ? 'Low Stock' : 'In Stock'
      ]),
      [],
      ['SUMMARY', '', '', '', ''],
      ['Total Items', itemMaster.length, '', '', ''],
      ['Out of Stock', stats.outOfStock, '', '', ''],
      ['Low Stock (<10)', stats.lowStock, '', '', ''],
      ['Total Units', stats.totalStock, '', '', ''],
      ['Inventory Value (₹)', stats.inventoryValue, '', '', ''],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(stockData);
    ws3['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Stock Report');

    // ── Sheet 4: Top Items ──
    const topData = [
      ['Top Selling Items'],
      [],
      ['Rank', 'Item Name', 'Total Qty Sold', 'Total Revenue (₹)'],
      ...stats.topItems.map((item, i) => [i + 1, item.name, item.qty, item.revenue.toFixed(2)])
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(topData);
    ws4['!cols'] = [{ wch: 8 }, { wch: 24 }, { wch: 16 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Top Items');

    // ── Save ──
    const fileName = `InvoicePro_Report_${period}_${selectedYear}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }, [aggregated, bills, itemMaster, stats, period, selectedYear, selectedMonth]);

  // ─── Color helpers ───────────────────────────────────────────────────────────
  const fmt = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtC = (n) => '₹' + fmt(n);

  return (
    <div className={`container-fluid py-4 theme-${currentTheme}`}>

      {/* ── Page Header ── */}
      <div className="glass-card shadow-xl mb-4 p-4 fade-in-up">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <h2 className="fw-bold mb-1">
              <i className="bi bi-bar-chart-line text-primary me-2"></i>
              Business Dashboard
            </h2>
            <small className="text-muted">Sales analytics, stock overview & report generation</small>
          </div>
          <button className="btn btn-success d-flex align-items-center gap-2" onClick={exportExcel}>
            <i className="bi bi-file-earmark-excel-fill"></i>
            Export Excel Report
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Revenue', value: fmtC(stats.totalRevenue), color: 'success', icon: 'bi-currency-rupee', sub: `${stats.totalBills} invoices` },
          { label: 'GST Collected', value: fmtC(stats.totalGST), color: 'warning', icon: 'bi-percent', sub: `${stats.totalRevenue ? ((stats.totalGST / stats.totalRevenue) * 100).toFixed(1) : 0}% of revenue` },
          { label: 'Avg Bill Value', value: fmtC(stats.avgBill), color: 'info', icon: 'bi-receipt', sub: 'per invoice' },
          { label: 'Total Discount', value: fmtC(stats.totalDiscount), color: 'danger', icon: 'bi-tag', sub: 'given to customers' },
          { label: 'Total Stock Units', value: fmt(stats.totalStock), color: 'primary', icon: 'bi-boxes', sub: `${itemMaster.length} items` },
          { label: 'Inventory Value', value: fmtC(stats.inventoryValue), color: 'secondary', icon: 'bi-safe2', sub: 'at current rates' },
          { label: 'Out of Stock', value: stats.outOfStock, color: 'danger', icon: 'bi-x-circle', sub: 'items need restock' },
          { label: 'Low Stock', value: stats.lowStock, color: 'warning', icon: 'bi-exclamation-triangle', sub: 'items below 10 units' },
        ].map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="glass-card p-3 h-100 d-flex flex-column">
              <div className="d-flex align-items-center gap-2 mb-1">
                <i className={`bi ${s.icon} text-${s.color}`}></i>
                <small className="text-muted">{s.label}</small>
              </div>
              <div className={`fw-bold fs-4 text-${s.color}`}>{s.value}</div>
              <small className="text-muted mt-auto">{s.sub}</small>
            </div>
          </div>
        ))}
      </div>

      {/* ── Report Tabs ── */}
      <div className="glass-card shadow-xl p-0 overflow-hidden mb-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 px-4 pt-3 border-bottom pb-3">
          <ul className="nav nav-tabs border-0 gap-1">
            {[['sales', 'bi-graph-up', 'Sales Report'], ['stock', 'bi-boxes', 'Stock Report'], ['items', 'bi-trophy', 'Top Items']].map(([tab, icon, label]) => (
              <li key={tab} className="nav-item">
                <button className={`nav-link border-0 ${reportTab === tab ? 'active' : ''}`} onClick={() => setReportTab(tab)}>
                  <i className={`bi ${icon} me-1`}></i>{label}
                </button>
              </li>
            ))}
          </ul>

          {/* Period Controls — only for sales tab */}
          {reportTab === 'sales' && (
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <div className="btn-group btn-group-sm">
                {[['daily','Day'],['weekly','Week'],['monthly','Month'],['yearly','Year']].map(([val, label]) => (
                  <button key={val} className={`btn ${period === val ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setPeriod(val)}>{label}</button>
                ))}
              </div>
              <select className="form-select form-select-sm" style={{ width: 'auto' }} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {period === 'daily' && (
                <select className="form-select form-select-sm" style={{ width: 'auto' }} value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>
                  {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="p-4">

          {/* ════ SALES REPORT ════ */}
          {reportTab === 'sales' && (
            <div>
              {aggregated.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-bar-chart display-1 d-block mb-3 opacity-25"></i>
                  <h5>No sales data for selected period</h5>
                </div>
              ) : (
                <>
                  {/* Bar Chart */}
                  <div className="mb-4">
                    <h6 className="fw-bold mb-3 text-muted">Revenue Chart</h6>
                    <div className="d-flex align-items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
                      {aggregated.map((r, i) => (
                        <div key={i} className="d-flex flex-column align-items-center flex-shrink-0" style={{ minWidth: 50 }}>
                          <small className="text-muted mb-1" style={{ fontSize: 10 }}>{fmtC(r.revenue)}</small>
                          <div
                            className="rounded-top bg-primary"
                            style={{
                              width: 40,
                              height: Math.max(4, (r.revenue / maxRevenue) * 120),
                              transition: 'height 0.4s ease',
                              opacity: 0.85
                            }}
                            title={`${r.label}: ${fmtC(r.revenue)}`}
                          ></div>
                          <small className="text-muted mt-1" style={{ fontSize: 10, textAlign: 'center', maxWidth: 50, wordBreak: 'break-word' }}>{r.key}</small>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sales Table */}
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-dark">
                        <tr>
                          <th>Period</th>
                          <th className="text-end">Bills</th>
                          <th className="text-end">Gross Revenue</th>
                          <th className="text-end">Taxable Amt</th>
                          <th className="text-end">GST</th>
                          <th className="text-end">Discount</th>
                          <th className="text-end">Net Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregated.map((r, i) => (
                          <tr key={i}>
                            <td className="fw-semibold">{r.label}</td>
                            <td className="text-end"><span className="badge bg-primary">{r.bills}</span></td>
                            <td className="text-end">{fmtC(r.revenue)}</td>
                            <td className="text-end">{fmtC(r.taxable)}</td>
                            <td className="text-end text-warning">{fmtC(r.gst)}</td>
                            <td className="text-end text-danger">{fmtC(r.discount)}</td>
                            <td className="text-end fw-bold text-success">{fmtC(r.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="table-secondary fw-bold">
                        <tr>
                          <td>Total ({aggregated.length} periods)</td>
                          <td className="text-end">{aggregated.reduce((s, r) => s + r.bills, 0)}</td>
                          <td className="text-end">{fmtC(aggregated.reduce((s, r) => s + r.revenue, 0))}</td>
                          <td className="text-end">{fmtC(aggregated.reduce((s, r) => s + r.taxable, 0))}</td>
                          <td className="text-end text-warning">{fmtC(aggregated.reduce((s, r) => s + r.gst, 0))}</td>
                          <td className="text-end text-danger">{fmtC(aggregated.reduce((s, r) => s + r.discount, 0))}</td>
                          <td className="text-end text-success">{fmtC(aggregated.reduce((s, r) => s + r.revenue, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════ STOCK REPORT ════ */}
          {reportTab === 'stock' && (
            <div>
              {itemMaster.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-boxes display-1 d-block mb-3 opacity-25"></i>
                  <h5>No items in inventory</h5>
                </div>
              ) : (
                <>
                  {/* Stock mini-chart */}
                  <div className="mb-4">
                    <h6 className="fw-bold mb-3 text-muted">Stock Level Overview</h6>
                    <div className="d-flex align-items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 120 }}>
                      {itemMaster.slice(0, 20).map((item, i) => {
                        const s = item.stock || 0;
                        const maxS = Math.max(...itemMaster.map(x => x.stock || 0), 1);
                        const color = s === 0 ? 'danger' : s < 10 ? 'warning' : 'success';
                        return (
                          <div key={i} className="d-flex flex-column align-items-center flex-shrink-0" style={{ minWidth: 44 }}>
                            <small className="text-muted mb-1" style={{ fontSize: 9 }}>{s}</small>
                            <div className={`rounded-top bg-${color}`} style={{ width: 36, height: Math.max(4, (s / maxS) * 90), transition: 'height 0.4s' }} title={`${item.name}: ${s}`}></div>
                            <small className="text-muted mt-1" style={{ fontSize: 9, textAlign: 'center', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</small>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-dark">
                        <tr>
                          <th>#</th>
                          <th>Item Name</th>
                          <th className="text-end">Rate (₹)</th>
                          <th className="text-end">Tax %</th>
                          <th className="text-end">Stock</th>
                          <th className="text-end">Value (₹)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemMaster.map((item, i) => {
                          const s = item.stock || 0;
                          const status = s === 0 ? 'danger' : s < 10 ? 'warning' : 'success';
                          const label = s === 0 ? 'Out of Stock' : s < 10 ? 'Low Stock' : 'In Stock';
                          return (
                            <tr key={item.id} className={status === 'danger' ? 'table-danger bg-opacity-10' : status === 'warning' ? 'table-warning bg-opacity-10' : ''}>
                              <td className="text-muted small">{i + 1}</td>
                              <td className="fw-semibold">{item.name}</td>
                              <td className="text-end">₹{(item.defaultRate || 0).toFixed(2)}</td>
                              <td className="text-end"><span className="badge bg-secondary">{item.defaultTaxPercent || 0}%</span></td>
                              <td className="text-end fw-bold">{s.toLocaleString()}</td>
                              <td className="text-end">₹{(s * (item.defaultRate || 0)).toLocaleString('en-IN')}</td>
                              <td><span className={`badge bg-${status}`}>{label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="table-secondary fw-bold">
                        <tr>
                          <td colSpan="4">Total ({itemMaster.length} items)</td>
                          <td className="text-end">{stats.totalStock.toLocaleString()} units</td>
                          <td className="text-end text-success">{fmtC(stats.inventoryValue)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════ TOP ITEMS ════ */}
          {reportTab === 'items' && (
            <div>
              {stats.topItems.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-trophy display-1 d-block mb-3 opacity-25"></i>
                  <h5>No item sales data yet</h5>
                </div>
              ) : (
                <>
                  {/* Bar chart for top items */}
                  <div className="mb-4">
                    <h6 className="fw-bold mb-3 text-muted">Top Items by Revenue</h6>
                    {stats.topItems.map((item, i) => {
                      const maxR = stats.topItems[0]?.revenue || 1;
                      const pct = (item.revenue / maxR) * 100;
                      return (
                        <div key={i} className="mb-2">
                          <div className="d-flex justify-content-between mb-1">
                            <span className="small fw-semibold">
                              <span className="badge bg-secondary me-2">#{i + 1}</span>{item.name}
                            </span>
                            <span className="small text-muted">{fmtC(item.revenue)} | {item.qty} units</span>
                          </div>
                          <div className="progress" style={{ height: 8 }}>
                            <div className="progress-bar bg-primary" style={{ width: `${pct}%`, transition: 'width 0.5s' }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-dark">
                        <tr>
                          <th>#</th>
                          <th>Item Name</th>
                          <th className="text-end">Qty Sold</th>
                          <th className="text-end">Revenue (₹)</th>
                          <th className="text-end">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.topItems.map((item, i) => (
                          <tr key={i}>
                            <td><span className={`badge ${i === 0 ? 'bg-warning text-dark' : i === 1 ? 'bg-secondary' : 'bg-light text-dark border'}`}>#{i + 1}</span></td>
                            <td className="fw-semibold">{item.name}</td>
                            <td className="text-end">{item.qty.toLocaleString()}</td>
                            <td className="text-end fw-bold text-success">{fmtC(item.revenue)}</td>
                            <td className="text-end">
                              <div className="d-flex align-items-center justify-content-end gap-2">
                                <span className="small">{stats.totalRevenue ? ((item.revenue / stats.totalRevenue) * 100).toFixed(1) : 0}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Recent Bills Quick View ── */}
      {bills.length > 0 && (
        <div className="glass-card shadow-xl p-4">
          <h5 className="fw-bold mb-3"><i className="bi bi-clock-history text-info me-2"></i>Recent Invoices</h5>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-dark">
                <tr><th>Bill No</th><th>Date</th><th>Customer</th><th className="text-end">Total</th><th>GST</th></tr>
              </thead>
              <tbody>
                {bills.slice(0, 8).map(bill => (
                  <tr key={bill.id}>
                    <td><span className="badge bg-primary">{bill.billNo}</span></td>
                    <td><small>{new Date(bill.billDate).toLocaleDateString('en-IN')}</small></td>
                    <td>{bill.customer?.name || '—'}</td>
                    <td className="text-end fw-bold text-success">{fmtC(bill.totals?.total || 0)}</td>
                    <td><span className={`badge ${bill.gstMode === 'none' ? 'bg-secondary' : 'bg-success'}`}>{bill.gstMode}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;