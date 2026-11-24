import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import jsPDF from 'jspdf';
import {
  buildWarehouseSummaryGroups,
  getCaliforniaRangeIso,
  renderWarehouseOrderSummaryPdf,
} from '../lib/reportUtils';

const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'usr-warehouse-1' } },
        error: null,
      }),
    },
    from: (...args) => mockFrom(...args),
  },
}));

import Reports from '../pages/Reports';

function buildDateRecordingChain(dataRows, calls) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    neq: () => chain,
    or: () => chain,
    gte: (col, val) => {
      calls.push({ op: 'gte', col, val });
      return chain;
    },
    lte: (col, val) => {
      calls.push({ op: 'lte', col, val });
      return chain;
    },
    order: () => chain,
    range: () => Promise.resolve({ data: dataRows, error: null }),
    single: () =>
      Promise.resolve({
        data: { full_name: 'Cyrus Warehouse', role: 'warehouse' },
        error: null,
      }),
    then: (onFulfilled, onRejected) =>
      Promise.resolve({ data: dataRows, error: null }).then(onFulfilled, onRejected),
  };
  return chain;
}

describe('Reports Single-Day Range, Patient Addresses & Keep-Together PDF Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes exact California single-day UTC ISO bounds for PST, PDT, and reversed dates', () => {
    // 2026-11-06 is in PST (UTC-08:00)
    expect(getCaliforniaRangeIso('2026-11-06', '2026-11-06')).toEqual({
      startIso: '2026-11-06T08:00:00.000Z',
      endIso: '2026-11-07T07:59:59.999Z',
    });

    // 2026-07-15 is in PDT (UTC-07:00)
    expect(getCaliforniaRangeIso('2026-07-15', '2026-07-15')).toEqual({
      startIso: '2026-07-15T07:00:00.000Z',
      endIso: '2026-07-16T06:59:59.999Z',
    });

    // Swapped boundaries normalize cleanly
    expect(getCaliforniaRangeIso('2026-11-08', '2026-11-06')).toEqual({
      startIso: '2026-11-06T08:00:00.000Z',
      endIso: '2026-11-09T07:59:59.999Z',
    });
  });

  it('preserves individual delivery addresses per patient under B2B client accounts', () => {
    const rawOrders = [
      {
        id: 'ord-pro-1',
        user_id: 'u-b2b',
        company_id: 'comp-pro',
        created_at: '2026-11-06T20:00:00Z',
        companies: {
          name: 'Prohealth Hospice',
          address: '2125 Oak Grove Rd',
          city: 'Walnut Creek',
          state: 'CA',
          zip: '94598',
        },
        shipping_name: 'Agustina Diaz',
        shipping_address: '244 American Canyon Rd Spc 81',
        shipping_city: 'American Canyon',
        shipping_state: 'CA',
        shipping_zip: '94503',
        order_items: [
          {
            quantity_variants: 2,
            status: 'READY_TO_PACK',
            product_variants: { name: 'Tube', sku: '1191-TB', products: { name: 'Zinc Oxide Ointment 2oz' } },
          },
        ],
      },
      {
        id: 'ord-pro-2',
        user_id: 'u-b2b',
        company_id: 'comp-pro',
        created_at: '2026-11-06T20:05:00Z',
        companies: {
          name: 'Prohealth Hospice',
          address: '2125 Oak Grove Rd',
          city: 'Walnut Creek',
          state: 'CA',
          zip: '94598',
        },
        shipping_name: 'Carla Gamez',
        shipping_address: '200 Fairgate Dr',
        shipping_city: 'Vacaville',
        shipping_state: 'CA',
        shipping_zip: '95687',
        order_items: [
          {
            quantity_variants: 2,
            status: 'READY_TO_PACK',
            product_variants: { name: 'Pack', sku: 'AUB01020-PK', products: { name: 'Presto Plus Classic Underwear' } },
          },
        ],
      },
    ];

    const grouped = buildWarehouseSummaryGroups(rawOrders);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].name).toBe('Prohealth Hospice');
    expect(grouped[0].address).toBe('2125 Oak Grove Rd Walnut Creek CA 94598');
    expect(grouped[0].patients).toEqual([
      expect.objectContaining({
        patientName: 'AGUSTINA DIAZ',
        shippingAddress: '244 American Canyon Rd Spc 81 American Canyon CA 94503',
      }),
      expect.objectContaining({
        patientName: 'CARLA GAMEZ',
        shippingAddress: '200 Fairgate Dr Vacaville CA 95687',
      }),
    ]);

    // Search also matches patient delivery city / address
    expect(buildWarehouseSummaryGroups(rawOrders, 'Vacaville')).toHaveLength(1);
    expect(buildWarehouseSummaryGroups(rawOrders, 'Nonexistent')).toHaveLength(0);
  });

  it('keeps client headers, patient addresses, and full product lines unbroken across PDF pages', () => {
    const makeItems = (prefix, count, longTitle = false) =>
      Array.from({ length: count }, (_, idx) => ({
        required: 2,
        shipped: 2,
        backorder: 0,
        variant: 'Case',
        name: longTitle
          ? `Presto Supreme Full Fit Briefs - Bariatric Extended Absorbency Protection Line #${idx + 1}`
          : `${prefix} Medical Supply Item #${idx + 1}`,
        sku: `${prefix}-${100 + idx}`,
      }));

    const warehouseData = [
      {
        name: 'Country Place Assisted Living',
        address: '1715 Olive Ln Antioch CA 94509',
        patients: [
          {
            patientName: 'COUNTRY PLACE ASSISTED LIVING',
            shippingAddress: '1715 Olive Ln Antioch CA 94509',
            items: makeItems('CP', 12),
          },
        ],
      },
      {
        name: 'Delta Shores Assisted Living',
        address: '825 E 18th St Antioch CA 94509',
        patients: [
          {
            patientName: 'DELTA SHORES ASSISTED LIVING',
            shippingAddress: '825 E 18th St Antioch CA 94509',
            items: makeItems('DS', 8),
          },
        ],
      },
      {
        name: 'Prohealth Hospice',
        address: '2125 Oak Grove Rd Walnut Creek CA 94598',
        patients: [
          {
            patientName: 'AGUSTINA DIAZ',
            shippingAddress: '244 American Canyon Rd Spc 81 American Canyon CA 94503',
            items: makeItems('AD', 5),
          },
          {
            patientName: 'CARLA GAMEZ',
            shippingAddress: '200 Fairgate Dr Vacaville CA 95687',
            items: makeItems('CG', 5),
          },
          {
            patientName: 'CLAUDE WADE',
            shippingAddress: '373 Heron Way Vacaville CA 95688',
            items: makeItems('CW', 5),
          },
          {
            patientName: 'EIKO POY',
            shippingAddress: '2600 Estates Dr Fairfield CA 94533',
            items: makeItems('EP', 5),
          },
          {
            patientName: 'GARYL GREEN',
            shippingAddress: '1500 Main St Dixon CA 95620',
            items: makeItems('GG', 4, true),
          },
        ],
      },
    ];

    const doc = new jsPDF('portrait');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let tableStartY = 44;

    const drawHeader = () => {
      doc.setFontSize(16);
      doc.text('ORDER SUMMARY', pageWidth - 14, 18, { align: 'right' });
      doc.setFontSize(10);
      doc.text('Period: 11/06/2026 - 11/06/2026', pageWidth - 14, 25, { align: 'right' });
      tableStartY = 44;
    };
    const drawFooter = () => {
      doc.setFontSize(9);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    };

    drawHeader();
    drawFooter();

    renderWarehouseOrderSummaryPdf({
      doc,
      JsPdfCtor: jsPDF,
      warehouseData,
      drawHeader,
      drawFooter,
      getTableStartY: () => tableStartY,
    });

    const pagesCount = doc.internal.getNumberOfPages();
    expect(pagesCount).toBeGreaterThanOrEqual(2);

    const pageTexts = Array.from({ length: pagesCount }, (_, idx) =>
      (doc.internal.pages[idx + 1] || []).join('\n')
    );

    // Prohealth Hospice header must stay paired with Agustina Diaz + her shipping address + items on the SAME page
    const proStartIdx = pageTexts.findIndex((txt) => txt.includes('PROHEALTH HOSPICE'));
    expect(proStartIdx).toBeGreaterThanOrEqual(0);
    expect(pageTexts[proStartIdx]).toContain('AGUSTINA DIAZ');
    expect(pageTexts[proStartIdx]).toContain('244 American Canyon Rd');
    expect(pageTexts[proStartIdx]).toContain('AD-100');

    // Every single client / patient order must keep its heading, delivery address, AND all item SKUs on the SAME page
    for (const [patientHeader, patientAddrFragment, skus] of [
      ['DELTA SHORES ASSISTED LIVING', '825 E 18th St', ['DS-100', 'DS-107']],
      ['GARYL GREEN', '1500 Main St', ['GG-100', 'GG-101', 'GG-102', 'GG-103']],
      ['EIKO POY', '2600 Estates Dr', ['EP-100', 'EP-104']],
    ]) {
      const pPage = pageTexts.findIndex((txt) => txt.includes(patientHeader));
      expect(pPage).toBeGreaterThanOrEqual(0);
      expect(pageTexts[pPage]).toContain(patientAddrFragment);
      for (const sku of skus) {
        expect(pageTexts[pPage]).toContain(sku);
      }
      // Bariatric word wrapped within GG rows must not spill to a later page
      if (patientHeader === 'GARYL GREEN') {
        expect(pageTexts[pPage]).toContain('Bariatric');
      }
    }
  });

  it('allows setting a single calendar day in Reports UI and renders B2B patient delivery addresses', async () => {
    const queryBoundsCalls = [];
    const sampleOrders = [
      {
        id: '97c337e1-0fa3-4e30-a4ce-4ecf1470f43d',
        user_id: 'u-b2b',
        status: 'ready_for_delivery',
        company_id: 'comp-pro',
        created_at: '2026-11-06T21:00:00Z',
        shipping_name: 'Agustina Diaz',
        shipping_address: '244 American Canyon Rd Spc 81',
        shipping_city: 'American Canyon',
        shipping_state: 'CA',
        shipping_zip: '94503',
        companies: {
          name: 'Prohealth Hospice',
          address: '2125 Oak Grove Rd',
          city: 'Walnut Creek',
          state: 'CA',
          zip: '94598',
        },
        order_items: [
          {
            quantity_variants: 2,
            status: 'READY_TO_PACK',
            product_variants: {
              name: 'Tube',
              sku: '1191-TB',
              products: { name: 'Zinc Oxide Ointment 2oz' },
            },
          },
        ],
      },
    ];

    mockFrom.mockImplementation((table) => {
      if (table === 'user_profiles') {
        return buildDateRecordingChain([], []);
      }
      return buildDateRecordingChain(sampleOrders, queryBoundsCalls);
    });

    const { container } = render(<Reports />);
    await screen.findByRole('heading', { name: 'Warehouse Order Summary' });
    await screen.findByText('244 American Canyon Rd Spc 81 American Canyon CA 94503');

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    const [startInput, endInput] = dateInputs;

    queryBoundsCalls.length = 0;
    fireEvent.change(startInput, { target: { value: '2026-11-06' } });
    fireEvent.change(endInput, { target: { value: '2026-11-06' } });

    await waitFor(() => {
      expect(startInput.value).toBe('2026-11-06');
      expect(endInput.value).toBe('2026-11-06');
      expect(
        queryBoundsCalls.some((c) => c.op === 'gte' && c.val === '2026-11-06T08:00:00.000Z')
      ).toBe(true);
      expect(
        queryBoundsCalls.some((c) => c.op === 'lte' && c.val === '2026-11-07T07:59:59.999Z')
      ).toBe(true);
    });
  });
});
