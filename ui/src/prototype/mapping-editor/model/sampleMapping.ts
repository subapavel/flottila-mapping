// PROTOTYPE (#10, throwaway): one synthetic mapping, PurchaseOrder -> Invoice, in ADR-0010 shape.
// Synthetic names only. Ids are drawn from a seeded generator so URLs and screenshots are stable.
import { seededIdFactory } from './ids';
import { SRC_ROOT as S, TGT_ROOT as T } from './structures';
import type { AuthoringId, Box, MappingModel, Params, TargetFieldMapping } from './types';

type B = {
  src: (field: string, context?: string) => AuthoringId;
  fn: (fn: string, inputs?: (AuthoringId | null)[], params?: Params) => AuthoringId;
  c: (value: string) => AuthoringId;
  udf: (udf: string, inputs: (AuthoringId | null)[]) => AuthoringId;
  unresolved: (name: string, inputs: (AuthoringId | null)[], params?: Params) => AuthoringId;
};

export function buildSampleMapping(): MappingModel {
  const nextId = seededIdFactory(20261030);
  const tfm: Record<string, TargetFieldMapping> = {};
  const fm = (target: string, body: (b: B) => AuthoringId) => {
    const boxes: Record<AuthoringId, Box> = {};
    const put = (box: Box) => { const id = nextId(); boxes[id] = box; return id; };
    const b: B = {
      src: (field, context) => put(context ? { kind: 'source', field, context } : { kind: 'source', field }),
      fn: (fn, inputs, params) => put({ kind: 'function', fn, ...(inputs && inputs.length ? { inputs } : {}), ...(params ? { params } : {}) }),
      c: (value) => put({ kind: 'function', fn: 'constant', params: { value } }),
      udf: (udf, inputs) => put({ kind: 'udf', udf, inputs }),
      unresolved: (name, inputs, params) => put({ kind: 'unresolved', name, origin: 'po', inputs, ...(params ? { params } : {}) })
    };
    const id = nextId();
    const result = body(b);
    tfm[target] = { id, result, boxes };
  };

  const H = `${S}/Header`, I = `${S}/Item`, IH = `${T}/InvoiceHeader`, IL = `${T}/InvoiceLine`;

  fm(`${T}/@schemaVersion`, (b) => b.c('1.0'));
  fm(IH, (b) => b.src(H));
  fm(`${IH}/InvoiceNumber`, (b) => b.fn('concat', [b.c('INV-'), b.src(`${H}/OrderNumber`)]));
  fm(`${IH}/InvoiceDate`, (b) => b.fn('formatDate', [b.src(`${H}/OrderDate`)], { inputPattern: 'yyyy-MM-dd', outputPattern: 'yyyyMMdd' }));
  fm(`${IH}/DocumentType`, (b) => b.c('380'));
  fm(`${IH}/CurrencyCode`, (b) => b.fn('FixValues', [b.src(`${H}/Currency`)], { table: { DEM: 'EUR', EUR: 'EUR', USD: 'USD' }, behaviour: 'useKey' }));
  fm(`${IH}/OrderReference`, (b) => b.src(`${H}/OrderNumber`));
  // generating function: concat of two constants
  fm(`${IH}/BuyerReference`, (b) => b.fn('concat', [b.c('BUY'), b.c('0001')], { delimiter: '-' }));
  fm(`${IH}/Buyer`, (b) => b.src(`${H}/BuyerParty`));
  fm(`${IH}/Buyer/@id`, (b) => b.src(`${H}/BuyerParty/@partyId`));
  fm(`${IH}/Buyer/Name`, (b) => b.fn('toUpperCase', [b.src(`${H}/BuyerParty/Name`)]));
  fm(`${IH}/Buyer/Street`, (b) => b.src(`${H}/BuyerParty/Address/Street`));
  fm(`${IH}/Buyer/City`, (b) => b.src(`${H}/BuyerParty/Address/City`));
  fm(`${IH}/Buyer/PostalCode`, (b) => b.fn('mapWithDefault', [b.src(`${H}/BuyerParty/Address/PostalCode`)], { default: '00000' }));
  fm(`${IH}/Buyer/Country`, (b) => b.udf('normaliseCountry', [b.src(`${H}/BuyerParty/Address/CountryCode`)]));
  fm(`${IH}/Seller`, (b) => b.src(`${H}/SellerParty`));
  fm(`${IH}/Seller/Name`, (b) => b.src(`${H}/SellerParty/Name`));
  fm(`${IH}/Seller/VatId`, (b) => b.unresolved('VatIdCheck', [b.src(`${H}/SellerParty/TaxId`)], { country: 'DE' }));
  fm(`${IH}/Notes`, (b) => b.fn('createIf', [b.fn('exists', [b.src(`${H}/Note`)])]));
  fm(`${IH}/Notes/Note`, (b) => b.src(`${H}/Note`));
  fm(`${IH}/Comment`, (b) => b.fn('ifWithoutElse', [b.fn('equalsS', [b.src(`${H}/Currency`), b.c('USD')]), b.c('Foreign currency')]));
  fm(`${IH}/PaymentDueDays`, (b) => b.src(`${H}/PaymentTerms/DaysNet`));

  fm(IL, (b) => b.src(I));
  fm(`${IL}/@lineId`, (b) => b.src(`${I}/@lineNo`));
  fm(`${IL}/LineNumber`, (b) => b.src(`${I}/@lineNo`));
  fm(`${IL}/ArticleNumber`, (b) => b.src(`${I}/ProductId`));
  // orphaned reference: the structure has Item/Description, not Item/ProductDescription
  fm(`${IL}/ArticleText`, (b) => b.src(`${I}/ProductDescription`));
  fm(`${IL}/InvoicedQuantity`, (b) => b.src(`${I}/Quantity`));
  fm(`${IL}/UnitOfMeasure`, (b) => b.fn('FixValues', [b.src(`${I}/UnitCode`)], { table: { KGM: 'KGM', PCE: 'C62' }, behaviour: 'useDefault' }));
  fm(`${IL}/NetPrice`, (b) => b.src(`${I}/UnitPrice`));
  fm(`${IL}/LineAmount`, (b) => b.fn('multiply', [b.src(`${I}/Quantity`), b.src(`${I}/UnitPrice`)]));
  // fan-out: the DeliveryDate source box feeds exists() and formatDate()
  fm(`${IL}/DeliveryDate`, (b) => {
    const dd = b.src(`${I}/DeliveryDate`);
    return b.fn('if', [b.fn('exists', [dd]), b.fn('formatDate', [dd], { inputPattern: 'yyyy-MM-dd', outputPattern: 'yyyyMMdd' }), b.c('00000000')]);
  });
  // splitByValue (param mode) + collapseContexts + source box with a non-default context (Item, an ancestor)
  fm(`${IL}/FirstScheduleDate`, (b) =>
    b.fn('splitByValue', [b.fn('collapseContexts', [b.src(`${I}/Schedule/Date`, I)])], { mode: 'eachValue' }));
  fm(`${IL}/OrderNumberRef`, (b) =>
    b.fn('useOneAsMany', [b.src(`${H}/OrderNumber`), b.src(`${I}/@lineNo`, S), b.src(`${I}/@lineNo`)]));
  // unconnected input (null)
  fm(`${IL}/Remark`, (b) => b.fn('concat', [b.src(`${I}/Description`), null], { delimiter: ' ' }));
  fm(`${IL}/ScheduleLine`, (b) => b.src(`${I}/Schedule`));
  fm(`${IL}/ScheduleLine/Date`, (b) => b.fn('formatDate', [b.src(`${I}/Schedule/Date`)], { inputPattern: 'yyyy-MM-dd', outputPattern: 'dd.MM.yyyy' }));
  fm(`${IL}/ScheduleLine/Qty`, (b) => b.src(`${I}/Schedule/Quantity`));
  fm(`${IL}/TextLine`, (b) => b.src(`${I}/Text/Line`, I));
  fm(`${IL}/TextLine/Content`, (b) => b.fn('splitByValue', [b.src(`${I}/Text/Line`, I)], { mode: 'eachValue' }));

  fm(`${T}/Totals/LineCount`, (b) => b.fn('count', [b.src(I)]));
  fm(`${T}/Totals/TotalQuantity`, (b) => b.fn('sum', [b.fn('removeContexts', [b.src(`${I}/Quantity`)])]));
  // the largest graph
  fm(`${T}/Totals/TotalAmount`, (b) => {
    const q = b.src(`${I}/Quantity`);
    const p = b.src(`${I}/UnitPrice`);
    const line = b.fn('multiply', [q, p]);
    const total = b.fn('sum', [b.fn('removeContexts', [line])]);
    const usd = b.fn('equalsS', [b.src(`${H}/Currency`), b.c('USD')]);
    const fallback = b.fn('mapWithDefault', [b.src(`${S}/Summary/TotalAmount`)], { default: '0' });
    return b.fn('if', [usd, b.fn('concat', [total, b.c('USD')], { delimiter: ' ' }), b.fn('concat', [total, fallback], { delimiter: '/' })]);
  });

  return {
    formatVersion: 1,
    source: {
      bundle: ['../schemas/purchase-order.xsd'],
      root: { element: `Q{urn:example:po}PurchaseOrder` },
      fingerprint: 'sha256:5e1f0c3a9d2b7e4f6a8c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a'
    },
    target: {
      bundle: ['common-schemas@1.4.0:/invoice/invoice.xsd'],
      root: { element: `Q{urn:example:invoice}Invoice` },
      fingerprint: 'sha256:a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1'
    },
    targetFieldMappings: tfm,
    udfs: {
      normaliseCountry: { executionKind: 'single', inputs: ['code'], source: 'udf/Udfs.java#normaliseCountry' }
    }
  };
}
