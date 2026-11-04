# obs-date

Notation, what to return and the ESR / CPI naming: `../README.md`. Source: `src-orders.xsd` (root
`Orders`). Target: `tgt-list.xsd` (root `Out`). The one request of the date family (spec #70,
#80). Every mapping maps N1 -> `Out/All`; S1 is `Orders/Order/Line/Sku` and S2
`Orders/Order/Line/Qty`, both with context `Orders`, so All has one value per Line. One run of an
input answers every case that names it. Each case id is a directory under `corpus/cases/`.

Say for each system the JVM's default time zone (it is the zone a date without an offset is read
in, and the zone every date is written in), and whether the date functions parse leniently: our
reading (ADR-0003) is a strict parse in the run's time zone, which a SimpleDateFormat parses only
with lenient off.

## Mapping date-trans-nnn (dateTrans)

One mapping per row below; only the two formats change.

| Box | Function | Inputs |
| --- | --- | --- |
| S1 | source | `Orders/Order/Line/Sku` with context `Orders` |
| N1 | `DateTrans{sourceFormat, targetFormat}`, the formats of the row | in1 = S1 |

Target wire: N1 -> `Out/All`.

| Case | Input | Formats | Question it decides and the assumed reading |
| --- | --- | --- | --- |
| `fn/dateTrans/001` | `dateTrans-001.xml` | `yyyyMMdd` to `dd.MM.yyyy` | 20261104, 20240229, 19991231, 00010101: the date read in the source format is written in the target format. Ours: 04.11.2026, 29.02.2024, 31.12.1999, 01.01.0001. |
