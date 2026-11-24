import autoTable from 'jspdf-autotable';
import { isOrderB2B, resolveRetailCustomerName } from './orderCustomerUtils';

export const SUMMARY_TABLE_COLUMNS = [
  'REQUIRED',
  'SHIPPED',
  'BACKORDER',
  'VARIANT',
  'PRODUCT',
  'SKU',
];

export const SUMMARY_COLUMN_STYLES = {
  0: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
  1: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
  2: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
  3: { cellWidth: 30, halign: 'center', textColor: [100, 100, 100] },
  4: { cellWidth: 'auto' },
  5: { cellWidth: 25 },
};

const SUMMARY_COMMON_HEAD_STYLES = {
  fillColor: [241, 245, 249],
  textColor: [15, 23, 42],
  fontStyle: 'bold',
  halign: 'center',
};

function getTimeZoneOffsetMs(utcDate, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const read = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const hour = read('hour') === 24 ? 0 : read('hour');
  const tzAsUtc = Date.UTC(read('year'), read('month') - 1, read('day'), hour, read('minute'), read('second'));
  return tzAsUtc - utcDate.getTime();
}

function californiaWallTimeToUtcIso(yyyyMmDd, hour, minute, second, ms) {
  const match = String(yyyyMmDd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const fallback = new Date(yyyyMmDd);
    if (Number.isNaN(fallback.getTime())) return new Date().toISOString();
    return fallback.toISOString();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const wholeSecondUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  // Two-pass fixed-point offset calculation ensures exact conversion on PST/PDT transition dates.
  const offset1 = getTimeZoneOffsetMs(new Date(wholeSecondUtcMs));
  const pass1 = new Date(wholeSecondUtcMs - offset1);
  const offset2 = getTimeZoneOffsetMs(pass1);
  return new Date(wholeSecondUtcMs - offset2 + ms).toISOString();
}

/**
 * Convert start/end YYYY-MM-DD calendar dates in America/Los_Angeles into inclusive
 * UTC ISO bounds [start 00:00:00.000 CA .. end 23:59:59.999 CA], supporting single-day
 * selections (startDate === endDate) regardless of browser timezone.
 */
export function getCaliforniaRangeIso(startDateStr, endDateStr) {
  const effectiveStart = startDateStr || endDateStr;
  const effectiveEnd = endDateStr || startDateStr;
  const [orderedStart, orderedEnd] =
    effectiveStart && effectiveEnd && effectiveStart > effectiveEnd
      ? [effectiveEnd, effectiveStart]
      : [effectiveStart, effectiveEnd];

  return {
    startIso: californiaWallTimeToUtcIso(orderedStart, 0, 0, 0, 0),
    endIso: californiaWallTimeToUtcIso(orderedEnd, 23, 59, 59, 999),
  };
}

export function formatShippingAddressLine({ address, city, state, zip } = {}) {
  return `${address || ''} ${city || ''} ${state || ''} ${zip || ''}`
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldShowPatientSubheader(custName, custAddress, patient) {
  if (!patient?.patientName && !patient?.shippingAddress) return false;
  const normalizedPatientName = (patient.patientName || '').trim().toUpperCase();
  const normalizedCustName = (custName || '').trim().toUpperCase();
  const normalizedShipAddr = (patient.shippingAddress || '').trim();
  const normalizedCustAddr = (custAddress || '').trim();

  // Avoid repeating identical headquarters info when a B2B order ships directly to the agency.
  if (
    normalizedPatientName === normalizedCustName &&
    (!normalizedShipAddr || normalizedShipAddr === normalizedCustAddr)
  ) {
    return false;
  }

  return true;
}

/**
 * Group fulfillment orders by client/agency and individual delivery patient + address.
 */
export function buildWarehouseSummaryGroups(rawOrders, searchTerm = '') {
  const customerMap = {};

  (rawOrders || []).forEach((order) => {
    const isB2B = isOrderB2B(order);
    const custName = isB2B
      ? order.companies?.name || 'Agency'
      : resolveRetailCustomerName(order);

    const agencyAddress =
      formatShippingAddressLine({
        address: isB2B ? order.companies?.address : order.shipping_address,
        city: isB2B ? order.companies?.city : order.shipping_city,
        state: isB2B ? order.companies?.state : order.shipping_state,
        zip: isB2B ? order.companies?.zip : order.shipping_zip,
      }) || 'No Address Provided';

    const patientAddress =
      formatShippingAddressLine({
        address: order.shipping_address,
        city: order.shipping_city,
        state: order.shipping_state,
        zip: order.shipping_zip,
      }) || '';

    const patientName = order.shipping_name
      ? String(order.shipping_name).trim().toUpperCase()
      : '';

    const custKey = `${custName}_${agencyAddress}`;
    if (!customerMap[custKey]) {
      customerMap[custKey] = {
        name: custName,
        address: agencyAddress,
        items: {},
        latestOrder: order.created_at,
      };
    } else if (new Date(order.created_at) > new Date(customerMap[custKey].latestOrder)) {
      customerMap[custKey].latestOrder = order.created_at;
    }

    const patientGroupKey = `${patientName}__${patientAddress}`;

    order.order_items?.forEach((item) => {
      if (item.status === 'cancelled' || item.status === 'rejected') return;

      const qty = Number(item.quantity_variants || 0);
      const isBackordered = item.status?.toLowerCase() === 'backordered';
      const shippedQty = isBackordered ? 0 : qty;
      const backorderQty = isBackordered ? qty : 0;

      const pName = item.product_variants?.products?.name || 'Unknown Item';
      const vName = item.product_variants?.name || '';
      const sku = item.product_variants?.sku || item.product_variants?.products?.base_sku || '';

      const itemKey = `${sku}_${pName}_${patientGroupKey}`;
      if (!customerMap[custKey].items[itemKey]) {
        customerMap[custKey].items[itemKey] = {
          name: pName,
          variant: vName,
          sku,
          required: 0,
          shipped: 0,
          backorder: 0,
          patientName,
          shippingAddress: patientAddress,
          patientGroupKey,
        };
      }
      customerMap[custKey].items[itemKey].required += qty;
      customerMap[custKey].items[itemKey].shipped += shippedQty;
      customerMap[custKey].items[itemKey].backorder += backorderQty;
    });
  });

  let finalData = Object.values(customerMap)
    .map((cust) => ({
      ...cust,
      items: Object.values(cust.items).sort((a, b) => {
        if (a.patientName === '' && b.patientName !== '') return -1;
        if (b.patientName === '' && a.patientName !== '') return 1;
        return (
          a.patientName.localeCompare(b.patientName) ||
          (a.shippingAddress || '').localeCompare(b.shippingAddress || '') ||
          a.name.localeCompare(b.name)
        );
      }),
    }))
    .sort((a, b) => new Date(b.latestOrder) - new Date(a.latestOrder));

  const structuredData = finalData.map((cust) => {
    const patientsMap = {};
    cust.items.forEach((item) => {
      const pKey = item.patientGroupKey || item.patientName || '';
      if (!patientsMap[pKey]) {
        patientsMap[pKey] = {
          patientName: item.patientName,
          shippingAddress: item.shippingAddress,
          items: [],
        };
      }
      patientsMap[pKey].items.push(item);
    });

    const patientsArray = Object.values(patientsMap).sort((a, b) => {
      if (a.patientName === '' && b.patientName !== '') return -1;
      if (b.patientName === '' && a.patientName !== '') return 1;
      return (
        a.patientName.localeCompare(b.patientName) ||
        (a.shippingAddress || '').localeCompare(b.shippingAddress || '')
      );
    });

    return {
      name: cust.name,
      address: cust.address,
      latestOrder: cust.latestOrder,
      items: cust.items,
      patients: patientsArray,
    };
  });

  const cleanSearch = (searchTerm || '').trim().toLowerCase();
  if (!cleanSearch) return structuredData;

  return structuredData.filter((cust) => {
    if (
      cust.name.toLowerCase().includes(cleanSearch) ||
      cust.address.toLowerCase().includes(cleanSearch)
    ) {
      return true;
    }
    return cust.patients.some(
      (p) =>
        (p.patientName && p.patientName.toLowerCase().includes(cleanSearch)) ||
        (p.shippingAddress && p.shippingAddress.toLowerCase().includes(cleanSearch))
    );
  });
}

function buildAgencyHeaderRow(cust, continued = false) {
  const title = continued ? `${cust.name.toUpperCase()} (CONTINUED)` : cust.name.toUpperCase();
  return [
    {
      content: `${title}\n${cust.address}`,
      colSpan: 6,
      styles: {
        fontStyle: 'bold',
        fontSize: 10,
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
      },
    },
  ];
}

function buildPatientRows(cust, patient) {
  const activeItems = (patient?.items || []).filter(Boolean);
  if (activeItems.length === 0) return [];

  const rows = [];
  if (shouldShowPatientSubheader(cust.name, cust.address, patient)) {
    const label = patient.patientName ? `  ${patient.patientName.toUpperCase()}` : '  DELIVERY LOCATION';
    const subAddress =
      patient.shippingAddress && patient.shippingAddress !== cust.address
        ? `\n  ${patient.shippingAddress}`
        : '';
    rows.push([
      {
        content: `${label}${subAddress}`,
        colSpan: 6,
        styles: {
          fontStyle: 'bold',
          fontSize: 9,
          textColor: [15, 23, 42],
        },
      },
    ]);
  }

  activeItems.forEach((item) => {
    const variantText = item.variant && item.variant !== 'Default' ? item.variant : '';
    rows.push([
      String(item.required ?? 0),
      String(item.shipped ?? 0),
      String(item.backorder ?? 0),
      variantText,
      item.name,
      item.sku || '',
    ]);
  });

  return rows;
}

function measureTableBlockHeight(JsPdfCtor, rows) {
  if (!rows || rows.length === 0) return 0;
  const scratch = new JsPdfCtor('portrait');
  scratch.internal.pageSize.height = 10000;
  autoTable(scratch, {
    startY: 20,
    body: rows,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [15, 23, 42] },
    rowPageBreak: 'avoid',
    columnStyles: SUMMARY_COLUMN_STYLES,
    margin: { left: 14, right: 14, top: 20, bottom: 20 },
  });
  return (scratch.lastAutoTable?.finalY ?? 20) - 20;
}

/**
 * Render the Warehouse Order Summary PDF with client- and patient-level keep-together
 * pagination and rowPageBreak: 'avoid' so neither headers, patient orders, nor product
 * descriptions split across pages unnecessarily.
 */
export function renderWarehouseOrderSummaryPdf({
  doc,
  JsPdfCtor,
  warehouseData,
  drawHeader,
  drawFooter,
  getTableStartY,
}) {
  const bottomMargin = 20;
  const sectionGap = 5;
  const pageHeight = doc.internal.pageSize.height;

  const drawColumnHeaderBar = (startY) => {
    autoTable(doc, {
      startY,
      head: [SUMMARY_TABLE_COLUMNS],
      body: [],
      theme: 'plain',
      headStyles: SUMMARY_COMMON_HEAD_STYLES,
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [15, 23, 42] },
      columnStyles: SUMMARY_COLUMN_STYLES,
      margin: { left: 14, right: 14, top: startY, bottom: bottomMargin },
    });
    return doc.lastAutoTable?.finalY ?? startY + 8;
  };

  let headerTopY = getTableStartY();
  let contentStartY = drawColumnHeaderBar(headerTopY);
  let cursorY = contentStartY;

  const startNewPage = () => {
    doc.addPage();
    drawHeader();
    drawFooter();
    headerTopY = getTableStartY();
    contentStartY = drawColumnHeaderBar(headerTopY);
    cursorY = contentStartY;
  };

  const renderBlock = (rows) => {
    if (!rows || rows.length === 0) return;
    const blockStartPage = doc.internal.getNumberOfPages();
    autoTable(doc, {
      startY: cursorY,
      body: rows,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [15, 23, 42] },
      rowPageBreak: 'avoid',
      columnStyles: SUMMARY_COLUMN_STYLES,
      margin: { left: 14, right: 14, top: contentStartY, bottom: bottomMargin },
      didDrawPage: (data) => {
        if (data.pageNumber > blockStartPage) {
          drawHeader();
          drawFooter();
          drawColumnHeaderBar(getTableStartY());
        }
      },
    });
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + sectionGap;
  };

  const maxBodyHeight = pageHeight - bottomMargin - contentStartY;

  (warehouseData || []).forEach((cust) => {
    const patientRowSets = (cust.patients || [])
      .map((p) => buildPatientRows(cust, p))
      .filter((rows) => rows.length > 0);

    if (patientRowSets.length === 0) return;

    const fullClientRows = [buildAgencyHeaderRow(cust, false), ...patientRowSets.flat()];
    const fullClientHeight = measureTableBlockHeight(JsPdfCtor, fullClientRows);
    const remainingHeight = pageHeight - bottomMargin - cursorY;

    if (fullClientHeight <= remainingHeight) {
      renderBlock(fullClientRows);
      return;
    }

    if (fullClientHeight <= maxBodyHeight) {
      if (cursorY > contentStartY) {
        startNewPage();
      }
      renderBlock(fullClientRows);
      return;
    }

    // Client exceeds a single page (e.g. a B2B agency with many patient deliveries):
    // keep the agency header paired with its first patient, and keep every patient block intact on one page.
    const firstPatientUnit = [buildAgencyHeaderRow(cust, false), ...patientRowSets[0]];
    const firstUnitHeight = measureTableBlockHeight(JsPdfCtor, firstPatientUnit);
    if (cursorY > contentStartY && firstUnitHeight > pageHeight - bottomMargin - cursorY) {
      startNewPage();
    }
    renderBlock(firstPatientUnit);

    for (let i = 1; i < patientRowSets.length; i += 1) {
      const pRows = patientRowSets[i];
      const pHeight = measureTableBlockHeight(JsPdfCtor, pRows);
      const avail = pageHeight - bottomMargin - cursorY;
      const pHeaderMinHeight = measureTableBlockHeight(JsPdfCtor, pRows.slice(0, 2));

      if (
        cursorY > contentStartY &&
        ((pHeight > avail && pHeight <= maxBodyHeight) || (pHeight > maxBodyHeight && pHeaderMinHeight > avail))
      ) {
        startNewPage();
        // Repeat compact continued agency banner + patient block together on the new page
        const contUnit = [buildAgencyHeaderRow(cust, true), ...pRows];
        const contHeight = measureTableBlockHeight(JsPdfCtor, contUnit);
        if (contHeight <= maxBodyHeight) {
          renderBlock(contUnit);
          continue;
        }
      }

      renderBlock(pRows);
    }
  });
}
