package orders;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Random;

/**
 * The seeded input generator of the {@code orders} bench mapping (ADR-0021, #181): sales orders of
 * one to four lines, with invented English names (ADR-0002). The same seed and size give the same
 * bytes on every JDK, because the specification of {@link Random} fixes its algorithm. The input
 * grows by whole orders until it holds at least {@code size} bytes; it is ASCII, so a character is
 * a byte.
 */
public final class OrdersGenerator {

  private static final String[] FIRST_NAMES = {
    "Ada", "Basil", "Cora", "Dale", "Edith", "Felix", "Greta", "Hugo", "Iris", "Jonah", "Kira",
    "Leon"
  };

  private static final String[] LAST_NAMES = {
    "Ashby", "Brookfield", "Calloway", "Dunmore", "Ellwood", "Fairbank", "Garrow", "Hollis"
  };

  private static final String[] WAREHOUSES = {"NORTH", "SOUTH", "EAST", "WEST", "HARBOUR"};

  /** The first order date; every order falls in the 365 days from it. */
  private static final LocalDate FIRST_DAY = LocalDate.of(2026, 1, 1);

  private static final String END = "</SalesOrders>\n";

  private OrdersGenerator() {}

  /**
   * The input of {@code seed}: whole orders, numbered from {@code SO-100001}, until the document
   * holds at least {@code size} bytes.
   */
  public static byte[] generate(long seed, int size) {
    Random random = new Random(seed);
    StringBuilder xml = new StringBuilder(size + 1024);
    xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<SalesOrders>\n");
    for (int number = 1; xml.length() + END.length() < size; number++) {
      order(xml, number, random);
    }
    return xml.append(END).toString().getBytes(UTF_8);
  }

  private static void order(StringBuilder xml, int number, Random random) {
    xml.append("  <Order>\n");
    element(xml, 4, "OrderNo", "SO-" + (100_000 + number));
    element(
        xml,
        4,
        "OrderDate",
        FIRST_DAY.plusDays(random.nextInt(365)).format(DateTimeFormatter.BASIC_ISO_DATE));
    xml.append("    <Buyer>\n");
    element(xml, 6, "FirstName", FIRST_NAMES[random.nextInt(FIRST_NAMES.length)]);
    element(xml, 6, "LastName", LAST_NAMES[random.nextInt(LAST_NAMES.length)]);
    xml.append("    </Buyer>\n");
    int lines = 1 + random.nextInt(4);
    for (int line = 0; line < lines; line++) {
      xml.append("    <Line>\n");
      element(xml, 6, "Sku", "SKU-" + (10_000 + random.nextInt(90_000)));
      element(xml, 6, "Quantity", String.valueOf(1 + random.nextInt(20)));
      // 1.00 to 999.99 as a sender writes it, without trailing zeros: 12.5, 7, 103.25
      element(
          xml,
          6,
          "UnitPrice",
          BigDecimal.valueOf(100 + random.nextInt(99_900), 2).stripTrailingZeros().toPlainString());
      element(xml, 6, "Warehouse", WAREHOUSES[random.nextInt(WAREHOUSES.length)]);
      xml.append("    </Line>\n");
    }
    xml.append("  </Order>\n");
  }

  private static void element(StringBuilder xml, int indent, String name, String value) {
    xml.repeat(' ', indent)
        .append('<')
        .append(name)
        .append('>')
        .append(value)
        .append("</")
        .append(name)
        .append(">\n");
  }
}
