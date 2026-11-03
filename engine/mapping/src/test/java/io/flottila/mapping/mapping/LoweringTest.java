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
import static io.flottila.mapping.mapping.TestStructures.ADDRESS;
import static io.flottila.mapping.mapping.TestStructures.ORDER;
import static io.flottila.mapping.mapping.TestStructures.SKELETON;
import static io.flottila.mapping.mapping.TestStructures.invoice;
import static io.flottila.mapping.mapping.TestStructures.invoiceWithoutNamespace;
import static io.flottila.mapping.mapping.TestStructures.order;
import static io.flottila.mapping.mapping.TestStructures.ref;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.tuple;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetRepeat;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.time.Duration;
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
  void aSourceLeafBelowAStructureFieldLowersWithItsContextDepth() {
    String street = ADDRESS + "/Street";
    List<Name> streetNames = List.of(ORDER_NAME, new Name("", "Address"), new Name("", "Street"));

    // #62: a source leaf at any depth; its context is the parent Address by default, depth 2
    TargetDocument byParent =
        lowered(
            lower(
                orderToOrder(
                    targetFieldMappings(
                        NOTE, targetFieldMapping("t1", "a1", boxes("a1", source(street)))))));
    // any proper ancestor may be the context: the root Order is depth 1
    TargetDocument byRoot =
        lowered(
            lower(
                orderToOrder(
                    targetFieldMappings(
                        NOTE,
                        targetFieldMapping("t1", "a1", boxes("a1", source(street, ORDER)))))));

    assertThat(((TargetSlots) byParent.content().getFirst()).queue())
        .isEqualTo(new SourceQueue(streetNames, 2, id("a1")));
    assertThat(((TargetSlots) byRoot.content().getFirst()).queue())
        .isEqualTo(new SourceQueue(streetNames, 1, id("a1")));
  }

  /**
   * Until #63 this was unsupported-field at t1 (#52 design, O1). Street's parent Address is
   * unmapped and optional (0..1), so it is left out with its subtree: the mapping compiles and
   * Street is never created (ADR-0006 "Target fields").
   */
  @Test
  void aTargetLeafBelowAnUnmappedOptionalParentIsLeftOutWithIt() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ADDRESS + "/Street",
                targetFieldMapping("t1", "a1", boxes("a1", source(ORDER_ID)))));

    // OrderId (1..1) is an unmapped leaf, never created either (ADR-0006: a design-time error
    // that is not built yet)
    assertThat(lowered(lower(model)).content()).isEmpty();
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

  /**
   * The assumed reading of ADR-0022, pinned (#49): when the target root has no namespace, the root
   * has no prefix and {@code ns0} goes to the first namespace in target field order, here {@code
   * urn:v}; the model lists its target field mappings in another order.
   */
  @Test
  void withoutARootNamespaceNs0IsTheFirstNamespaceInTargetFieldOrder() {
    String invoice = "/Invoice";
    MappingModel model =
        model(
            ref(order()),
            ref(invoiceWithoutNamespace()),
            targetFieldMappings(
                invoice + "/Q{urn:u}Number",
                targetFieldMapping("m3", "b3", boxes("b3", source(ORDER_ID))),
                invoice + "/Q{urn:v}Other",
                targetFieldMapping("m4", "b4", boxes("b4", source(ORDER_ID))),
                invoice + "/Plain",
                targetFieldMapping("m1", "b1", boxes("b1", source(ORDER_ID))),
                invoice + "/Q{urn:v}Ref",
                targetFieldMapping("m2", "b2", boxes("b2", source(ORDER_ID)))),
            Map.of());

    TargetDocument document = lowered(Lowering.lower(model, order(), invoiceWithoutNamespace()));

    assertThat(document.prefix()).isEmpty();
    assertThat(document.root()).isEqualTo(new Name("", "Invoice"));
    assertThat(document.content())
        .map(e -> (ElementConstructor) ((TargetSlots) e).body())
        .extracting(ElementConstructor::prefix, ElementConstructor::name)
        .containsExactly(
            tuple("", new Name("", "Plain")),
            tuple("ns0", new Name("urn:v", "Ref")),
            tuple("ns1", new Name("urn:u", "Number")),
            tuple("ns0", new Name("urn:v", "Other")));
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

  /**
   * A target field the target structure lacks is orphaned-reference at its target field mapping.
   */
  @Test
  void aMissingTargetFieldIsAnOrphanedReference() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping("t1", "a1", boxes("a1", source(ORDER_ID))),
                ORDER + "/Missing",
                targetFieldMapping("t2", "a2", boxes("a2", source(QUANTITY)))));

    assertThat(refused(lower(model))).containsExactly(errorAtId("orphaned-reference", "t2"));
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

  /**
   * The root is no field to map, as a source or a target. Since #63 a source structure field lowers
   * to its queue of one {@code ""} per occurrence (a3, ADR-0008), and since #52 the target
   * structure field Address under the root lowers from a source leaf (t4).
   */
  @Test
  void theRootIsUnsupportedFieldAsASourceAndAsATarget() {
    MappingModel model =
        orderToOrder(
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping("t1", "a1", boxes("a1", source(ORDER))),
                ORDER,
                targetFieldMapping("t2", "a2", boxes("a2", source(ORDER_ID))),
                QUANTITY,
                targetFieldMapping("t3", "a3", boxes("a3", source(ADDRESS))),
                ADDRESS,
                targetFieldMapping("t4", "a4", boxes("a4", source(ORDER_ID)))));

    // until #63 a3, the source structure field Address, was unsupported-field too
    assertThat(refused(lower(model)))
        .containsExactly(
            errorAtId("unsupported-field", "a1"), errorAtId("unsupported-field", "t2"));

    TargetDocument document =
        lowered(
            lower(
                orderToOrder(
                    targetFieldMappings(
                        QUANTITY,
                        targetFieldMapping("t3", "a3", boxes("a3", source(ADDRESS))),
                        ORDER_ID,
                        targetFieldMapping("t1", "a1", boxes("a1", source(ORDER_ID)))))));
    assertThat(document.content())
        .map(e -> ((TargetSlots) e).queue())
        .containsExactly(
            new SourceQueue(List.of(ORDER_NAME, new Name("", "OrderId")), 1, false, id("a1")),
            new SourceQueue(List.of(ORDER_NAME, new Name("", "Address")), 1, true, id("a3")));
  }

  // --- target fields at any depth (ADR-0006 since #52): a mapped field under mapped ancestors;
  // the slot and value variables of a field at depth d are slot<d> and value<d>, the root's slot
  // number stays root

  private static final String GRP = "/Doc/Grp";
  private static final String ROW = GRP + "/Row";
  private static final String VAL = ROW + "/Val";
  private static final Name ORDERS_NAME = new Name("", "Orders");
  private static final Name ORDER_ELEMENT = new Name("", "Order");
  private static final Name LINE = new Name("", "Line");

  private static LowerResult lowerNested(Map<String, TargetFieldMapping> mappings) {
    return Lowering.lower(
        model(ref(TestStructures.orders()), ref(TestStructures.nested()), mappings, Map.of()),
        TestStructures.orders(),
        TestStructures.nested());
  }

  /** Grp per Order Id in the root's context, Row per Sku in Order's, Val per Qty in Line's. */
  private static Map<String, TargetFieldMapping> nestedMappings(boolean grp, boolean row) {
    Map<String, TargetFieldMapping> mappings = new java.util.LinkedHashMap<>();
    if (grp) {
      mappings.put(
          GRP, targetFieldMapping("t1", "a1", boxes("a1", source("/Orders/Order/Id", "/Orders"))));
    }
    if (row) {
      mappings.put(
          ROW,
          targetFieldMapping(
              "t2", "a2", boxes("a2", source("/Orders/Order/Line/Sku", "/Orders/Order"))));
    }
    mappings.put(
        VAL, targetFieldMapping("t3", "a3", boxes("a3", source("/Orders/Order/Line/Qty"))));
    return mappings;
  }

  private static VarRef integer(String name, String mapping) {
    return new VarRef(name, AtomicType.INTEGER, id(mapping));
  }

  /**
   * {@code Doc/Grp/Row/Val} with every level mapped: each TargetSlots stands in its parent's
   * element, reads its parent's slot number as its parentSlot and takes its field's effective
   * occurrence; a structure field's element holds its mapped children, a leaf's its value.
   */
  @Test
  void aLeafAtDepthFourLowersUnderItsMappedParents() {
    TargetDocument document = lowered(lowerNested(nestedMappings(true, true)));

    TargetSlots val =
        new TargetSlots(
            new SourceQueue(
                List.of(ORDERS_NAME, ORDER_ELEMENT, LINE, new Name("", "Qty")), 3, id("a3")),
            integer("slot3", "t3"),
            0,
            1,
            "slot4",
            "value4",
            new ElementConstructor(
                "",
                new Name("", "Val"),
                List.of(
                    new TextConstructor(
                        new VarRef("value4", AtomicType.STRING, id("t3")), id("t3"))),
                id("t3")),
            id("t3"));
    TargetSlots row =
        new TargetSlots(
            new SourceQueue(
                List.of(ORDERS_NAME, ORDER_ELEMENT, LINE, new Name("", "Sku")), 2, id("a2")),
            integer("slot2", "t2"),
            1,
            2,
            "slot3",
            "value3",
            new ElementConstructor("", new Name("", "Row"), List.of(val), id("t2")),
            id("t2"));
    TargetSlots grp =
        new TargetSlots(
            new SourceQueue(List.of(ORDERS_NAME, ORDER_ELEMENT, new Name("", "Id")), 1, id("a1")),
            integer("root", "t1"),
            0,
            Long.MAX_VALUE,
            "slot2",
            "value2",
            new ElementConstructor("", new Name("", "Grp"), List.of(row), id("t1")),
            id("t1"));
    assertThat(document)
        .isEqualTo(new TargetDocument("", new Name("", "Doc"), "root", List.of(grp)));
    assertThatCode(() -> IrVerifier.verify(document)).doesNotThrowAnyException();
  }

  /**
   * O1 of the #52 design refused a mapped field under any unmapped parent until #63. Since #63 Val
   * under the unmapped Row (1..2) is still unsupported-field at its target field mapping, because
   * PO requires a mapping for {@code 0 < minOccurs < maxOccurs} (#2 §2). With Grp unmapped too, Grp
   * (0..unbounded) is optional and left out with Row and Val, so the mapping compiles and creates
   * nothing below the root.
   */
  @Test
  void aMappedFieldUnderAnUnmappedParentNeedingAMappingIsUnsupportedField() {
    // witness: with Row mapped the same Val lowers (aLeafAtDepthFourLowersUnderItsMappedParents)
    assertThat(lowerNested(nestedMappings(true, true))).isInstanceOf(Lowered.class);

    assertThat(refused(lowerNested(nestedMappings(true, false))))
        .containsExactly(errorAtId("unsupported-field", "t3"));
    // until #63 this was unsupported-field at t3 too
    assertThat(lowered(lowerNested(nestedMappings(false, false))).content()).isEmpty();
  }

  /**
   * #63: the unmapped Pair (2..2) becomes TargetRepeat of 2 copies under the root's slot number,
   * whose slot-number variable at depth 2 is its child V's parentSlot. Its nodes carry its field
   * path, as no authoring element creates it. The unmapped None (0..0) is left out, and so is X
   * below it, mapped or not.
   */
  @Test
  void anUnmappedNByNStructureFieldLowersToTargetRepeat() {
    Map<String, TargetFieldMapping> mappings =
        targetFieldMappings(
            "/Doc/Pair/V",
            targetFieldMapping("t1", "a1", boxes("a1", source("/Orders/Order/Tag"))),
            "/Doc/None/X",
            targetFieldMapping("t2", "a2", boxes("a2", source("/Orders/Order/Id"))));

    TargetDocument document =
        lowered(
            Lowering.lower(
                model(
                    ref(TestStructures.orders()),
                    ref(TestStructures.repeated()),
                    mappings,
                    Map.of()),
                TestStructures.orders(),
                TestStructures.repeated()));

    AuthoringId pair = new AuthoringId("/Doc/Pair");
    TargetSlots v =
        new TargetSlots(
            new SourceQueue(List.of(ORDERS_NAME, ORDER_ELEMENT, new Name("", "Tag")), 2, id("a1")),
            integer("slot2", "t1"),
            0,
            Long.MAX_VALUE,
            "slot3",
            "value3",
            new ElementConstructor(
                "",
                new Name("", "V"),
                List.of(
                    new TextConstructor(
                        new VarRef("value3", AtomicType.STRING, id("t1")), id("t1"))),
                id("t1")),
            id("t1"));
    assertThat(document.content())
        .containsExactly(
            new TargetRepeat(
                2,
                new VarRef("root", AtomicType.INTEGER, pair),
                "slot2",
                new ElementConstructor("", new Name("", "Pair"), List.of(v), pair),
                pair));
    assertThatCode(() -> IrVerifier.verify(document)).doesNotThrowAnyException();
  }

  /**
   * #63: an unmapped 1..1 Self whose type requires Self again would be created without end.
   * ADR-0008 lets a recursive path repeat one type at most 16 times, so lowering refuses the 17th
   * Self with unsupported-field. No authoring element names an unmapped field, so the diagnostic
   * stands at the model's target structure, {@code /target}. A regression fails on the timeout, not
   * by hanging the build; the lowering takes milliseconds, and 2 s stays below PIT's own timeout,
   * so a mutant without the cap is killed here rather than timed out.
   */
  @Test
  void anUnmappedTypeThatRequiresItselfIsRefusedAtTheRecursionCap() {
    Map<String, TargetFieldMapping> mappings =
        targetFieldMappings(
            "/Doc/Self/V",
            targetFieldMapping("t1", "a1", boxes("a1", source("/Orders/Order/Id", "/Orders"))));

    LowerResult result =
        assertTimeoutPreemptively(
            Duration.ofSeconds(2),
            () ->
                Lowering.lower(
                    model(
                        ref(TestStructures.orders()),
                        ref(TestStructures.selfRequired()),
                        mappings,
                        Map.of()),
                    TestStructures.orders(),
                    TestStructures.selfRequired()));

    assertThat(refused(result))
        .containsExactly(LoadResults.error("unsupported-field", new AtPointer("/target")));
  }

  /** {@code fixDown} with the first {@code downs} Downs mapped, the k-th at /Doc(/Fix/Down)^k. */
  private static LowerResult lowerFixDown(int downs) {
    Map<String, TargetFieldMapping> mappings = new java.util.LinkedHashMap<>();
    for (int k = 1; k <= downs; k++) {
      mappings.put(
          "/Doc" + "/Fix/Down".repeat(k),
          targetFieldMapping("t" + k, "a" + k, boxes("a" + k, source("/Orders/Order/Id"))));
    }
    return Lowering.lower(
        model(ref(TestStructures.orders()), ref(TestStructures.fixDown()), mappings, Map.of()),
        TestStructures.orders(),
        TestStructures.fixDown());
  }

  /**
   * The recursion cap's boundary (ADR-0008, #63): under 15 mapped Downs the deepest unmapped Fix is
   * the 16th field of type /T on its path, which is allowed, so the mapping lowers. Under 16 the
   * deepest Fix is the 17th, refused at /target. The Downs, of the root's type, do not count toward
   * /T, nor does the root.
   */
  @Test
  void theRecursionCapAllowsSixteenRepeatsOfATypeAndRefusesTheSeventeenth() {
    assertThat(lowerFixDown(15)).isInstanceOf(Lowered.class);

    assertThat(refused(lowerFixDown(16)))
        .containsExactly(LoadResults.error("unsupported-field", new AtPointer("/target")));
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
