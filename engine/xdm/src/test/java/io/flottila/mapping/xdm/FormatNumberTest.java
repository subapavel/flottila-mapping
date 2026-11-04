package io.flottila.mapping.xdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * F&amp;O 3.1 {@code format-number} over the pictures {@link NumberPattern} writes, as Saxon-HE
 * 12.5 formats (observed, #74): round half to even, leading zeros to the minimum, trailing ones
 * down to it, regular grouping, percent and per mille, and a negative number's sub-picture or a
 * minus sign. In the table a value is in double quotes when it starts with {@code #}.
 */
class FormatNumberTest {

  @ParameterizedTest(name = "{1} over {0} -> {2}")
  @CsvSource(
      delimiter = '|',
      quoteCharacter = '"',
      textBlock =
          """
          7                | 0                   | 7
          2.5              | 0                   | 2
          3.5              | 0                   | 4
          -0.4             | 0                   | -0
          0                | 0                   | 0
          1200             | 0                   | 1200
          7                | 000                 | 007
          1234             | 000                 | 1234
          0                | "#"                 | 0
          0.4              | "#"                 | 0
          123              | "#"                 | 123
          1.5              | 0.00                | 1.50
          0.125            | 0.00                | 0.12
          0.375            | 0.00                | 0.38
          1                | 0.##                | 1
          1.256            | 0.##                | 1.26
          0.004            | 0.##                | 0
          0.00             | 0.0                 | 0.0
          0.5              | "#.00"              | .50
          0                | "#.00"              | .00
          12.3             | "#.00"              | 12.30
          0.5              | .00                 | .50
          3                | "#.##"              | 3.0
          0                | "#.##"              | .0
          0.5              | "#.##"              | .5
          1234567.891      | "#,##0.00"          | 1,234,567.89
          123456           | "#,##0"             | 123,456
          5                | 000,000             | 000,005
          1234             | "#,#"               | 1,2,3,4
          0.125            | 0.#%                | 12.5%
          -0.5             | 0.#%                | -50%
          0.125            | 0‰                  | 125‰
          -1234.5          | "#,##0.00;(#,##0.00)" | (1,234.50)
          1234.5           | "#,##0.00;(#,##0.00)" | 1,234.50
          0                | "#,##0.00;(#,##0.00)" | 0.00
          -3               | EUR #,##0.00        | -EUR 3.00
          5                | 0 o'clock           | 5 o'clock
          """)
  void aNumberIsFormattedAsSaxonFormatsIt(String value, String picture, String formatted) {
    assertThat(FormatNumber.format(new BigDecimal(value), picture)).isEqualTo(formatted);
  }

  @ParameterizedTest
  @ValueSource(strings = {"0x0", "0.0.0", "a;b"})
  void aPictureOutsideTheTranslatedOnesIsRefused(String picture) {
    assertThatThrownBy(() -> FormatNumber.format(BigDecimal.ONE, picture))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage(
            "the picture \"" + picture + "\" is none that a number pattern compiles to (ADR-0003)");
  }
}
