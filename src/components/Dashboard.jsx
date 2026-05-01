import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '../App';
import { useItemMaster } from '../contexts/ItemMasterContext';

// DB field helpers (matches ItemMaster API response)
const getName  = (i) => i.ItemName ?? i.name ?? '';
const getRate  = (i) => Number(i.Rate  ?? i.defaultRate  ?? 0);
const getTax   = (i) => Number(i.Tax   ?? i.defaultTaxPercent ?? 0);
const getStock = (i) => Number(i.Stock ?? i.stock ?? 0);
const getId    = (i) => i.ItemCode ?? i.id ?? Math.random();

const Dashboard = () => {
  const { currentTheme } = useTheme();
  const { items: itemMaster } = useItemMaster();

  const bills = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('sale_bills') || '[]'); } catch { return []; }
  }, []);

  const [period, setPeriod]             = useState('monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [reportTab, setReportTab]       = useState('sales');

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const aggregated = useMemo(() => {
    const map = {};
    bills.forEach(bill => {
      const d = new Date(bill.billDate);
      if (isNaN(d)) return;
      let key, label;
      if (period === 'daily') {
        if (d.getFullYear() !== selectedYear || d.getMonth() !== selectedMonth) return;
        key = bill.billDate; label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (period === 'weekly') {
        if (d.getFullYear() !== selectedYear) return;
        const wk = getWeekNumber(d); key = `W${wk}`; label = `Week ${wk}`;
      } else if (period === 'monthly') {
        if (d.getFullYear() !== selectedYear) return;
        key = MONTHS[d.getMonth()]; label = MONTHS_FULL[d.getMonth()];
      } else {
        key = String(d.getFullYear()); label = String(d.getFullYear());
      }
      if (!map[key]) map[key] = { key, label, bills: 0, revenue: 0, taxable: 0, gst: 0, discount: 0 };
      map[key].bills   += 1;
      map[key].revenue += bill.totals?.total   || 0;
      map[key].taxable += bill.totals?.taxable || 0;
      map[key].gst     += bill.totals?.tax     || 0;
      map[key].discount+= bill.totals?.disc    || 0;
    });
    const order   = period === 'monthly' ? MONTHS : null;
    const entries = Object.values(map);
    if (order) entries.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    else       entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }, [bills, period, selectedYear, selectedMonth]);

  const stats = useMemo(() => {
    const totalRevenue  = bills.reduce((s, b) => s + (b.totals?.total || 0), 0);
    const totalGST      = bills.reduce((s, b) => s + (b.totals?.tax   || 0), 0);
    const totalDiscount = bills.reduce((s, b) => s + (b.totals?.disc  || 0), 0);
    const totalBills    = bills.length;
    const avgBill       = totalBills ? totalRevenue / totalBills : 0;

    const totalStock      = itemMaster.reduce((s, i) => s + getStock(i), 0);
    const inventoryValue  = itemMaster.reduce((s, i) => s + getStock(i) * getRate(i), 0);
    const outOfStock      = itemMaster.filter(i => getStock(i) === 0).length;
    const lowStock        = itemMaster.filter(i => getStock(i) > 0 && getStock(i) < 10).length;

    const itemSales = {};
    bills.forEach(bill => {
      (bill.items || []).forEach(item => {
        if (!item.name) return;
        if (!itemSales[item.name]) itemSales[item.name] = { name: item.name, qty: 0, revenue: 0 };
        itemSales[item.name].qty += item.qty || 0;
        const gross   = (item.qty || 0) * (item.rate || 0);
        const discAmt = gross * ((item.disc || 0) / 100);
        itemSales[item.name].revenue += gross - discAmt;
      });
    });
    const topItems = Object.values(itemSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    return { totalRevenue, totalGST, totalDiscount, totalBills, avgBill, totalStock, inventoryValue, outOfStock, lowStock, topItems };
  }, [bills, itemMaster]);

  const maxRevenue = useMemo(() => Math.max(...aggregated.map(r => r.revenue), 1), [aggregated]);

  const years = useMemo(() => {
    const ys = new Set(bills.map(b => new Date(b.billDate).getFullYear()).filter(y => !isNaN(y)));
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [bills]);

  const exportExcel = useCallback(() => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert('SheetJS not loaded. Add XLSX CDN to index.html'); return; }
    const wb = XLSX.utils.book_new();
    const salesData = [
      ['InvoicePro — Sales Report'],
      [`Period: ${period.toUpperCase()} | Year: ${selectedYear}`],
      [],
      ['Period', 'Bills', 'Revenue', 'Taxable', 'GST', 'Discount'],
      ...aggregated.map(r => [r.label, r.bills, r.revenue, r.taxable, r.gst, r.discount]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salesData), 'Sales');
    const stockData = [
      ['Stock Report'],
      [],
      ['Item Name', 'Rate', 'Tax%', 'Stock', 'Value', 'Status'],
      ...itemMaster.map(i => [getName(i), getRate(i), getTax(i), getStock(i), getStock(i)*getRate(i),
        getStock(i) === 0 ? 'Out of Stock' : getStock(i) < 10 ? 'Low Stock' : 'In Stock']),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockData), 'Stock');
    XLSX.writeFile(wb, `InvoicePro_${period}_${selectedYear}.xlsx`);
  }, [aggregated, itemMaster, period, selectedYear]);

  const fmt  = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtC = (n) => 'Rs.' + fmt(n);

  const kpiCards = [
    { label: 'Total Revenue',    value: fmtC(stats.totalRevenue),   color: 'success',   icon: 'bi-currency-rupee',      sub: `${stats.totalBills} invoices` },
    { label: 'GST Collected',    value: fmtC(stats.totalGST),       color: 'warning',   icon: 'bi-percent',             sub: `${stats.totalRevenue ? ((stats.totalGST/stats.totalRevenue)*100).toFixed(1) : 0}% of revenue` },
    { label: 'Avg Bill Value',   value: fmtC(stats.avgBill),        color: 'info',      icon: 'bi-receipt',             sub: 'per invoice' },
    { label: 'Total Discount',   value: fmtC(stats.totalDiscount),  color: 'danger',    icon: 'bi-tag',                 sub: 'given to customers' },
    { label: 'Stock Units',      value: fmt(stats.totalStock),      color: 'primary',   icon: 'bi-boxes',               sub: `${itemMaster.length} items` },
    { label: 'Inventory Value',  value: fmtC(stats.inventoryValue), color: 'secondary', icon: 'bi-safe2',               sub: 'at current rates' },
    { label: 'Out of Stock',     value: stats.outOfStock,           color: 'danger',    icon: 'bi-x-circle',            sub: 'need restock' },
    { label: 'Low Stock',        value: stats.lowStock,             color: 'warning',   icon: 'bi-exclamation-triangle',sub: 'below 10 units' },
  ];

  return (
    <div className={`container-fluid py-3 py-md-4 theme-${currentTheme}`}>

      {/* ── Page Header ── */}
      <div className="glass-card shadow-xl mb-4 p-3 p-md-4 fade-in-up">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-3">
          <div>
            <h2 className="fw-bold mb-1 fs-4 fs-md-2">
              <i className="bi bi-bar-chart-line text-primary me-2"></i>
              Business Dashboard
            </h2>
            <small className="text-muted">Sales analytics, stock overview & report generation</small>
          </div>
          <button className="btn btn-success btn-sm btn-md-normal d-flex align-items-center gap-2 align-self-start align-self-md-center" onClick={exportExcel}>
            <i className="bi bi-file-earmark-excel-fill"></i>
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards — 2 cols mobile, 4 cols desktop ── */}
      <div className="row g-2 g-md-3 mb-4">
        {kpiCards.map((s, i) => (
          <div key={i} className="col-6 col-md-3">
            <div className="glass-card p-2 p-md-3 h-100 d-flex flex-column">
              <div className="d-flex align-items-center gap-1 gap-md-2 mb-1">
                <i className={`bi ${s.icon} text-${s.color} small`}></i>
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>{s.label}</small>
              </div>
              <div className={`fw-bold text-${s.color}`} style={{ fontSize: 'clamp(1rem, 3vw, 1.4rem)' }}>{s.value}</div>
              <small className="text-muted mt-auto" style={{ fontSize: '0.65rem' }}>{s.sub}</small>
            </div>
          </div>
        ))}
      </div>

      {/* ── Report Tabs ── */}
      <div className="glass-card shadow-xl p-0 overflow-hidden mb-4">

        {/* Tab Header */}
        <div className="px-3 px-md-4 pt-3 border-bottom pb-3">

          {/* Tab buttons — scrollable on mobile */}
          <div className="d-flex align-items-center justify-content-between flex-column flex-md-row gap-2 gap-md-3">
            <div className="overflow-auto w-100 w-md-auto">
              <ul className="nav nav-tabs border-0 gap-1 flex-nowrap">
                {[
                  ['sales', 'bi-graph-up',  'Sales Report'],
                  ['stock', 'bi-boxes',     'Stock Report'],
                  ['items', 'bi-trophy',    'Top Items'],
                ].map(([tab, icon, label]) => (
                  <li key={tab} className="nav-item flex-shrink-0">
                    <button
                      className={`nav-link border-0 px-2 px-md-3 small ${reportTab === tab ? 'active' : ''}`}
                      onClick={() => setReportTab(tab)}
                    >
                      <i className={`bi ${icon} me-1`}></i>{label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Period Controls — stacked on mobile */}
            {reportTab === 'sales' && (
              <div className="d-flex gap-2 flex-wrap align-items-center w-100 w-md-auto">
                <div className="btn-group btn-group-sm">
                  {[['daily','Day'],['weekly','Wk'],['monthly','Mo'],['yearly','Yr']].map(([val, label]) => (
                    <button
                      key={val}
                      className={`btn ${period === val ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setPeriod(val)}
                      style={{ fontSize: '0.75rem' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto', minWidth: 80 }}
                  value={selectedYear}
                  onChange={e => setSelectedYear(+e.target.value)}
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                {period === 'daily' && (
                  <select
                    className="form-select form-select-sm"
                    style={{ width: 'auto', minWidth: 100 }}
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(+e.target.value)}
                  >
                    {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-3 p-md-4">

          {/* ════ SALES REPORT ════ */}
          {reportTab === 'sales' && (
            <div>
              {aggregated.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-bar-chart display-4 d-block mb-3 opacity-25"></i>
                  <h6>No sales data for selected period</h6>
                </div>
              ) : (
                <>
                  {/* Bar Chart — horizontally scrollable on mobile */}
                  <div className="mb-4">
                    <h6 className="fw-semibold mb-3 text-muted small text-uppercase">Revenue Chart</h6>
                    <div className="overflow-auto pb-2">
                      <div className="d-flex align-items-end gap-2" style={{ minHeight: 140, minWidth: Math.max(aggregated.length * 52, 300) }}>
                        {aggregated.map((r, i) => (
                          <div key={i} className="d-flex flex-column align-items-center flex-shrink-0" style={{ minWidth: 46 }}>
                            <small className="text-muted mb-1" style={{ fontSize: 9 }}>{fmtC(r.revenue)}</small>
                            <div
                              className="rounded-top bg-primary"
                              style={{ width: 36, height: Math.max(4, (r.revenue / maxRevenue) * 110), transition: 'height 0.4s ease', opacity: 0.85 }}
                              title={`${r.label}: ${fmtC(r.revenue)}`}
                            />
                            <small className="text-muted mt-1" style={{ fontSize: 9, textAlign: 'center', maxWidth: 46, wordBreak: 'break-word' }}>{r.key}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sales Table — scrollable on mobile */}
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ minWidth: 550 }}>
                      <thead className="table-dark">
                        <tr>
                          <th>Period</th>
                          <th className="text-end">Bills</th>
                          <th className="text-end">Revenue</th>
                          <th className="text-end d-none d-md-table-cell">Taxable</th>
                          <th className="text-end">GST</th>
                          <th className="text-end d-none d-md-table-cell">Discount</th>
                          <th className="text-end">Net Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregated.map((r, i) => (
                          <tr key={i}>
                            <td className="fw-semibold small">{r.label}</td>
                            <td className="text-end"><span className="badge bg-primary">{r.bills}</span></td>
                            <td className="text-end small">{fmtC(r.revenue)}</td>
                            <td className="text-end small d-none d-md-table-cell">{fmtC(r.taxable)}</td>
                            <td className="text-end small text-warning">{fmtC(r.gst)}</td>
                            <td className="text-end small text-danger d-none d-md-table-cell">{fmtC(r.discount)}</td>
                            <td className="text-end fw-bold text-success small">{fmtC(r.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="table-secondary fw-bold">
                        <tr>
                          <td className="small">Total ({aggregated.length})</td>
                          <td className="text-end small">{aggregated.reduce((s, r) => s + r.bills, 0)}</td>
                          <td className="text-end small">{fmtC(aggregated.reduce((s, r) => s + r.revenue, 0))}</td>
                          <td className="text-end small d-none d-md-table-cell">{fmtC(aggregated.reduce((s, r) => s + r.taxable, 0))}</td>
                          <td className="text-end small text-warning">{fmtC(aggregated.reduce((s, r) => s + r.gst, 0))}</td>
                          <td className="text-end small text-danger d-none d-md-table-cell">{fmtC(aggregated.reduce((s, r) => s + r.discount, 0))}</td>
                          <td className="text-end small text-success">{fmtC(aggregated.reduce((s, r) => s + r.revenue, 0))}</td>
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
                  <i className="bi bi-boxes display-4 d-block mb-3 opacity-25"></i>
                  <h6>No items in inventory</h6>
                </div>
              ) : (
                <>
                  {/* Stock mini-chart */}
                  <div className="mb-4">
                    <h6 className="fw-semibold mb-3 text-muted small text-uppercase">Stock Level Overview</h6>
                    <div className="overflow-auto pb-2">
                      <div className="d-flex align-items-end gap-2" style={{ minHeight: 110, minWidth: Math.max(itemMaster.slice(0,20).length * 50, 300) }}>
                        {itemMaster.slice(0, 20).map((item, i) => {
                          const s    = getStock(item);
                          const maxS = Math.max(...itemMaster.map(x => getStock(x)), 1);
                          const color = s === 0 ? 'danger' : s < 10 ? 'warning' : 'success';
                          return (
                            <div key={getId(item)} className="d-flex flex-column align-items-center flex-shrink-0" style={{ minWidth: 44 }}>
                              <small className="text-muted mb-1" style={{ fontSize: 9 }}>{s}</small>
                              <div className={`rounded-top bg-${color}`} style={{ width: 34, height: Math.max(4, (s / maxS) * 80), transition: 'height 0.4s' }} title={`${getName(item)}: ${s}`} />
                              <small className="text-muted mt-1" style={{ fontSize: 9, textAlign: 'center', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getName(item)}</small>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ minWidth: 480 }}>
                      <thead className="table-dark">
                        <tr>
                          <th>#</th>
                          <th>Item Name</th>
                          <th className="text-end d-none d-md-table-cell">Rate</th>
                          <th className="text-end d-none d-md-table-cell">Tax%</th>
                          <th className="text-end">Stock</th>
                          <th className="text-end">Value</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemMaster.map((item, i) => {
                          const s      = getStock(item);
                          const status = s === 0 ? 'danger' : s < 10 ? 'warning' : 'success';
                          const label  = s === 0 ? 'Out of Stock' : s < 10 ? 'Low' : 'OK';
                          return (
                            <tr key={getId(item)} className={status === 'danger' ? 'table-danger bg-opacity-10' : status === 'warning' ? 'table-warning bg-opacity-10' : ''}>
                              <td className="text-muted small">{i + 1}</td>
                              <td className="fw-semibold small">{getName(item)}</td>
                              <td className="text-end small d-none d-md-table-cell">Rs.{getRate(item).toFixed(2)}</td>
                              <td className="text-end d-none d-md-table-cell"><span className="badge bg-secondary">{getTax(item)}%</span></td>
                              <td className="text-end fw-bold small">{s.toLocaleString()}</td>
                              <td className="text-end small">Rs.{(s * getRate(item)).toLocaleString('en-IN')}</td>
                              <td><span className={`badge bg-${status}`} style={{ fontSize: '0.65rem' }}>{label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="table-secondary fw-bold">
                        <tr>
                          <td colSpan="4" className="small">Total ({itemMaster.length} items)</td>
                          <td className="text-end small">{stats.totalStock.toLocaleString()} units</td>
                          <td className="text-end text-success small">{fmtC(stats.inventoryValue)}</td>
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
                  <i className="bi bi-trophy display-4 d-block mb-3 opacity-25"></i>
                  <h6>No item sales data yet</h6>
                </div>
              ) : (
                <>
                  {/* Progress bars */}
                  <div className="mb-4">
                    <h6 className="fw-semibold mb-3 text-muted small text-uppercase">Top Items by Revenue</h6>
                    {stats.topItems.map((item, i) => {
                      const maxR = stats.topItems[0]?.revenue || 1;
                      const pct  = (item.revenue / maxR) * 100;
                      return (
                        <div key={i} className="mb-2">
                          <div className="d-flex justify-content-between mb-1 flex-wrap gap-1">
                            <span className="small fw-semibold">
                              <span className="badge bg-secondary me-1" style={{ fontSize: '0.65rem' }}>#{i + 1}</span>
                              {item.name}
                            </span>
                            <span className="small text-muted">{fmtC(item.revenue)} · {item.qty} units</span>
                          </div>
                          <div className="progress" style={{ height: 7 }}>
                            <div className="progress-bar bg-primary" style={{ width: `${pct}%`, transition: 'width 0.5s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ minWidth: 400 }}>
                      <thead className="table-dark">
                        <tr>
                          <th>#</th>
                          <th>Item Name</th>
                          <th className="text-end">Qty Sold</th>
                          <th className="text-end">Revenue</th>
                          <th className="text-end d-none d-md-table-cell">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.topItems.map((item, i) => (
                          <tr key={i}>
                            <td>
                              <span className={`badge ${i === 0 ? 'bg-warning text-dark' : i === 1 ? 'bg-secondary' : 'bg-light text-dark border'}`} style={{ fontSize: '0.65rem' }}>
                                #{i + 1}
                              </span>
                            </td>
                            <td className="fw-semibold small">{item.name}</td>
                            <td className="text-end small">{item.qty.toLocaleString()}</td>
                            <td className="text-end fw-bold text-success small">{fmtC(item.revenue)}</td>
                            <td className="text-end small d-none d-md-table-cell">
                              {stats.totalRevenue ? ((item.revenue / stats.totalRevenue) * 100).toFixed(1) : 0}%
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

      {/* ── Recent Bills ── */}
      {bills.length > 0 && (
        <div className="glass-card shadow-xl p-3 p-md-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-clock-history text-info me-2"></i>Recent Invoices
          </h6>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0" style={{ minWidth: 400 }}>
              <thead className="table-dark">
                <tr>
                  <th>Bill No</th>
                  <th className="d-none d-md-table-cell">Date</th>
                  <th>Customer</th>
                  <th className="text-end">Total</th>
                  <th className="d-none d-md-table-cell">GST</th>
                </tr>
              </thead>
              <tbody>
                {bills.slice(0, 8).map(bill => (
                  <tr key={bill.id}>
                    <td><span className="badge bg-primary" style={{ fontSize: '0.7rem' }}>{bill.billNo}</span></td>
                    <td className="d-none d-md-table-cell"><small>{new Date(bill.billDate).toLocaleDateString('en-IN')}</small></td>
                    <td className="small">{bill.customer?.name || '—'}</td>
                    <td className="text-end fw-bold text-success small">{fmtC(bill.totals?.total || 0)}</td>
                    <td className="d-none d-md-table-cell">
                      <span className={`badge ${bill.gstMode === 'none' ? 'bg-secondary' : 'bg-success'}`} style={{ fontSize: '0.65rem' }}>
                        {bill.gstMode}
                      </span>
                    </td>
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