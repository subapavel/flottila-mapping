package io.flottila.mapping.mapping;

import static io.flottila.mapping.mapping.LoadResults.errorAtId;
import static io.flottila.mapping.mapping.LoadResults.lowered;
import static io.flottila.mapping.mapping.LoadResults.refused;
import static io.flottila.mapping.mapping.Models.boxes;
import static io.flottila.mapping.mapping.Models.function;
import static io.flottila.mapping.mapping.Models.id;
import static io.flottila.mapping.mapping.Models.inputs;
import static io.flottila.mapping.mapping.Models.model;
import static io.flottila.mapping.mapping.Models.names;
import static io.flottila.mapping.mapping.Models.noParams;
import static io.flottila.mapping.mapping.Models.source;
import static io.flottila.mapping.mapping.Models.targetFieldMapping;
import static io.flottila.mapping.mapping.Models.targetFieldMappings;
import static io.flottila.mapping.mapping.Models.udf;
import static io.flottila.mapping.mapping.Models.udfDeclaration;
import static io.flottila.mapping.mapping.Models.udfs;
import static io.flottila.mapping.mapping.Models.unresolved;
import static io.flottila.mapping.mapping.TestStructures.ORDER;
import static io.flottila.mapping.mapping.TestStructures.SKELETON;
import static io.flottila.mapping.mapping.TestStructures.invoice;
import static io.flottila.mapping.mapping.TestStructures.order;
import static io.flottila.mapping.mapping.TestStructures.ref;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.tuple;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Validation stage 3 and lowering of a field link (ADR-0006, ADR-0011, ADR-0022; #26): a source box
 * reached by {@code result} becomes {@code TargetSlots} over its {@code SourceQueue}; anything else
 * stage 3 meets is a design-time error at the authoring id the architect named. A box {@code
 * result} does not reach is not checked. Target field mappings are walked in target field order.
 */
class LoweringTest {

  private static final String ORDER_ID = ORDER + "/OrderId";
  private static final String QUANTITY = ORDER + "/Quantity";
  private static final String NOTE = ORDER + "/Note";
  private static final String CHANNEL = ORDER + "/@channel";
  private static final Name ORDER_NAME = new Name(SKELETON, "Order");

  private static MappingModel orderToOrder(Map<String, TargetFieldMapping> mappings) {
    return model(ref(order()), ref(order()), mappings, Map.of());
  }

  private static LowerResult lower(MappingModel model) {
    return Lowering.lower(model, order(), order());
  }

  /** {@code OrderId <- OrderId}: the skeleton's field link. */
  private static Map<String, TargetFieldMapping> fieldLink() {
    return targetFieldMappings(
        ORDER_ID, targetFieldMapping("t1", "a1", boxes("a1", source(ORDER_ID))));
  }

  @Test
  void aSourceFieldBoxLowersToTargetSlotsOverItsSourceQueue() {
    TargetDocument document = lowered(lower(orderToOrder(fieldLink())));

    assertThat(document.prefix()).isEqualTo("ns0");
    assertThat(document.root()).isEqualTo(ORDER_NAME);
    assertThat(document.content()).hasSize(1).first().isInstanceOf(TargetSlots.class);
    TargetSlots slots = (TargetSlots) document.content().getFirst();
    // the field by its element steps, the context (the parent Order) by its depth
    assertThat(slots.queue())
        .isEqualTo(new SourceQueue(List.of(ORDER_NAME, new Name("", "OrderId")), 1, id("a1")));
    assertThat(slots.parentSlot())
        .isInstanceOfSatisfying(
            VarRef.class,
            parent -> {
              assertThat(parent.name()).isEqualTo(document.rootSlot());
              assertThat(parent.type()).isEqualTo(AtomicType.INTEGER);
            });
    assertThat(slots.origin()).isEqualTo(id("t1"));
    assertThat(slots.body())
        .isInstanceOfSatisfying(
            ElementConstructor.class,
            element -> {
              assertThat(element.prefix()).isEmpty();
              assertThat(element.name()).isEqualTo(new Name("", "OrderId"));
              assertThat(element.origin()).isEqualTo(id("t1"));
              assertThat(element.content())
                  .singleElement()
                  .isInstanceOfSatisfying(
                      TextConstructor.class,
                      text -> {
                        assertThat(text.origin()).isEqualTo(id("t1"));
                        assertThat(text.value())
                            .isInstanceOfSatisfying(
                                VarRef.class,
                                value -> {
                                  assertThat(value.name()).isEqualTo(slots.valueVar());
                                  assertThat(value.type()).isEqualTo(AtomicType.STRING);
                                });
                      });
            });
    assertThatCode(() -> IrVerifier.verify(document)).doesNotThrowAnyException();

    // the parent named as the context explicitly is the same queue
    TargetDocument explicit =
        lowered(
            lower(
                orderToOrder(
                    targetFieldMappings(
                        ORDER_ID,
                        targetFieldMapping("t1", "a1", boxes("a1", source(ORDER_ID, ORDER)))))));
    assertThat(((TargetSlots) explicit.content().getFirst()).queue()).isEqualTo(slots.queue());
  }

  @Test
  void targetSlotsTakeTheEffectiveOccurrence() {
    TargetDocument document =
        lowered(
            lower(
                orderToOrder(
                    targetFieldMappings(
                        NOTE,
                        targetFieldMapping("t3", "a3", boxes("a3", source(NOTE))),
                        QUANTITY,
                        targetFieldMapping("t2", "a2", boxes("a2", source(QUANTITY))),
                        ORDER_ID,
                        targetFieldMapping("t1", "a1", boxes("a1", source(ORDER_ID)))))));

    // in target field order; Note is 0..unbounded
    assertThat(document.content())
        .map(e -> (TargetSlots) e)
        .extracting(
            s -> ((ElementConstructor) s.body()).name().localName(),
            TargetSlots::min,
            TargetSlots::max)
        .containsExactly(
            tuple("OrderId", 1L, 1L), tuple("Quantity", 0L, 1L), tuple("Note", 0L, Long.MAX_VALUE));
  }

  @Test
  void prefixesFollowTheTargetNamespaces() {
    String invoice = "/Q{urn:t}Invoice";
    MappingModel model =
        model(
            ref(order()),
            ref(invoice()),
            targetFieldMappings(
                invoice + "/Q{urn:u}Other",
                targetFieldMapping("m5", "b5", boxes("b5", source(ORDER_ID))),
                invoice + "/Q{urn:t}Same",
                targetFieldMapping("m4", "b4", boxes("b4", source(ORDER_ID))),
                invoice + "/Q{urn:v}Ref",
                targetFieldMapping("m3", "b3", boxes("b3", source(ORDER_ID))),
                invoice + "/Plain",
                targetFieldMapping("m2", "b2", boxes("b2", source(ORDER_ID))),
                invoice + "/Q{urn:u}Number",
                targetFieldMapping("m1", "b1", boxes("b1", source(ORDER_ID)))),
            Map.of());

    TargetDocument document = lowered(Lowering.lower(model, order(), invoice()));

    // the root's namespace is ns0, each further one ns1, ns2 ... in target field order; none: ""
    assertThat(document.prefix()).isEqualTo("ns0");
    assertThat(document.root()).isEqualTo(new Name("urn:t", "Invoice"));
    assertThat(document.content())
        .map(e -> (ElementConstructor) ((TargetSlots) e).body())
        .extracting(ElementConstructor::prefix, ElementConstructor::name)
        .containsExactly(
            tuple("ns1", new Name("urn:u", "Number")),
            tuple("", new Name("", "Plain")),
            tuple("ns2", new Name("urn:v", "Ref")),
            tuple("ns0", new Name("urn:t", "Same")),
            tuple("ns1", new Name("urn:u", "Other")));
  }

  @Test
  void aReachedFunctionOrUdfBoxIsUnsupportedBoxKindAtTheBox() {
    MappingModel model =
        model(
            ref(order()),
            ref(order()),
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping(
                    "t1",
                    "f1",
                    boxes(
                        "f1", function("trim", inputs("a1"), noParams()), "a1", source(ORDER_ID))),
                QUANTITY,
                targetFieldMapping(
                    "t2",
                    "u1",
                    boxes("u1", udf("twice", inputs("a2"), noParams()), "a2", source(QUANTITY)))),
            udfs(
                "twice",
                udfDeclaration(
                    ExecutionKind.SINGLE, names("value"), Map.of(), "udfs/Numbers.java#twice")));

    assertThat(refused(lower(model)))
        .containsExactly(
            errorAtId("unsupported-box-kind", "f1"), errorAtId("unsupported-box-kind", "u1"));
  }

  @Test
  void aReachedUnresolvedBoxIsUnresolvedFunctionAtTheBox() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping(
                    "t1",
                    "r1",
                    boxes(
                        "r1",
                        unresolved("FormatNum", Origin.PO, inputs("a1"), noParams()),
                        "a1",
                        source(ORDER_ID)))));

    assertThat(refused(lower(model))).containsExactly(errorAtId("unresolved-function", "r1"));
  }

  @Test
  void anEmptyResultIsUnconnectedTargetFieldAtTheMapping() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID, targetFieldMapping("t1", null, boxes("a1", source(ORDER_ID)))));

    assertThat(refused(lower(model))).containsExactly(errorAtId("unconnected-target-field", "t1"));
  }

  @Test
  void anUnreachableNonSourceBoxIsNotRefused() {
    MappingModel model =
        model(
            ref(order()),
            ref(order()),
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping(
                    "t1",
                    "a1",
                    boxes(
                        "a1",
                        source(ORDER_ID),
                        "f9",
                        function("trim", inputs("a1"), noParams()),
                        "u9",
                        udf("twice", inputs("a1"), noParams()),
                        "r9",
                        unresolved("FormatNum", Origin.PO, inputs("a1"), noParams()),
                        // not checked either: its field does not exist
                        "s9",
                        source(ORDER + "/Missing")))),
            udfs(
                "twice",
                udfDeclaration(
                    ExecutionKind.SINGLE, names("value"), Map.of(), "udfs/Numbers.java#twice")));

    TargetDocument document = lowered(lower(model));

    assertThat(document.content())
        .singleElement()
        .isInstanceOfSatisfying(
            TargetSlots.class,
            slots ->
                assertThat(slots.queue())
                    .isEqualTo(
                        new SourceQueue(
                            List.of(ORDER_NAME, new Name("", "OrderId")), 1, id("a1"))));
  }

  @Test
  void aMissingSourceFieldIsAnOrphanedReference() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping("t1", "a1", boxes("a1", source(ORDER + "/OrderNumber"))),
                QUANTITY,
                targetFieldMapping(
                    "t2", "a2", boxes("a2", source("/Q{urn:other}Order/Quantity")))));

    assertThat(refused(lower(model)))
        .containsExactly(
            errorAtId("orphaned-reference", "a1"), errorAtId("orphaned-reference", "a2"));
  }

  @Test
  void anAttributeFieldIsUnsupportedField() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping("t1", "a1", boxes("a1", source(CHANNEL))),
                CHANNEL,
                targetFieldMapping("t2", "a2", boxes("a2", source(ORDER_ID)))));

    // a source field at its box, a target field at its target field mapping
    assertThat(refused(lower(model)))
        .containsExactly(
            errorAtId("unsupported-field", "a1"), errorAtId("unsupported-field", "t2"));
  }

  @Test
  void aStructureFieldIsUnsupportedField() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping("t1", "a1", boxes("a1", source(ORDER))),
                ORDER,
                targetFieldMapping("t2", "a2", boxes("a2", source(ORDER_ID)))));

    // the root is no leaf element under the root
    assertThat(refused(lower(model)))
        .containsExactly(
            errorAtId("unsupported-field", "a1"), errorAtId("unsupported-field", "t2"));
  }

  @Test
  void stage3ReportsEveryDiagnosticSorted() {
    // target field order meets f2, t1, a1; the report is sorted by location
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping(
                    "t3",
                    "f2",
                    boxes(
                        "f2", function("trim", inputs("a5"), noParams()), "a5", source(ORDER_ID))),
                QUANTITY,
                targetFieldMapping("t1", null, boxes("a6", source(QUANTITY))),
                NOTE,
                targetFieldMapping("t2", "a1", boxes("a1", source(ORDER + "/Missing")))));

    assertThat(refused(lower(model)))
        .containsExactly(
            errorAtId("orphaned-reference", "a1"),
            errorAtId("unsupported-box-kind", "f2"),
            errorAtId("unconnected-target-field", "t1"));
  }
}
