// PROTOTYPE (#10, throwaway): a small synthetic input instance for the mock evaluator.
// Item 20 has no Schedule and no Text, so its contexts are empty contexts.
export const SAMPLE_INPUT = `<po:PurchaseOrder xmlns:po="urn:example:po" version="3">
  <Header>
    <OrderNumber>4711</OrderNumber>
    <OrderDate>2026-10-30</OrderDate>
    <Currency>USD</Currency>
    <BuyerParty partyId="B-17">
      <Name>Example Buyer Ltd</Name>
      <Address>
        <Street>1 Sample Road</Street>
        <City>Testville</City>
        <CountryCode>deu</CountryCode>
      </Address>
    </BuyerParty>
    <SellerParty>
      <Name>Example Seller Co</Name>
      <TaxId>X123</TaxId>
    </SellerParty>
    <Note>Deliver to gate 2</Note>
    <Note>Call before delivery</Note>
    <PaymentTerms><DaysNet>30</DaysNet></PaymentTerms>
  </Header>
  <Item lineNo="10">
    <ProductId>P-100</ProductId>
    <Description>Bolt</Description>
    <Quantity>4</Quantity>
    <UnitPrice>2.50</UnitPrice>
    <UnitCode>PCE</UnitCode>
    <DeliveryDate>2026-11-05</DeliveryDate>
    <Schedule><Date>2026-11-05</Date><Quantity>2</Quantity></Schedule>
    <Schedule><Date>2026-11-12</Date><Quantity>2</Quantity></Schedule>
    <Text lang="en"><Line>first line</Line><Line>second line</Line></Text>
    <Text lang="de"><Line>dritte Zeile</Line></Text>
  </Item>
  <Item lineNo="20">
    <ProductId>P-200</ProductId>
    <Quantity>1.5</Quantity>
    <UnitPrice>10</UnitPrice>
    <UnitCode>KGM</UnitCode>
  </Item>
  <Item lineNo="30">
    <ProductId>P-300</ProductId>
    <Description>Nut</Description>
    <Quantity>10</Quantity>
    <UnitPrice>0.20</UnitPrice>
    <Schedule><Date>2026-12-01</Date><Quantity>10</Quantity></Schedule>
    <Text lang="en"><Line>only line</Line></Text>
  </Item>
</po:PurchaseOrder>
`;
