import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const PACKING_SLIP_MARGIN = { top: 40, bottom: 40 };

/**
 * Compute normalized table rows and options for the Warehouse Packing Slip.
 * Separated as a pure helper so PDF pagination options (rowPageBreak: 'avoid')
 * can be verified deterministically in automated tests.
 */
export function buildPackingSlipTableConfig({ maxAddressY, tableRows, drawHeader }) {
  return {
    startY: maxAddressY + 10,
    head: [['Required', 'Shipped', 'Back Order', 'SKU', 'Description']],
    body: tableRows,
    theme: 'striped',
    // Prevent item rows from splitting across page boundaries. Note: if a single
    // extraordinary row exceeds an entire printable page height, jspdf-autotable
    // falls back to splitting it across pages rather than clipping text.
    rowPageBreak: 'avoid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    styles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: [15, 23, 42],
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 32, halign: 'center', valign: 'middle' },
      1: { cellWidth: 32, halign: 'center', valign: 'middle' },
      2: { cellWidth: 32, halign: 'center', valign: 'middle' },
      3: { cellWidth: 35, halign: 'center', valign: 'middle' },
      4: { cellWidth: 'auto', valign: 'middle' },
    },
    margin: PACKING_SLIP_MARGIN,
    didDrawPage: (data) => {
      if (data.pageNumber > 1 && typeof drawHeader === 'function') {
        drawHeader();
      }
    },
  };
}

/**
 * Draw the standard footer across all generated pages of the packing slip.
 */
export function drawPackingSlipFooters(doc) {
  const pageHeight = doc.internal.pageSize.height;
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Thank you for shopping with us!', 105, pageHeight - 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('TRICORE MEDICAL SUPPLY', 105, pageHeight - 24, { align: 'center' });
    doc.text('2169 Harbor St, Pittsburg CA 94565, United States', 105, pageHeight - 19, { align: 'center' });
    doc.text('info@tricoremedicalsupply.com', 105, pageHeight - 14, { align: 'center' });
    doc.text('www.tricoremedicalsupply.com', 105, pageHeight - 9, { align: 'center' });
  }
}

/**
 * Render customer-visible order notes after the item table, wrapping cleanly to
 * page width and paginating safely before drawing signature blocks.
 */
export function drawPackingSlipOrderNotes(doc, rawNotes, startY, drawHeader) {
  const noteText = typeof rawNotes === 'string' ? rawNotes.trim() : '';
  if (!noteText) return startY;

  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const maxWidth = pageWidth - 28; // 14mm left + 14mm right margins
  const bottomLimit = pageHeight - PACKING_SLIP_MARGIN.bottom - 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const wrappedLines = doc.splitTextToSize(noteText, maxWidth);

  let cursorY = startY + 10;
  // Ensure heading + at least first line fit above footer
  if (cursorY + 14 > bottomLimit) {
    doc.addPage();
    if (typeof drawHeader === 'function') drawHeader();
    cursorY = 44;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('ORDER NOTES:', 14, cursorY);
  cursorY += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);

  const lineHeight = 4.8;
  for (const line of wrappedLines) {
    if (cursorY + lineHeight > bottomLimit) {
      doc.addPage();
      if (typeof drawHeader === 'function') drawHeader();
      cursorY = 44;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
    }
    doc.text(line, 14, cursorY);
    cursorY += lineHeight;
  }

  doc.setTextColor(15, 23, 42);
  return cursorY;
}

/**
 * Generate and download the Warehouse Packing / Backorder Slip PDF.
 */
export async function generatePackingSlipPdf(order, { logoData = null, download = true } = {}) {
  const doc = new jsPDF();
  const orderNum = order.id.substring(0, 8).toUpperCase();
  const datePacked = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const isBackorderRun =
    order.status === 'delivered_partial' ||
    order.status === 'delivered' ||
    order.status === 'shipped';

  const isB2B = !!order.company_id;

  // BILL TO: Agency or Retail Customer (customer email/phone intentionally omitted on packing slip)
  const billName = isB2B
    ? order.companies?.name || 'Agency'
    : order.user_profiles?.full_name || order.shipping_name || 'Retail Customer';
  const billAddress = isB2B
    ? order.companies?.address || 'No billing address provided'
    : order.shipping_address || 'No billing address provided';
  const billCityState = isB2B
    ? `${order.companies?.city || ''}, ${order.companies?.state || ''} ${order.companies?.zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '')
    : `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');

  // SHIP TO: Patient or Retail Customer
  const shipName = order.shipping_name || (isB2B ? 'Patient' : billName);
  const shipAddress = order.shipping_address || 'No shipping address provided';
  const shipCityState = `${order.shipping_city || ''}, ${order.shipping_state || ''} ${order.shipping_zip || ''}`.replace(/^[,\s]+|[,\s]+$/g, '');

  const drawHeader = () => {
    if (logoData) {
      const imgWidth = 45;
      const imgHeight = (logoData.height * imgWidth) / logoData.width;
      doc.addImage(logoData.dataURL, 'PNG', 14, 12, imgWidth, imgHeight);
    } else {
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('TRICORE MEDICAL SUPPLY', 14, 20);
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(isBackorderRun ? 'BACKORDER SLIP' : 'PACKING SLIP', 140, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Order #: ${orderNum}${isBackorderRun ? '-B' : ''}`, 140, 24);
    doc.text(`Date: ${datePacked}`, 140, 29);
  };

  drawHeader();

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('SHIP TO', 14, 45);
  doc.text('BILL TO', 110, 45);

  let currentYShip = 52;
  doc.setFont('helvetica', 'bold');
  doc.text(shipName, 14, currentYShip);
  currentYShip += 5;
  doc.setFont('helvetica', 'normal');
  if (shipAddress && shipAddress !== 'No shipping address provided') {
    doc.text(shipAddress, 14, currentYShip);
    currentYShip += 5;
  }
  if (shipCityState) {
    doc.text(shipCityState, 14, currentYShip);
    currentYShip += 5;
  }

  let currentYBill = 52;
  doc.setFont('helvetica', 'bold');
  doc.text(billName, 110, currentYBill);
  currentYBill += 5;
  doc.setFont('helvetica', 'normal');
  if (billAddress && billAddress !== 'No billing address provided') {
    doc.text(billAddress, 110, currentYBill);
    currentYBill += 5;
  }
  if (billCityState) {
    doc.text(billCityState, 110, currentYBill);
    currentYBill += 5;
  }

  const maxAddressY = Math.max(currentYBill, currentYShip);

  const activeItems =
    order.order_items?.filter((item) => {
      const s = item.status?.toLowerCase();
      if (s === 'cancelled' || s === 'rejected') return false;
      if (isBackorderRun && s === 'delivered') return false;
      return true;
    }) || [];

  const tableRows = activeItems.map((item) => {
    const s = item.status?.toLowerCase();
    const isBackordered = s === 'backordered';
    const required = item.quantity_variants || 0;
    const shipped = isBackordered ? 0 : required;
    const backOrder = isBackordered ? required : 0;

    const sku = item.product_variants?.sku || 'N/A';
    const productName = item.product_variants?.products?.name || 'Item';
    const variantName = item.product_variants?.name || '';
    const description =
      variantName && variantName !== 'N/A' ? `${productName} (${variantName})` : productName;

    return [required, shipped, backOrder, sku, description];
  });

  autoTable(doc, buildPackingSlipTableConfig({ maxAddressY, tableRows, drawHeader }));

  const pageHeight = doc.internal.pageSize.height;
  let finalY = doc.lastAutoTable?.finalY || maxAddressY + 20;

  // Render wrapped Order Notes only when non-empty (Fix 5)
  finalY = drawPackingSlipOrderNotes(doc, order.order_notes, finalY, drawHeader);

  if (finalY + 70 > pageHeight) {
    doc.addPage();
    drawHeader();
    finalY = 40;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Signed by:', 14, finalY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text('___________________________________', 14, finalY + 30);

  doc.setFont('helvetica', 'bold');
  doc.text('Delivered by:', 110, finalY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text('___________________________________', 110, finalY + 30);

  drawPackingSlipFooters(doc);
  const filename = `Packing_Slip_${orderNum}${isBackorderRun ? '_B' : ''}.pdf`;
  if (download) {
    doc.save(filename);
  }
  return {
    filename,
    pageCount: doc.internal.getNumberOfPages(),
    doc,
  };
}
